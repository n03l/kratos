import { describe, expect, it } from 'vitest';
import type { Exercise, LoggedSet, PlannedExercise, Routine, SessionExercise } from '../model';
import { exerciseMuscles, hardSets, muscleLevel, plannedHardSets, routineSetsPerMuscle, setsPerMuscle } from './muscles';

const set = (type: LoggedSet['type'], done = true): LoggedSet => ({ id: type, type, weight: 50, reps: 8, done });
const ex = (id: string, muscles: Exercise['muscles']): Exercise => ({ id, name: id, equipment: 'barbell', muscles, gymSpecific: false });
const library = [ex('squat', ['quads', 'glutes']), ex('curl', ['biceps'])];
const lookup = (id: string) => library.find((e) => e.id === id);

describe('hardSets', () => {
  it('counts done working, drop and (older) myo activation sets only', () => {
    const item: SessionExercise = {
      exerciseId: 'squat',
      sets: [set('warmup'), set('working'), set('working', false), set('myo'), set('mini'), set('drop')],
    };
    expect(hardSets(item)).toBe(3);
  });
});

describe('setsPerMuscle', () => {
  it('credits every listed muscle and lists all muscles', () => {
    const counts = setsPerMuscle(
      [
        { exerciseId: 'squat', sets: [set('working'), set('working')] },
        { exerciseId: 'curl', sets: [set('working')] },
        { exerciseId: 'squat', sets: [set('working')] },
        { exerciseId: 'deleted', sets: [set('working')] },
      ],
      lookup,
    );
    expect(counts.get('quads')).toBe(3);
    expect(counts.get('glutes')).toBe(3);
    expect(counts.get('biceps')).toBe(1);
    expect(counts.get('chest')).toBe(0);
    expect(counts.size).toBe(10);
  });
});

const plan = (exerciseId: string, scheme: PlannedExercise['scheme']): PlannedExercise =>
  ({ exerciseId, warmup: 'auto', scheme, restSec: 90, progression: { kind: 'none' } });

describe('plannedHardSets', () => {
  it('counts working sets and drops', () => {
    expect(plannedHardSets(plan('squat', { kind: 'straight', sets: 3, repsMin: 5, repsMax: 8, rir: 2 }))).toBe(3);
    expect(plannedHardSets(plan('squat', { kind: 'straight', sets: 3, repsMin: 5, repsMax: 8, rir: 2, drops: 2 }))).toBe(5);
    expect(plannedHardSets(plan('curl', { kind: 'timed', sets: 2, secMin: 30, secMax: 45 }))).toBe(2);
  });
});

describe('routineSetsPerMuscle', () => {
  it('adds up the planned sets of every block, supersets included', () => {
    const straight = { kind: 'straight', sets: 3, repsMin: 5, repsMax: 8, rir: 2 } as const;
    const r: Routine = {
      id: 'r', name: 'Legs',
      blocks: [
        { id: 'a', items: [plan('squat', straight)] },
        { id: 'b', items: [plan('squat', { ...straight, sets: 2 }), plan('curl', straight)] },
      ],
    };
    const counts = routineSetsPerMuscle(r, lookup);
    expect(counts.get('quads')).toBe(5);
    expect(counts.get('biceps')).toBe(3);
    expect(counts.get('back')).toBe(0);
  });
});

describe('muscleLevel', () => {
  it('shades by set count', () => {
    expect([0, 1, 2, 3, 5, 6, 20].map(muscleLevel)).toEqual([0, 1, 1, 2, 2, 3, 3]);
    expect(muscleLevel(NaN)).toBe(0);
    expect(muscleLevel(-1)).toBe(0);
  });
});

describe('exerciseMuscles', () => {
  it('shades every listed muscle fully and the rest not at all', () => {
    const m = exerciseMuscles(ex('squat', ['quads', 'glutes']));
    expect(muscleLevel(m.get('quads')!)).toBe(3);
    expect(muscleLevel(m.get('glutes')!)).toBe(3);
    expect(muscleLevel(m.get('biceps')!)).toBe(0);
  });

  it('ignores unknown and repeated muscles and handles none', () => {
    const odd = ex('odd', ['quads', 'quads', 'neck' as Exercise['muscles'][number]]);
    const m = exerciseMuscles(odd);
    expect(m.has('neck' as Exercise['muscles'][number])).toBe(false);
    expect(muscleLevel(m.get('quads')!)).toBe(3);
    expect([...exerciseMuscles(ex('none', [])).values()].every((n) => n === 0)).toBe(true);
  });
});
