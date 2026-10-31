import { describe, expect, it } from 'vitest';
import type { LoggedSet, PlannedExercise, Session, SessionExercise } from '../model';
import { formatRest, restAfter, restCues, upNext, type RestContext } from './rest';

let n = 0;
const set = (type: LoggedSet['type'], reps = 8, done = true): LoggedSet => ({ id: String(n++), type, weight: 50, reps, done });

const plan = (restSec: number): PlannedExercise => ({
  exerciseId: 'x', warmup: 'none', restSec, progression: { kind: 'none' },
  scheme: { kind: 'straight', sets: 3, repsMin: 8, repsMax: 12, rir: 2 },
});

const item = (exerciseId: string, sets: LoggedSet[], p?: PlannedExercise): SessionExercise => ({ exerciseId, sets, plan: p });

const ctx: RestContext = {
  name: (id) => ({ a: 'Row', b: 'Incline press', c: 'Curl' })[id] ?? id,
  exerciseRest: (id) => (id === 'c' ? 45 : undefined),
  defaultRest: 120,
};

const session = (blocks: Session['blocks']): Session =>
  ({ id: 's', name: 's', startedAt: '2026-01-01', durationMin: 0, gymId: 'g', blocks });

describe('restAfter', () => {
  it('uses the workout rest, then the exercise default, then the app default', () => {
    const s = session([
      { id: '1', items: [item('a', [set('working')], plan(150))] },
      { id: '2', items: [item('c', [set('working')])] },
      { id: '3', items: [item('b', [set('working')])] },
    ]);
    expect(restAfter(s, 0, 0, s.blocks[0].items[0].sets[0], ctx)).toEqual({ sec: 150, label: 'Row' });
    expect(restAfter(s, 1, 0, s.blocks[1].items[0].sets[0], ctx)).toEqual({ sec: 45, label: 'Curl' });
    expect(restAfter(s, 2, 0, s.blocks[2].items[0].sets[0], ctx)).toEqual({ sec: 120, label: 'Incline press' });
  });

  it('keeps warmup rests short', () => {
    const s = session([{ id: '1', items: [item('a', [set('warmup')], plan(180))] }]);
    expect(restAfter(s, 0, 0, s.blocks[0].items[0].sets[0], ctx)?.sec).toBe(60);
  });

  it('goes straight to a planned drop set, or after its own rest, then rests normally', () => {
    const work = set('working');
    const drop1 = set('drop', 8, false);
    const drop2 = set('drop', 8, false);
    const p = plan(120);
    const s = session([{ id: '1', items: [item('a', [work, drop1, drop2], p)] }]);
    expect(restAfter(s, 0, 0, work, ctx)).toBeNull();
    if (p.scheme.kind === 'straight') p.scheme.dropRestSec = 10;
    expect(restAfter(s, 0, 0, work, ctx)).toEqual({ sec: 10, label: 'Drop set, Row' });
    drop1.done = true;
    expect(restAfter(s, 0, 0, drop1, ctx)).toEqual({ sec: 10, label: 'Drop set, Row' });
    drop2.done = true;
    expect(restAfter(s, 0, 0, drop2, ctx)).toEqual({ sec: 120, label: 'Row' });
  });

  it('in a superset rests between exercises only if set, and after the round', () => {
    const a = item('a', [set('working')], plan(90));
    const b = item('b', [set('working')], plan(60));
    const s = session([{ id: '1', items: [a, b] }]);
    expect(restAfter(s, 0, 0, a.sets[0], ctx)).toBeNull();
    expect(restAfter(s, 0, 1, b.sets[0], ctx)).toEqual({ sec: 90, label: 'Superset round done' });
    s.blocks[0].transitionSec = 15;
    s.blocks[0].roundRestSec = 150;
    expect(restAfter(s, 0, 0, a.sets[0], ctx)).toEqual({ sec: 15, label: 'Next: Incline press' });
    expect(restAfter(s, 0, 1, b.sets[0], ctx)).toEqual({ sec: 150, label: 'Superset round done' });
  });
});

describe('formatRest', () => {
  it('formats seconds and minutes', () => {
    expect(formatRest(0)).toBe('Off');
    expect(formatRest(45)).toBe('45 s');
    expect(formatRest(90)).toBe('1:30');
    expect(formatRest(120)).toBe('2:00');
  });
});

describe('upNext', () => {
  const ids = (s: Session, from?: number) => {
    const next = upNext(s, from);
    return next && `${next.blockIndex}.${next.itemIndex}:${next.set.id}`;
  };

  it('takes the next set of the same exercise, then moves on', () => {
    const a = [set('working'), set('working', 8, false)];
    const s = session([{ id: '1', items: [item('a', a)] }, { id: '2', items: [item('b', [set('working', 8, false)])] }]);
    expect(ids(s, 0)).toBe(`0.0:${a[1].id}`);
    a[1].done = true;
    expect(ids(s, 0)).toBe(`1.0:${s.blocks[1].items[0].sets[0].id}`);
  });

  it('alternates between the exercises of a superset', () => {
    const a = [set('working'), set('working', 8, false)];
    const b = [set('working', 8, false), set('working', 8, false)];
    const s = session([{ id: '1', items: [item('a', a), item('b', b)] }]);
    expect(ids(s)).toBe(`0.1:${b[0].id}`);
    b[0].done = true;
    expect(ids(s)).toBe(`0.0:${a[1].id}`);
  });

  it('takes a drop set straight after its set, even in a superset', () => {
    const a = [set('working'), set('drop', 8, false), set('working', 8, false)];
    const b = [set('working', 8, false)];
    const s = session([{ id: '1', items: [item('a', a), item('b', b)] }]);
    expect(ids(s)).toBe(`0.0:${a[1].id}`);
    a[1].done = true;
    expect(ids(s)).toBe(`0.1:${b[0].id}`);
  });

  it('does warmups before the first working set of a superset exercise', () => {
    const a = [set('warmup', 8, false), set('working', 8, false)];
    const b = [set('working', 8, false)];
    const s = session([{ id: '1', items: [item('a', a), item('b', b)] }]);
    expect(ids(s)).toBe(`0.0:${a[0].id}`);
    a[0].done = true;
    expect(ids(s)).toBe(`0.0:${a[1].id}`);
  });

  it('leaves skipped sets of an exercise until its later sets are done', () => {
    const a = [set('warmup', 8, false), set('working'), set('working', 8, false)];
    const s = session([{ id: '1', items: [item('a', a)] }]);
    expect(ids(s)).toBe(`0.0:${a[2].id}`);
    a[2].done = true;
    expect(ids(s)).toBe(`0.0:${a[0].id}`);
  });

  it('brings skipped exercises back after the last block', () => {
    const skipped = set('working', 8, false);
    const s = session([
      { id: '1', items: [item('a', [skipped])] },
      { id: '2', items: [item('b', [set('working')])] },
      { id: '3', items: [item('c', [set('working')])] },
    ]);
    expect(ids(s, 1)).toBe(`0.0:${skipped.id}`);
    expect(ids(s, 7)).toBe(`0.0:${skipped.id}`);
  });

  it('returns null when everything is logged', () => {
    expect(upNext(session([{ id: '1', items: [item('a', [set('working')])] }]), 0)).toBeNull();
    expect(upNext(session([]), 0)).toBeNull();
  });
});

describe('restCues', () => {
  const kinds = (sec: number) => restCues(sec).map((c) => `${c.kind}@${c.beforeEndMs}`);

  it('adds a 10 s cue only to rests of 20 s or more', () => {
    expect(kinds(90)).toEqual(['ten@10000', 'tick@3000', 'tick@2000', 'tick@1000', 'end@0']);
    expect(kinds(15)).toEqual(['tick@3000', 'tick@2000', 'tick@1000', 'end@0']);
  });

  it('skips ticks that would come before the rest starts', () => {
    expect(kinds(2)).toEqual(['tick@1000', 'end@0']);
  });
});
