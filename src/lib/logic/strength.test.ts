import { describe, expect, it } from 'vitest';
import type { Exercise, LoggedSet, Session } from '../model';
import { mainLifts } from './strength';
import { historyIndex } from './training';

const ex = (id: string, more: Partial<Exercise> = {}): Exercise =>
  ({ id, name: id, muscles: [], equipment: 'barbell', gymSpecific: false, ...more });
const set = (weight: number, reps: number, type: LoggedSet['type'] = 'working'): LoggedSet =>
  ({ id: `${weight}-${reps}`, type, weight, reps, done: true });
const now = Date.parse('2026-10-28T12:00:00Z');
const day = (n: number) => new Date(now - n * 86_400_000).toISOString();
let n = 0;
const session = (daysAgo: number, items: [string, LoggedSet[]][]): Session => ({
  id: `s${n++}`, name: 'W', startedAt: day(daysAgo), durationMin: 60, gymId: 'g',
  blocks: items.map(([exerciseId, sets]) => ({ id: `b${n++}`, items: [{ exerciseId, sets }] })),
});

describe('mainLifts', () => {
  const exercises = [ex('squat'), ex('bench'), ex('curl', { equipment: 'dumbbell' }), ex('press', { equipment: 'machine', gymSpecific: true }),
    ex('pullup', { equipment: 'bodyweight' }), ex('old')];
  const sessions = [
    session(1, [['squat', [set(100, 5)]], ['bench', [set(80, 5)]], ['press', [set(100, 10)]], ['pullup', [set(10, 5)]]]),
    session(15, [['squat', [set(97.5, 5)]], ['curl', [set(14, 10)]]]),
    session(35, [['squat', [set(95, 5), set(60, 5, 'warmup')]], ['bench', [set(77.5, 5)]], ['curl', [set(14, 10)]]]),
    session(50, [['squat', [set(92.5, 5)]], ['bench', [set(75, 5)]], ['press', [set(90, 10)]], ['curl', [set(12, 10)]]]),
    session(120, [['old', [set(50, 5)]], ['old', [set(50, 5)]], ['old', [set(50, 5)]]]),
  ];
  const lifts = mainLifts(historyIndex(sessions), exercises, now);

  it('picks free-weight lifts trained often enough, most trained first', () => {
    expect(lifts.map((l) => l.exercise.id)).toEqual(['squat', 'bench', 'curl']);
  });

  it('follows the best estimated 1RM per workout, oldest first, and its change over about four weeks', () => {
    const squat = lifts[0];
    expect(squat.points.map((p) => Math.round(p.y * 10) / 10)).toEqual([107.9, 110.8, 113.8, 116.7]);
    expect(squat.latest).toBeCloseTo(116.7, 1);
    expect(squat.change).toBeCloseTo(116.67 - 110.83, 1);
  });

  it('puts the heaviest first among lifts trained as often', () => {
    const even = [session(2, [['curl', [set(14, 10)]], ['squat', [set(100, 5)]]]), session(9, [['curl', [set(14, 10)]], ['squat', [set(100, 5)]]]),
      session(16, [['curl', [set(14, 10)]], ['squat', [set(100, 5)]]])];
    expect(mainLifts(historyIndex(even), exercises, now).map((l) => l.exercise.id)).toEqual(['squat', 'curl']);
  });

  it('respects the count', () => {
    expect(mainLifts(historyIndex(sessions), exercises, now, { count: 1 }).map((l) => l.exercise.id)).toEqual(['squat']);
  });
});
