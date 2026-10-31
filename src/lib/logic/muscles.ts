import { MUSCLES, type Exercise, type Muscle, type PlannedExercise, type Routine, type SessionExercise } from '../model';

/** Done working and drop sets, and myo activation sets from older workouts: the sets that count towards volume. */
export function hardSets(item: SessionExercise): number {
  return item.sets.filter((s) => s.done && (s.type === 'working' || s.type === 'myo' || s.type === 'drop')).length;
}

/** The hard sets a routine plans for an exercise: working sets plus drops. */
export function plannedHardSets(p: PlannedExercise): number {
  const sc = p.scheme;
  return sc.sets + (sc.kind === 'straight' ? (sc.drops ?? 0) : 0);
}

/** Hard sets per muscle; an exercise counts fully for every muscle it lists. Every muscle is present, from 0. */
export function setsPerMuscle(items: SessionExercise[], exercise: (id: string) => Exercise | undefined): Map<Muscle, number> {
  return tally(items.map((it) => [it.exerciseId, hardSets(it)]), exercise);
}

/** Planned hard sets per muscle for a routine, counted like `setsPerMuscle`. */
export function routineSetsPerMuscle(r: Routine, exercise: (id: string) => Exercise | undefined): Map<Muscle, number> {
  return tally(r.blocks.flatMap((b) => b.items).map((p) => [p.exerciseId, plannedHardSets(p)]), exercise);
}

function tally(entries: [string, number][], exercise: (id: string) => Exercise | undefined): Map<Muscle, number> {
  const counts = new Map<Muscle, number>(MUSCLES.map((m) => [m, 0]));
  for (const [id, n] of entries) {
    for (const m of exercise(id)?.muscles ?? []) {
      if (counts.has(m)) counts.set(m, counts.get(m)! + n);
    }
  }
  return counts;
}

/** Shade for the muscle map: 0 untrained, 1 for 1–2 sets, 2 for 3–5, 3 for 6 or more. */
export function muscleLevel(sets: number): 0 | 1 | 2 | 3 {
  if (!(sets > 0)) return 0;
  if (sets < 3) return 1;
  if (sets < 6) return 2;
  return 3;
}
