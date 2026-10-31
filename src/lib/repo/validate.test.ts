import { describe, expect, it } from 'vitest';
import { SNAPSHOT_VERSION } from '../model';
import { seed } from './mock';
import { starter } from './starter';
import { ImportError, parseBackup, parseExport, parseSession } from './validate';

const roundTrip = (s: unknown) => parseBackup(JSON.stringify(s));

describe('parseBackup', () => {
  it('accepts its own exports unchanged', () => {
    const sample = seed(new Date('2026-10-26T12:00:00Z'));
    expect(roundTrip(sample)).toEqual(JSON.parse(JSON.stringify(sample)));
    expect(roundTrip(starter())).toEqual(starter());
  });

  it('never copies unknown keys, including __proto__', () => {
    const text = JSON.stringify(starter()).replace(`{"version":${SNAPSHOT_VERSION},`, `{"version":${SNAPSHOT_VERSION},"__proto__":{"polluted":true},"extra":1,`);
    const out = parseBackup(text) as unknown as Record<string, unknown>;
    expect(Object.hasOwn(out, 'extra')).toBe(false);
    expect(Object.hasOwn(out, '__proto__')).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('checks gym locations', () => {
    const s = starter();
    s.gyms[0].location = { lat: 47.37, lng: 8.54, radiusM: 200 };
    expect(roundTrip(s).gyms[0].location).toEqual({ lat: 47.37, lng: 8.54, radiusM: 200 });
    s.gyms[0].location = { lat: 95, lng: 8.54, radiusM: 200 };
    expect(() => roundTrip(s)).toThrow('gyms[0].location.lat: must be between -90 and 90');
  });

  it('fills settings added after a backup was made', () => {
    const s = starter() as unknown as { settings: Record<string, unknown> };
    delete s.settings.detectGym;
    delete s.settings.keepScreenOn;
    delete s.settings.soundVolume;
    delete s.settings.pauseMusic;
    expect(roundTrip(s).settings.detectGym).toBe(true);
    expect(roundTrip(s).settings.keepScreenOn).toBe(false);
    expect(roundTrip(s).settings.soundVolume).toBe(0.8);
    expect(roundTrip(s).settings.pauseMusic).toBe(true);
  });

  it('reads planned drop sets and checks them', () => {
    const s = starter();
    s.routines = [{ id: 'r', name: 'R', blocks: [{ id: 'b', items: [{
      exerciseId: s.exercises[0].id, warmup: 'none', restSec: 90, progression: { kind: 'none' },
      scheme: { kind: 'straight', sets: 3, repsMin: 8, repsMax: 12, rir: 2, drops: 2, dropPct: 25, dropRestSec: 5 },
    }] }] }];
    expect(roundTrip(s).routines[0].blocks[0].items[0].scheme).toEqual(s.routines[0].blocks[0].items[0].scheme);
    const scheme = s.routines[0].blocks[0].items[0].scheme;
    if (scheme.kind === 'straight') scheme.dropPct = 90;
    expect(() => roundTrip(s)).toThrow('dropPct: must be between 5 and 60');
  });

  it('turns planned myo-reps from older versions into straight sets and keeps logged myo sets', () => {
    const s = structuredClone(seed()) as unknown as { version: number; routines: { blocks: { items: { scheme: unknown }[] }[] }[]; sessions: { blocks: { items: { sets: { type: string }[] }[] }[] }[] };
    s.version = 5;
    s.routines[0].blocks[0].items[0].scheme = { kind: 'myo', activationMin: 15, activationMax: 12, miniReps: 4, maxMinis: 4, restSec: 15 };
    s.sessions[0].blocks[0].items[0].sets[0].type = 'mini';
    const back = roundTrip(s);
    expect(back.routines[0].blocks[0].items[0].scheme).toEqual({ kind: 'straight', sets: 3, repsMin: 12, repsMax: 15, rir: 1 });
    expect(back.sessions[0].blocks[0].items[0].sets[0].type).toBe('mini');
  });

  it('checks the beep volume', () => {
    const s = starter();
    s.settings.soundVolume = 0.5;
    expect(roundTrip(s).settings.soundVolume).toBe(0.5);
    s.settings.soundVolume = 3;
    expect(() => roundTrip(s)).toThrow('settings.soundVolume: must be between 0.1 and 1');
    (s.settings as unknown as Record<string, unknown>).soundVolume = '1';
    expect(() => roundTrip(s)).toThrow('settings.soundVolume: expected a number');
  });

  it('lets machines and cables in older routines use their own step instead of the old +2.5 kg default', () => {
    const s = seed(new Date('2026-10-26T12:00:00Z'));
    const items = s.routines.flatMap((r) => r.blocks.flatMap((b) => b.items));
    const item = (id: string) => items.find((it) => it.exerciseId === id)!;
    item('legpress').progression = { kind: 'double', increment: 2.5 };
    item('pulldown').progression = { kind: 'linear', increment: 5 };
    const v2 = { ...s, version: 2 };
    const out = roundTrip(v2).routines.flatMap((r) => r.blocks.flatMap((b) => b.items));
    const got = (id: string) => out.find((it) => it.exerciseId === id)!.progression;
    expect(got('legpress')).toEqual({ kind: 'double', increment: 0 });
    expect(got('pulldown')).toEqual({ kind: 'linear', increment: 5 });
    expect(got('squat')).toEqual({ kind: 'linear', increment: 2.5 });
    expect(parseExport(JSON.stringify(v2)).routines.flatMap((r) => r.blocks.flatMap((b) => b.items))
      .find((it) => it.exerciseId === 'legpress')!.progression).toEqual({ kind: 'double', increment: 0 });
    // Data already at version 3 keeps an explicit +2.5 kg.
    expect(roundTrip(s).routines.flatMap((r) => r.blocks.flatMap((b) => b.items))
      .find((it) => it.exerciseId === 'legpress')!.progression).toEqual({ kind: 'double', increment: 2.5 });
  });

  it('checks machine steps in gym setups', () => {
    const s = starter();
    s.setups.push({ gymId: 'gym', exerciseId: 'squat', note: '', increment: 2.5 });
    expect(roundTrip(s).setups[0].increment).toBe(2.5);
    delete s.setups[0].increment;
    expect(Object.hasOwn(roundTrip(s).setups[0], 'increment')).toBe(false);
    s.setups[0].increment = 0;
    expect(() => roundTrip(s)).toThrow('setups[0].increment: must be between 0.1 and 100');
  });

  it('names the path of a bad value', () => {
    const s = starter() as unknown as { gyms: { bar: unknown }[] };
    s.gyms[0].bar = '20';
    expect(() => roundTrip(s)).toThrow(new ImportError('gyms[0].bar: expected a number'));
  });

  it('rejects broken references, duplicates and unknown enum values', () => {
    const s = seed(new Date('2026-10-26T12:00:00Z'));
    s.sessions[0].gymId = 'nowhere';
    expect(() => roundTrip(s)).toThrow(/sessions\[0\]\.gymId: unknown gym "nowhere"/);

    const d = starter();
    d.exercises.push({ ...d.exercises[0] });
    expect(() => roundTrip(d)).toThrow(/exercises: duplicate id "squat"/);

    const c = starter() as unknown as { gyms: { color: string }[] };
    c.gyms[0].color = 'url(javascript:alert(1))';
    expect(() => roundTrip(c)).toThrow(/gyms\[0\]\.color: expected one of/);
  });

  it('rejects non-JSON, non-objects, non-finite numbers and newer versions', () => {
    expect(() => parseBackup('<html>')).toThrow('not valid JSON');
    expect(() => parseBackup('[]')).toThrow('file: expected an object');
    expect(() => parseBackup(JSON.stringify(starter()).replace('"bar":20', '"bar":1e999'))).toThrow('gyms[0].bar: expected a number');
    expect(() => roundTrip({ ...starter(), version: 99 })).toThrow('newer version');
  });
});

describe('parseExport', () => {
  const sample = () => seed(new Date('2026-10-26T12:00:00Z'));

  it('accepts a partial file with only some sections', () => {
    const s = sample();
    const routine = s.routines[0];
    const used = new Set(routine.blocks.flatMap((b) => b.items.map((i) => i.exerciseId)));
    const file = parseExport(JSON.stringify({
      kratos: 'export', version: 1, routines: [routine], exercises: s.exercises.filter((e) => used.has(e.id)),
    }));
    expect(file.routines).toHaveLength(1);
    expect(file.sessions).toEqual([]);
    expect(file.gyms).toEqual([]);
  });

  it('accepts a full backup and ignores its settings', () => {
    const file = parseExport(JSON.stringify(sample())) as unknown as Record<string, unknown>;
    expect(Object.hasOwn(file, 'settings')).toBe(false);
    expect((file.sessions as unknown[]).length).toBeGreaterThan(0);
  });

  it('requires referenced exercises and gyms to be in the file', () => {
    const s = sample();
    expect(() => parseExport(JSON.stringify({ routines: [s.routines[0]] })))
      .toThrow(/routines\[0\]\.blocks\[0\]\.items\[0\]\.exerciseId: unknown exercise "squat"/);
    expect(() => parseExport(JSON.stringify({ exercises: s.exercises, sessions: [s.sessions[0]] })))
      .toThrow(/sessions\[0\]\.gymId: unknown gym/);
  });

  it('rejects empty files and never copies unknown keys', () => {
    expect(() => parseExport('{"kratos":"export","version":1}')).toThrow(/no routines, exercises/);
    const out = parseExport('{"__proto__":{"polluted":true},"body":[{"date":"2026-01-01","weight":80,"__proto__":{"x":1}}]}');
    expect(out.body).toEqual([{ date: '2026-01-01', weight: 80 }]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('timed exercises in files', () => {
  it('accepts timed schemes and durations, and checks their ranges', () => {
    const s = seed(new Date('2026-10-26T12:00:00Z'));
    const back = roundTrip(s);
    expect(back.exercises.find((e) => e.id === 'plank')?.measure).toBe('time');
    expect(back.routines.find((r) => r.id === 'pull')!.blocks.at(-1)!.items[0].scheme.kind).toBe('timed');
    expect(back.sessions.some((x) => x.blocks.some((b) => b.items.some((i) => i.sets.some((st) => (st.durationSec ?? 0) > 0))))).toBe(true);
    const bad = JSON.parse(JSON.stringify(s));
    bad.routines.find((r: { id: string }) => r.id === 'pull').blocks.at(-1).items[0].scheme.secMax = 99999;
    expect(() => roundTrip(bad)).toThrow(/scheme\.secMax: must be between 1 and 3600/);
  });
});


describe('archived routines and exercises', () => {
  it('keeps the archived flag and drops a false one', () => {
    const s = seed(new Date('2026-10-26T12:00:00Z'));
    s.routines[0].archived = true;
    s.exercises[0].archived = true;
    const back = roundTrip({ ...s, routines: s.routines.map((r, i) => (i === 1 ? { ...r, archived: false } : r)) });
    expect(back.routines[0].archived).toBe(true);
    expect(Object.hasOwn(back.routines[1], 'archived')).toBe(false);
    expect(back.exercises[0].archived).toBe(true);
  });

  it('rejects a non-boolean flag', () => {
    const s = JSON.parse(JSON.stringify(seed(new Date('2026-10-26T12:00:00Z'))));
    s.routines[0].archived = '<img src=x onerror=alert(1)>';
    expect(() => roundTrip(s)).toThrow(/routines\[0\]\.archived/);
  });

  it('reads version 1 files, which had no archived routines', () => {
    const back = roundTrip({ ...seed(new Date('2026-10-26T12:00:00Z')), version: 1 });
    expect(back.version).toBe(SNAPSHOT_VERSION);
    expect(back.routines.every((r) => !r.archived)).toBe(true);
  });
});

describe('data the screens rely on', () => {
  const withSession = (edit: (s: ReturnType<typeof seed>['sessions'][number]) => void) => {
    const snap = seed(new Date('2026-10-26T12:00:00Z'));
    edit(snap.sessions[0]);
    return snap;
  };

  it('stores every workout start as ISO text, so sorting by text is by time', () => {
    const snap = seed(new Date('2026-10-26T12:00:00Z'));
    snap.sessions[0].startedAt = 'Tue, 27 Oct 2026 08:00:00 GMT';
    snap.sessions[1].startedAt = '2026-10-27T09:00:00+02:00';
    const out = roundTrip(snap);
    expect(out.sessions[0].startedAt).toBe('2026-10-27T08:00:00.000Z');
    expect(out.sessions[1].startedAt).toBe('2026-10-27T07:00:00.000Z');
    expect(out.sessions.every((s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s.startedAt))).toBe(true);
    expect(() => roundTrip(withSession((s) => { s.startedAt = '+275760-01-01T00:00:00Z'; }))).toThrow('startedAt');
  });

  it('gives repeated block and set ids in a workout fresh ones', () => {
    const snap = withSession((s) => {
      s.blocks[1].id = s.blocks[0].id;
      s.blocks[1].items[0].sets[0].id = s.blocks[0].items[0].sets[0].id;
    });
    const s = roundTrip(snap).sessions.find((x) => x.id === snap.sessions[0].id)!;
    const blockIds = s.blocks.map((b) => b.id);
    const setIds = s.blocks.flatMap((b) => b.items.flatMap((it) => it.sets.map((x) => x.id)));
    expect(new Set(blockIds).size).toBe(blockIds.length);
    expect(new Set(setIds).size).toBe(setIds.length);
    expect(s.blocks[0].id).toBe(snap.sessions[0].blocks[0].id);
  });

  it('gives a gym without plates the usual ones', () => {
    const s = starter();
    s.gyms[0].plates = [];
    expect(roundTrip(s).gyms[0].plates.length).toBeGreaterThan(0);
  });
});

describe('parseSession', () => {
  it('refuses a workout the app could not load back', () => {
    const snap = seed(new Date('2026-10-26T12:00:00Z'));
    const s = structuredClone(snap.sessions[0]);
    expect(parseSession(s, snap).id).toBe(s.id);
    s.blocks[0].items[0].sets[0].weight = 2002.5;
    expect(() => parseSession(s, snap)).toThrow('must be between 0 and 2000');
    const many = structuredClone(snap.sessions[0]);
    many.blocks[0].items[0].sets = Array.from({ length: 101 }, (_, i) => ({ id: `s${i}`, type: 'working', weight: 20, reps: 5, done: true }));
    expect(() => parseSession(many, snap)).toThrow('more than 100 entries');
  });
});
