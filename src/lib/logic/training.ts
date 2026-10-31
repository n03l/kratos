import type {
  Exercise, Gym, GymSetup, LoggedSet, PlannedExercise, Session, SessionExercise,
} from '../model';
import { isGymSpecificEquipment } from '../model';
import { newestFirst } from '../repo/validate';

/** The heaviest weight a set may have (see validate.ts). */
export const MAX_KG = 2000;

/** Estimated one-rep max (Epley). Returns 0 for sets that say little about strength. */
export function e1rm(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  if (reps > 15) return 0;
  return weight * (1 + reps / 30);
}

export function roundTo(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

/** One step up or down from `value`, landing on the step grid (61 with a 2.5 step goes to 62.5 or 60); never below 0. */
export function stepValue(value: number, step: number, dir: 1 | -1): number {
  if (!(step > 0)) return Math.max(0, value);
  const n = value / step;
  const k = dir > 0 ? Math.floor(n + 1e-9) + 1 : Math.ceil(n - 1e-9) - 1;
  return Math.max(0, Math.round(k * step * 100) / 100);
}

/** Weight for a drop set: `pct` percent lighter on the step grid, and always lighter than `from` (never below 0). */
export function dropWeight(from: number, pct: number, step: number): number {
  if (from <= 0) return 0;
  const w = roundTo(from * (1 - pct / 100), step);
  return Math.max(0, Math.round((w < from ? w : from - Math.max(step, 0.5)) * 100) / 100);
}

/** Smallest jump available for an exercise at a gym; machines and cables can set their own in the gym setup. */
export function incrementFor(ex: Exercise, gym: Gym, setup?: Pick<GymSetup, 'increment'>): number {
  if (ex.equipment === 'barbell') return gym.plates.length ? 2 * Math.min(...gym.plates) : 2.5;
  if (ex.equipment === 'dumbbell') return 2;
  if (ex.equipment === 'bodyweight') return 2.5;
  if (isGymSpecificEquipment(ex.equipment) && setup?.increment) return setup.increment;
  return gym.stackIncrement;
}

export interface WarmupStep {
  weight: number;
  reps: number;
}

/** Ramp-up sets towards the first working weight. */
export function warmupSets(ex: Exercise, gym: Gym, working: number, step = incrementFor(ex, gym)): WarmupStep[] {
  if (working <= 0 || ex.equipment === 'bodyweight' || ex.measure === 'time') return [];
  const ramp: [number, number][] =
    ex.equipment === 'barbell'
      ? [[0.4, 8], [0.6, 5], [0.8, 3]]
      : [[0.5, 10], [0.75, 5]];
  const out: WarmupStep[] = [];
  if (ex.equipment === 'barbell' && working > gym.bar * 1.5) out.push({ weight: gym.bar, reps: 10 });
  for (const [pct, reps] of ramp) {
    const w = roundTo(working * pct, step);
    const last = out.at(-1)?.weight ?? 0;
    const floor = ex.equipment === 'barbell' ? gym.bar : step;
    if (w >= working || w <= last || w < floor) continue;
    out.push({ weight: w, reps });
  }
  return out;
}

export interface PlateLoad {
  perSide: number[];
  /** Weight that cannot be made with the gym's plates. */
  leftover: number;
}

/** Plates per side for a barbell weight, using the largest plates first. */
export function plateLoad(total: number, bar: number, plates: number[]): PlateLoad {
  let side = (total - bar) / 2;
  const perSide: number[] = [];
  if (!Number.isFinite(side)) return { perSide, leftover: 0 };
  if (side <= 0) return { perSide, leftover: Math.max(0, side * 2) };
  for (const p of [...plates].sort((a, b) => b - a)) {
    while (side >= p - 1e-9) {
      perSide.push(p);
      side -= p;
    }
  }
  return { perSide, leftover: Math.round(side * 2 * 100) / 100 };
}

export interface HistoryEntry {
  session: Session;
  entry: SessionExercise;
}

/**
 * Every exercise's logged entries, newest first. Build it once per change to the workouts and look exercises up
 * in it: scanning every workout for each exercise is too slow with years of history.
 */
export function historyIndex(sessions: Session[]): Map<string, HistoryEntry[]> {
  const index = new Map<string, HistoryEntry[]>();
  for (const s of sessions) {
    for (const b of s.blocks) {
      for (const it of b.items) {
        if (!it.sets.some((x) => x.done)) continue;
        const list = index.get(it.exerciseId);
        if (list) list.push({ session: s, entry: it });
        else index.set(it.exerciseId, [{ session: s, entry: it }]);
      }
    }
  }
  for (const list of index.values()) list.sort((a, b) => newestFirst(a.session, b.session));
  return index;
}

/** Sessions containing an exercise, newest first; restricted to one gym when `gymId` is given. */
export function exerciseHistory(
  sessions: Session[], ex: Exercise, gymId: string | null, index = historyIndex(sessions),
): HistoryEntry[] {
  const all = index.get(ex.id) ?? [];
  return gymId ? all.filter((h) => h.session.gymId === gymId) : all;
}

export const workSets = (sets: LoggedSet[]) =>
  sets.filter((s) => s.done && (s.type === 'working' || s.type === 'myo' || s.type === 'drop'));

export function bestE1rm(sets: LoggedSet[]): number {
  return Math.max(0, ...workSets(sets).map((s) => e1rm(s.weight, s.reps)));
}

export function volume(sets: LoggedSet[]): number {
  return sets
    .filter((s) => s.done && s.type !== 'warmup')
    .reduce((sum, s) => sum + s.weight * s.reps, 0);
}

export interface Suggestion {
  weight: number;
  reps: number;
  /** Target hold time for timed exercises (reps is then 0). */
  sec?: number;
  reason: 'first' | 'increase' | 'more-reps' | 'repeat';
}

/** What a set achieved: seconds held for timed sets, reps otherwise. */
export const amount = (s: LoggedSet) => (s.durationSec !== undefined && s.reps === 0 ? s.durationSec : s.reps);

/**
 * Next target from the last session.
 * Double progression: add reps up to the top of the range on every set, then add weight and restart at the bottom.
 * Linear: add weight whenever every set reached the bottom of the range.
 */
export function suggestNext(
  plan: PlannedExercise, last: LoggedSet[] | undefined, increment: number,
): Suggestion | null {
  const scheme = plan.scheme;
  const timed = scheme.kind === 'timed';
  const [min, max] = scheme.kind === 'straight' ? [scheme.repsMin, scheme.repsMax] : [scheme.secMin, scheme.secMax];
  // Timed holds go up 5 s at a time; reps one at a time.
  const step = timed ? 5 : 1;
  const make = (weight: number, n: number, reason: Suggestion['reason']): Suggestion =>
    timed ? { weight, reps: 0, sec: n, reason } : { weight, reps: n, reason };

  // Myo activation sets in workouts from before myo-reps were removed count as working sets.
  const main = (last ?? []).filter((s) => s.done && (s.type === 'working' || s.type === 'myo'));
  if (main.length === 0) return null;
  const top = Math.max(...main.map((s) => s.weight));
  const atTop = main.filter((s) => s.weight === top);
  const lowest = Math.min(...atTop.map(amount));
  const inc = plan.progression.kind === 'none' ? 0 : plan.progression.increment || increment;
  const up = Math.min(MAX_KG, top + inc);

  switch (plan.progression.kind) {
    case 'double':
      if (lowest >= max) return make(up, min, 'increase');
      return make(top, Math.max(min, Math.min(max, lowest + step)), 'more-reps');
    case 'linear':
      if (lowest >= min) return make(up, min, 'increase');
      return make(top, min, 'repeat');
    default:
      return make(top, lowest, 'repeat');
  }
}

export function formatWeight(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(kg * 4 === Math.round(kg * 4) ? 2 : 1).replace(/0$/, '');
}
