import { describe, expect, it } from 'vitest';
import type { Exercise, LoggedSet, Session } from '../model';
import { recordText, sessionRecords } from './records';

let n = 0;
const set = (weight: number, reps: number, durationSec?: number): LoggedSet =>
  ({ id: String(n++), type: 'working', weight, reps, done: true, ...(durationSec !== undefined ? { durationSec } : {}) });
const session = (id: string, day: string, exerciseId: string, sets: LoggedSet[]): Session =>
  ({ id, name: 'x', startedAt: day, durationMin: 30, gymId: 'g', blocks: [{ id: 'b', items: [{ exerciseId, sets }] }] });

const plank: Exercise = { id: 'plank', name: 'Plank', muscles: ['core'], equipment: 'bodyweight', gymSpecific: false, measure: 'time' };
const pullup: Exercise = { id: 'pullup', name: 'Pull-up', muscles: ['back'], equipment: 'bodyweight', gymSpecific: false };
const bench: Exercise = { id: 'bench', name: 'Bench press (barbell)', muscles: ['chest'], equipment: 'barbell', gymSpecific: false };

describe('sessionRecords', () => {
  it('uses the longest hold for timed exercises', () => {
    const old = session('1', '2026-01-01', 'plank', [set(0, 0, 60)]);
    const now = session('2', '2026-01-08', 'plank', [set(0, 0, 50), set(0, 0, 75)]);
    const [r] = sessionRecords(now, [now, old], [plank]);
    expect(r.kind).toBe('hold');
    expect(recordText(r, plank)).toBe('Held 1:15 (+15 s)');
  });

  it('uses most reps at bodyweight, and most added weight once weight is added', () => {
    const old = session('1', '2026-01-01', 'pullup', [set(0, 10)]);
    const more = session('2', '2026-01-08', 'pullup', [set(0, 12)]);
    expect(recordText(sessionRecords(more, [more, old], [pullup])[0], pullup)).toBe('12 reps at bodyweight (+2)');
    const weighted = session('3', '2026-01-15', 'pullup', [set(10, 6)]);
    const [r] = sessionRecords(weighted, [weighted, more, old], [pullup]);
    expect(recordText(r, pullup)).toBe('BW +10 kg × 6, most added weight (+10 kg)');
  });

  it('keeps estimated 1RM for loaded lifts and ignores first sessions', () => {
    const first = session('1', '2026-01-01', 'bench', [set(80, 8)]);
    expect(sessionRecords(first, [first], [bench])).toEqual([]);
    const next = session('2', '2026-01-08', 'bench', [set(82.5, 8)]);
    expect(sessionRecords(next, [next, first], [bench])[0].kind).toBe('e1rm');
  });
});

describe('sessionRecords with long histories', () => {
  it('handles more history than fits in a function call', () => {
    const many = Array.from({ length: 200_000 }, (_, i) =>
      session(`h${i}`, new Date(Date.UTC(2000, 0, 1) + i * 3_600_000).toISOString(), 'bench', [set(50 + (i % 7), 5)]));
    const now = session('now', '2030-01-01T00:00:00.000Z', 'bench', [set(60, 5)]);
    const sessions = [now, ...many.reverse()];
    const [r] = sessionRecords(now, sessions, [bench]);
    expect(r.value).toBeCloseTo(70);
    expect(r.previousBest).toBeCloseTo(56 * (1 + 5 / 30));
  });

  it('compares only with workouts before it, at the same gym for gym-specific exercises', () => {
    const press: Exercise = { id: 'press', name: 'Leg press', muscles: ['quads'], equipment: 'machine', gymSpecific: true };
    const other = { ...session('a', '2026-01-01', 'press', [set(200, 5)]), gymId: 'g2' };
    const old = session('b', '2026-01-02', 'press', [set(100, 5)]);
    const now = session('c', '2026-01-03', 'press', [set(110, 5)]);
    const later = session('d', '2026-01-04', 'press', [set(150, 5)]);
    const [r] = sessionRecords(now, [later, now, old, other], [press]);
    expect(r.previousBest).toBeCloseTo(100 * (1 + 5 / 30));
    expect(sessionRecords(old, [later, now, old, other], [press])).toEqual([]);
  });
});

describe('sessionRecords for an exercise logged twice', () => {
  it('gives one record, from the best set of both entries', () => {
    const old = session('a', '2026-01-01', 'bench', [set(100, 5)]);
    const now = session('b', '2026-01-08', 'bench', [set(90, 5)]);
    now.blocks.push({ id: 'b2', items: [{ exerciseId: 'bench', sets: [set(105, 5)] }] });
    const records = sessionRecords(now, [now, old], [bench]);
    expect(records.length).toBe(1);
    expect(records[0].set.weight).toBe(105);
  });
});
