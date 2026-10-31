import { describe, expect, it } from 'vitest';
import { seed } from '../repo/mock';
import { starter } from '../repo/starter';
import { parseExport } from '../repo/validate';
import { buildExport, isEmpty, planMerge, type MergePick } from './merge';

const ALL: MergePick = { routines: true, exercises: true, sessions: true, body: true };
const sample = () => seed(new Date('2026-10-26T12:00:00Z'));
let n = 0;
const newId = () => `new-${n++}`;

/** Round-trip through JSON and the import parser, as a real file would. */
const asFile = (x: unknown) => parseExport(JSON.stringify(x));

describe('buildExport', () => {
  it('exports one routine with only the exercises it uses', () => {
    const s = sample();
    const file = buildExport(s, { routineIds: ['upperA'] });
    expect(file.routines.map((r) => r.name)).toEqual(['3-day split > Upper A']);
    expect(file.exercises.map((e) => e.id).sort()).toEqual(['bench', 'incdb', 'lateral', 'pulldown', 'pushdown', 'row']);
    expect(file.sessions).toEqual([]);
    expect(file.gyms).toEqual([]);
    expect(() => asFile(file)).not.toThrow();
  });

  it('exports workouts with their gyms and the setups for them', () => {
    const file = buildExport(sample(), { sessions: true, body: true });
    expect(new Set(file.gyms.map((g) => g.id))).toEqual(new Set(file.sessions.map((s) => s.gymId)));
    expect(file.setups.length).toBeGreaterThan(0);
    expect(Object.hasOwn(file, 'settings')).toBe(false);
  });
});

describe('planMerge', () => {
  it('adds a shared routine, reusing exercises with the same name', () => {
    const current = starter();
    const file = asFile(buildExport(sample(), { routineIds: ['lowerA'] }));
    // Make the incoming ids differ from the starter ids, as they would coming from another device.
    for (const e of file.exercises) e.id = `x-${e.id}`;
    for (const b of file.routines[0].blocks) for (const it of b.items) it.exerciseId = `x-${it.exerciseId}`;

    const { next, summary } = planMerge(current, file, ALL, newId);
    expect(summary.routinesAdded).toEqual(['3-day split > Lower A']);
    // The built-in library has no calf raise, so that one is added; the rest match by name.
    expect(summary.exercisesMatched).toBe(4);
    expect(summary.exercisesAdded).toEqual(['Calf raise (standing machine)']);
    const routine = next.routines.find((r) => r.name === '3-day split > Lower A')!;
    const ids = routine.blocks.flatMap((b) => b.items.map((i) => i.exerciseId));
    expect(ids).toEqual(['squat', 'rdl', 'legpress', 'legcurl', 'x-calf']);
  });

  it('adds exercises it does not know and gives a new id when the id is taken', () => {
    const current = starter();
    const file = asFile({
      exercises: [
        { id: 'squat', name: 'Zercher squat', muscles: ['quads'], equipment: 'barbell', gymSpecific: false },
        { id: 'z1', name: '  SQUAT   (barbell) ', muscles: ['quads'], equipment: 'barbell', gymSpecific: false },
      ],
    });
    const { next, summary } = planMerge(current, file, ALL, newId);
    expect(summary.exercisesAdded).toEqual(['Zercher squat']);
    expect(summary.exercisesMatched).toBe(1);
    const zercher = next.exercises.find((e) => e.name === 'Zercher squat')!;
    expect(zercher.id).toMatch(/^new-/);
    expect(next.exercises.find((e) => e.id === 'squat')!.name).toBe('Squat (barbell)');
  });

  it('imports workouts with their gyms, mapping ids and routine links', () => {
    const current = starter();
    const file = asFile(buildExport(sample(), { sessions: true, routines: true }));
    const { next, summary } = planMerge(current, file, ALL, newId);
    expect(summary.sessionsAdded).toBe(file.sessions.length);
    expect(summary.gymsAdded.sort()).toEqual(['Home garage', 'Iron District', 'Office gym']);
    const gymIds = new Set(next.gyms.map((g) => g.id));
    const exIds = new Set(next.exercises.map((e) => e.id));
    for (const s of next.sessions) {
      expect(gymIds.has(s.gymId)).toBe(true);
      for (const it of s.blocks.flatMap((b) => b.items)) expect(exIds.has(it.exerciseId)).toBe(true);
      if (s.routineId) expect(next.routines.some((r) => r.id === s.routineId)).toBe(true);
    }
    expect(summary.setupsAdded).toBeGreaterThan(0);
    expect(next.setups.find((s) => s.note.startsWith('Hammer Strength'))?.increment).toBe(10);
    // The merged data is a valid backup.
    expect(() => parseExport(JSON.stringify(next))).not.toThrow();
  });

  it('matches gyms by name and keeps workouts at the gym they were recorded at', () => {
    const current = starter();
    current.gyms[0].name = 'iron district';
    const file = asFile(buildExport(sample(), { sessions: true }));
    const { next, summary } = planMerge(current, file, ALL, newId);
    expect(summary.gymsAdded).not.toContain('Iron District');
    const fromIron = file.sessions.filter((s) => s.gymId === 'iron').map((s) => s.id);
    for (const s of next.sessions.filter((x) => fromIron.includes(x.id))) expect(s.gymId).toBe('gym');
  });

  it('skips what is already there, so importing twice adds nothing', () => {
    const file = asFile(buildExport(sample(), { routines: true, exercises: true, sessions: true, body: true }));
    const once = planMerge(starter(), file, ALL, newId).next;
    const { next, summary } = planMerge(once, file, ALL, newId);
    expect(isEmpty(summary)).toBe(true);
    expect(summary.routinesSkipped.length).toBe(file.routines.length);
    expect(summary.sessionsSkipped).toBe(file.sessions.length);
    expect(summary.bodySkipped).toBe(file.body.length);
    expect(next).toEqual(once);
  });

  it('only takes the picked sections', () => {
    const file = asFile(buildExport(sample(), { routines: true, exercises: true, sessions: true, body: true }));
    const { next, summary } = planMerge(starter(), file, { routines: false, exercises: false, sessions: false, body: true }, newId);
    expect(next.routines).toEqual([]);
    expect(next.sessions).toEqual([]);
    expect(summary.exercisesAdded).toEqual([]);
    expect(summary.bodyAdded).toBe(file.body.length);
  });

  it('does not modify its inputs', () => {
    const current = starter();
    const file = asFile(buildExport(sample(), { sessions: true, routines: true, body: true }));
    const before = JSON.stringify([current, file]);
    planMerge(current, file, ALL, newId);
    expect(JSON.stringify([current, file])).toBe(before);
  });
});

describe('planMerge with deleted exercises', () => {
  it('brings back an exercise you deleted when a file uses it', () => {
    const current = starter();
    current.exercises.find((e) => e.id === 'squat')!.archived = true;
    const file = asFile(buildExport(sample(), { routineIds: ['lowerA'] }));
    const { next } = planMerge(current, file, ALL, newId);
    expect(next.exercises.find((e) => e.id === 'squat')!.archived).toBeUndefined();
  });
});

describe('limits', () => {
  it('reports a merge that would hold more workouts than load', () => {
    const current = sample();
    const file = asFile(buildExport(sample(), { sessions: true }));
    const extra = file.sessions[0];
    file.sessions = Array.from({ length: 20_000 }, (_, i) => ({ ...extra, id: `x${i}`, startedAt: new Date(Date.UTC(2001, 0, 1) + i * 60_000).toISOString() }));
    const { overLimit } = planMerge(current, file, ALL, newId);
    expect(overLimit).toMatch(/more than the 20000/);
    expect(planMerge(current, asFile(buildExport(sample(), { sessions: true })), ALL, newId).overLimit).toBe('');
  });
});
