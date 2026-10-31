import { describe, expect, it } from 'vitest';
import { seed } from '../repo/mock';
import type { Exercise, Gym, LoggedSet, PlannedExercise } from '../model';
import {
  dropWeight, e1rm, exerciseHistory, formatWeight, historyIndex, incrementFor, plateLoad, stepValue, suggestNext,
  warmupSets,
} from './training';

const gym: Gym = { id: 'g', name: 'G', color: 'red', bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25], stackIncrement: 5 };
const squat: Exercise = { id: 'sq', name: 'Squat', muscles: ['quads'], equipment: 'barbell', gymSpecific: false };
const press: Exercise = { id: 'lp', name: 'Leg press', muscles: ['quads'], equipment: 'machine', gymSpecific: true };

let n = 0;
const set = (weight: number, reps: number, type: LoggedSet['type'] = 'working'): LoggedSet =>
  ({ id: String(n++), type, weight, reps, done: true });

const plan = (progression: PlannedExercise['progression']): PlannedExercise => ({
  exerciseId: 'sq', warmup: 'auto', restSec: 120, progression,
  scheme: { kind: 'straight', sets: 3, repsMin: 6, repsMax: 8, rir: 2 },
});

describe('e1rm', () => {
  it('uses Epley and ignores empty or very high-rep sets', () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 5)).toBeCloseTo(116.67, 1);
    expect(e1rm(0, 5)).toBe(0);
    expect(e1rm(50, 30)).toBe(0);
  });
});

describe('incrementFor', () => {
  it('uses the machine step from the gym setup, falling back to the gym', () => {
    expect(incrementFor(press, gym)).toBe(5);
    expect(incrementFor(press, gym, { increment: 10 })).toBe(10);
    expect(incrementFor(press, gym, {})).toBe(5);
  });

  it('ignores a setup step for free weights', () => {
    expect(incrementFor(squat, gym, { increment: 10 })).toBe(2.5);
  });
});

describe('warmupSets', () => {
  it('ramps a barbell lift from the empty bar, rounded to loadable weights', () => {
    expect(warmupSets(squat, gym, 100)).toEqual([
      { weight: 20, reps: 10 }, { weight: 40, reps: 8 }, { weight: 60, reps: 5 }, { weight: 80, reps: 3 },
    ]);
  });
  it('skips steps that would not be lighter than the previous one', () => {
    expect(warmupSets(squat, gym, 30).map((s) => s.weight)).toEqual([25]);
    expect(warmupSets(press, gym, 20).map((s) => s.weight)).toEqual([10, 15]);
    expect(warmupSets(press, gym, 100, 20).map((s) => s.weight)).toEqual([60, 80]);
  });
});

describe('plateLoad', () => {
  it('loads largest plates first and reports what cannot be made', () => {
    expect(plateLoad(102.5, 20, gym.plates)).toEqual({ perSide: [25, 15, 1.25], leftover: 0 });
    expect(plateLoad(101, 20, [20, 10, 5])).toEqual({ perSide: [20, 20], leftover: 1 });
    expect(plateLoad(20, 20, gym.plates).perSide).toEqual([]);
  });
});

describe('suggestNext', () => {
  it('double progression adds reps, then weight once every set hits the top of the range', () => {
    expect(suggestNext(plan({ kind: 'double', increment: 2.5 }), [set(100, 8), set(100, 7)], 2.5))
      .toEqual({ weight: 100, reps: 8, reason: 'more-reps' });
    expect(suggestNext(plan({ kind: 'double', increment: 2.5 }), [set(100, 8), set(100, 8)], 2.5))
      .toEqual({ weight: 102.5, reps: 6, reason: 'increase' });
  });
  it('linear progression repeats a weight when the bottom of the range was missed', () => {
    expect(suggestNext(plan({ kind: 'linear', increment: 5 }), [set(100, 6), set(100, 5)], 2.5))
      .toEqual({ weight: 100, reps: 6, reason: 'repeat' });
    expect(suggestNext(plan({ kind: 'linear', increment: 5 }), [set(100, 6), set(100, 6)], 2.5))
      .toEqual({ weight: 105, reps: 6, reason: 'increase' });
  });
  it('ignores warmups and returns null without history', () => {
    expect(suggestNext(plan({ kind: 'double', increment: 2.5 }), [set(60, 5, 'warmup')], 2.5)).toBeNull();
    expect(suggestNext(plan({ kind: 'double', increment: 2.5 }), undefined, 2.5)).toBeNull();
  });
});


describe('exerciseHistory', () => {
  it('filters machine history to one gym', () => {
    const s = (id: string, gymId: string, day: string) => ({
      id, name: 'x', startedAt: day, durationMin: 60, gymId,
      blocks: [{ id: 'b', items: [{ exerciseId: 'lp', sets: [set(100, 10)] }] }],
    });
    const all = [s('1', 'a', '2026-01-01'), s('2', 'b', '2026-01-02'), s('3', 'a', '2026-01-03')];
    expect(exerciseHistory(all, press, 'a').map((h) => h.session.id)).toEqual(['3', '1']);
    expect(exerciseHistory(all, press, null).map((h) => h.session.id)).toEqual(['3', '2', '1']);
  });
});

describe('formatWeight', () => {
  it('drops needless decimals', () => {
    expect(formatWeight(100)).toBe('100');
    expect(formatWeight(102.5)).toBe('102.5');
    expect(formatWeight(1.25)).toBe('1.25');
  });
});

describe('timed exercises', () => {
  const hold = (sec: number, weight = 0): LoggedSet => ({ id: String(n++), type: 'working', weight, reps: 0, durationSec: sec, done: true });
  const timedPlan = (progression: PlannedExercise['progression']): PlannedExercise => ({
    exerciseId: 'plank', warmup: 'none', restSec: 60, progression,
    scheme: { kind: 'timed', sets: 3, secMin: 30, secMax: 60 },
  });

  it('double progression adds 5 s per hold, then weight once every hold reaches the top', () => {
    expect(suggestNext(timedPlan({ kind: 'double', increment: 5 }), [hold(45), hold(40)], 2.5))
      .toEqual({ weight: 0, reps: 0, sec: 45, reason: 'more-reps' });
    expect(suggestNext(timedPlan({ kind: 'double', increment: 5 }), [hold(60), hold(62)], 2.5))
      .toEqual({ weight: 5, reps: 0, sec: 30, reason: 'increase' });
  });

  it('uses only the heaviest holds', () => {
    expect(suggestNext(timedPlan({ kind: 'none' }), [hold(60), hold(35, 10)], 2.5))
      .toEqual({ weight: 10, reps: 0, sec: 35, reason: 'repeat' });
  });
});

describe('historyIndex', () => {
  it('finds the same entries as scanning every workout, newest first', () => {
    const snap = seed(new Date('2026-10-26T12:00:00Z'));
    const index = historyIndex(snap.sessions);
    for (const ex of snap.exercises) {
      for (const gymId of [null, ...snap.gyms.map((g) => g.id)]) {
        const scan = snap.sessions
          .filter((s) => !gymId || s.gymId === gymId)
          .flatMap((s) => s.blocks.flatMap((b) => b.items)
            .filter((it) => it.exerciseId === ex.id && it.sets.some((x) => x.done))
            .map((entry) => ({ session: s, entry })))
          .sort((a, b) => b.session.startedAt.localeCompare(a.session.startedAt));
        expect(exerciseHistory(snap.sessions, ex, gymId, index)).toEqual(scan);
      }
    }
  });
});

describe('dropWeight', () => {
  it('takes the percentage off and rounds to the step', () => {
    expect(dropWeight(100, 20, 2.5)).toBe(80);
    expect(dropWeight(80, 20, 2.5)).toBe(65);
    expect(dropWeight(30, 20, 5)).toBe(25);
  });

  it('is always lighter, and never below zero', () => {
    expect(dropWeight(10, 20, 5)).toBe(5);
    expect(dropWeight(5, 20, 5)).toBe(0);
    expect(dropWeight(0, 20, 5)).toBe(0);
    expect(dropWeight(2, 20, 2)).toBe(0);
  });
});

describe('stepValue', () => {
  it('steps along the grid and snaps values that are off it', () => {
    expect(stepValue(60, 2.5, 1)).toBe(62.5);
    expect(stepValue(60, 2.5, -1)).toBe(57.5);
    expect(stepValue(61, 2.5, 1)).toBe(62.5);
    expect(stepValue(61, 2.5, -1)).toBe(60);
    expect(stepValue(0.3, 0.1, 1)).toBe(0.4);
  });

  it('never goes below zero', () => {
    expect(stepValue(0, 5, -1)).toBe(0);
    expect(stepValue(1, 5, -1)).toBe(0);
  });
});

describe('limits', () => {
  it('never plans more than 2000 kg', () => {
    expect(suggestNext(plan({ kind: 'double', increment: 5 }), [set(1998, 8), set(1998, 8), set(1998, 8)], 5)?.weight).toBe(2000);
    expect(suggestNext(plan({ kind: 'linear', increment: 5 }), [set(2000, 6)], 5)?.weight).toBe(2000);
  });

  it('copes with a gym without plates', () => {
    expect(incrementFor(squat, { ...gym, plates: [] })).toBe(2.5);
    expect(plateLoad(Infinity, 20, [])).toEqual({ perSide: [], leftover: 0 });
  });
});
