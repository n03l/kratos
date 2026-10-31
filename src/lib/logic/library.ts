import type { Session, Snapshot } from '../model';
import { sameName } from './merge';

export interface ExerciseUsage {
  /** Names of routines that include the exercise. */
  routines: string[];
  /** Saved workouts that include it. */
  sessions: number;
}

export function exerciseUsage(snap: Snapshot, exerciseId: string): ExerciseUsage {
  return {
    routines: snap.routines
      .filter((r) => r.blocks.some((b) => b.items.some((i) => i.exerciseId === exerciseId)))
      .map((r) => r.name),
    sessions: snap.sessions.filter((s) => usesExercise(s, exerciseId)).length,
  };
}

export const usesExercise = (s: Session, exerciseId: string) =>
  s.blocks.some((b) => b.items.some((i) => i.exerciseId === exerciseId));

/**
 * Delete an exercise: take it out of routines (dropping blocks left empty), and remove it with its per-gym
 * setup notes. If saved workouts use it, keep it archived instead so history, charts and records still work.
 * Mutates `snap`. Returns whether it was archived rather than removed.
 */
export function deleteExercise(snap: Snapshot, exerciseId: string): 'archived' | 'removed' {
  for (const r of snap.routines) {
    for (const b of r.blocks) b.items = b.items.filter((i) => i.exerciseId !== exerciseId);
    r.blocks = r.blocks.filter((b) => b.items.length > 0);
  }
  const ex = snap.exercises.find((e) => e.id === exerciseId);
  if (!ex) return 'removed';
  if (snap.sessions.some((s) => usesExercise(s, exerciseId))) {
    ex.archived = true;
    return 'archived';
  }
  snap.exercises = snap.exercises.filter((e) => e.id !== exerciseId);
  snap.setups = snap.setups.filter((s) => s.exerciseId !== exerciseId);
  return 'removed';
}

/**
 * Why `name` can't be used for exercise `exerciseId` (pass '' for a new one), or '' if it can. Names are compared
 * ignoring case and extra spaces, archived exercises included.
 */
export function exerciseNameProblem(snap: Snapshot, exerciseId: string, name: string): string {
  const n = name.trim();
  if (!n) return 'Give the exercise a name.';
  if (n.length > 80) return 'Keep the name to 80 characters or fewer.';
  const same = snap.exercises.find((e) => e.id !== exerciseId && sameName(e.name, n));
  if (!same) return '';
  return same.archived
    ? `An archived exercise is already called “${same.name}”. Restore it from Exercises, or pick another name.`
    : `“${same.name}” already exists.`;
}
