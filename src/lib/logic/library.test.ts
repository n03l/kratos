import { describe, expect, it } from 'vitest';
import { seed } from '../repo/mock';
import { starter } from '../repo/starter';
import { parseBackup } from '../repo/validate';
import { deleteExercise, exerciseNameProblem, exerciseUsage } from './library';

const sample = () => seed(new Date('2026-10-26T12:00:00Z'));

describe('deleteExercise', () => {
  it('removes an unused exercise completely', () => {
    const s = starter();
    expect(deleteExercise(s, 'bodysaw')).toBe('removed');
    expect(s.exercises.some((e) => e.id === 'bodysaw')).toBe(false);
  });

  it('archives an exercise used in history and takes it out of routines', () => {
    const s = sample();
    expect(exerciseUsage(s, 'legcurl').routines).toEqual(['3-day split > Lower A']);
    expect(exerciseUsage(s, 'legcurl').sessions).toBeGreaterThan(0);
    expect(deleteExercise(s, 'legcurl')).toBe('archived');
    expect(s.exercises.find((e) => e.id === 'legcurl')?.archived).toBe(true);
    const lowerA = s.routines.find((r) => r.id === 'lowerA')!;
    // Leg curl was in a superset with calf raise: the calf raise stays, as a single exercise.
    const ids = lowerA.blocks.map((b) => b.items.map((i) => i.exerciseId));
    expect(ids).toEqual([['squat'], ['rdl'], ['legpress'], ['calf']]);
    // The data is still valid, so it loads again.
    expect(() => parseBackup(JSON.stringify(s))).not.toThrow();
  });

  it('drops per-gym setup notes when it removes an exercise', () => {
    const s = sample();
    s.sessions = [];
    expect(deleteExercise(s, 'legpress')).toBe('removed');
    expect(s.setups.some((x) => x.exerciseId === 'legpress')).toBe(false);
    expect(() => parseBackup(JSON.stringify(s))).not.toThrow();
  });
});

describe('exerciseNameProblem', () => {
  it('accepts a new name and the current name with different spacing or case', () => {
    const s = starter();
    const ex = s.exercises[0];
    expect(exerciseNameProblem(s, ex.id, 'Something new')).toBe('');
    expect(exerciseNameProblem(s, ex.id, `  ${ex.name.toUpperCase()} `)).toBe('');
  });

  it('refuses empty, too long and taken names', () => {
    const s = starter();
    const [a, b] = s.exercises;
    expect(exerciseNameProblem(s, a.id, '   ')).toMatch(/name/);
    expect(exerciseNameProblem(s, a.id, 'x'.repeat(81))).toMatch(/80/);
    expect(exerciseNameProblem(s, a.id, b.name.toLowerCase())).toMatch(/already exists/);
    expect(exerciseNameProblem(s, '', a.name)).toMatch(/already exists/);
  });

  it('points to an archived exercise with the same name', () => {
    const s = starter();
    s.exercises[1].archived = true;
    expect(exerciseNameProblem(s, s.exercises[0].id, s.exercises[1].name)).toMatch(/archived/);
  });
});
