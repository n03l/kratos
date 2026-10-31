import { describe, expect, it } from 'vitest';
import type { LoggedSet, Session } from '../model';
import { workoutStats } from './stats';

const set = (weight: number, reps: number, type: LoggedSet['type'] = 'working', done = true): LoggedSet =>
  ({ id: `${weight}-${reps}-${type}`, type, weight, reps, done });

const session = (startedAt: string, sets: LoggedSet[] = []): Session => ({
  id: startedAt, name: 'Workout', startedAt, durationMin: 60, gymId: 'g',
  blocks: [{ id: 'b', items: [{ exerciseId: 'e', sets }] }],
});

// Wednesday 28 October 2026, local time.
const now = new Date(2026, 9, 28, 18, 0).getTime();
const at = (month: number, day: number) => new Date(2026, month, day, 9, 0).toISOString();

describe('workoutStats', () => {
  it('is all zeros without workouts', () => {
    expect(workoutStats([], now)).toEqual({ total: 0, thisMonth: 0, weekStreak: 0, liftedKg: 0 });
  });

  it('counts this month by calendar month', () => {
    const s = workoutStats([session(at(9, 27)), session(at(9, 1)), session(at(8, 30))], now);
    expect(s.total).toBe(3);
    expect(s.thisMonth).toBe(2);
  });

  it('counts weeks in a row, in any order, and stops at a gap', () => {
    // This week (Mon 26 Oct), the two before it, then a gap week, then one more.
    const s = workoutStats([session(at(9, 13)), session(at(9, 26)), session(at(9, 4)), session(at(9, 19)), session(at(9, 20))], now);
    expect(s.weekStreak).toBe(3);
  });

  it('keeps the streak when this week has no workout yet', () => {
    expect(workoutStats([session(at(9, 22)), session(at(9, 15))], now).weekStreak).toBe(2);
    expect(workoutStats([session(at(9, 15))], now).weekStreak).toBe(0);
  });

  it('adds weight × reps over done working sets only', () => {
    const s = workoutStats([session(at(9, 26), [set(100, 5), set(60, 5, 'warmup'), set(100, 5, 'working', false), set(80, 8, 'drop')])], now);
    expect(s.liftedKg).toBe(500 + 640);
  });

  it('ignores unreadable start times for the month and streak', () => {
    const s = workoutStats([session('not a date')], now);
    expect(s).toEqual({ total: 1, thisMonth: 0, weekStreak: 0, liftedKg: 0 });
  });
});
