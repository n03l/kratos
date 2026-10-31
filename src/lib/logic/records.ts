import type { Exercise, LoggedSet, Session } from '../model';
import { e1rm, historyIndex, workSets, type HistoryEntry } from './training';
import { seconds, setText } from '../format';

/**
 * What a record means for an exercise:
 * - timed: the longest hold;
 * - bodyweight: most added weight, else most reps with no added weight;
 * - everything else: the estimated 1RM.
 */
export type RecordKind = 'e1rm' | 'hold' | 'reps' | 'added';

export interface Record {
  exerciseId: string;
  set: LoggedSet;
  kind: RecordKind;
  value: number;
  previousBest: number;
}

/** The best set of a session for one kind of record, and its value; null if no set counts. */
export function bestOf(sets: LoggedSet[], kind: RecordKind): { set: LoggedSet; value: number } | null {
  let best: { set: LoggedSet; value: number } | null = null;
  for (const s of workSets(sets)) {
    const value = kind === 'hold' ? s.durationSec ?? 0
      : kind === 'e1rm' ? e1rm(s.weight, s.reps)
      : kind === 'added' ? (s.reps > 0 ? s.weight : 0)
      : s.weight === 0 ? s.reps : 0;
    if (value > 0 && (!best || value > best.value)) best = { set: s, value };
  }
  return best;
}

/** Kinds to compare for an exercise, in order of preference. */
export function recordKinds(ex: Exercise): RecordKind[] {
  if (ex.measure === 'time') return ['hold'];
  return ex.equipment === 'bodyweight' ? ['added', 'reps'] : ['e1rm'];
}

/** An exercise's best so far, oldest first: `best[i]` is the best up to and including the workout at `at[i]`. */
interface RunningBest {
  at: string[];
  best: number[];
}

// Per history list (rebuilt whenever workouts change), so years of history are scanned once, not per workout.
const runningBests = new WeakMap<HistoryEntry[], Map<string, RunningBest>>();

function runningBest(list: HistoryEntry[], kind: RecordKind, gymId: string | null): RunningBest {
  let cache = runningBests.get(list);
  if (!cache) runningBests.set(list, (cache = new Map()));
  const key = `${kind}\n${gymId ?? ''}`;
  let rb = cache.get(key);
  if (rb) return rb;
  rb = { at: [], best: [] };
  let best = 0;
  // The list is newest first.
  for (let i = list.length - 1; i >= 0; i--) {
    const h = list[i];
    if (gymId !== null && h.session.gymId !== gymId) continue;
    best = Math.max(best, bestOf(h.entry.sets, kind)?.value ?? 0);
    rb.at.push(h.session.startedAt);
    rb.best.push(best);
  }
  cache.set(key, rb);
  return rb;
}

/** Index of the last workout that started before `startedAt`, or -1. */
function lastBefore(at: string[], startedAt: string): number {
  let lo = 0;
  let hi = at.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (at[mid] < startedAt) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/**
 * Records set in a session, compared with every earlier session (gym-specific exercises: same gym only).
 * At most one record per exercise: more added weight wins over more bodyweight reps.
 */
export function sessionRecords(
  session: Session, sessions: Session[], exercises: Exercise[], index: Map<string, HistoryEntry[]> = historyIndex(sessions),
): Record[] {
  const out: Record[] = [];
  // An exercise logged twice in one workout counts once, with all its sets.
  const setsByExercise = new Map<string, LoggedSet[]>();
  for (const item of session.blocks.flatMap((b) => b.items)) {
    setsByExercise.set(item.exerciseId, [...(setsByExercise.get(item.exerciseId) ?? []), ...item.sets]);
  }
  for (const [exerciseId, sets] of setsByExercise) {
    const ex = exercises.find((e) => e.id === exerciseId);
    if (!ex) continue;
    const list = index.get(ex.id) ?? [];
    const gymId = ex.gymSpecific ? session.gymId : null;
    for (const kind of recordKinds(ex)) {
      const rb = runningBest(list, kind, gymId);
      const i = lastBefore(rb.at, session.startedAt);
      if (i < 0) break;
      const now = bestOf(sets, kind);
      if (!now) continue;
      const previousBest = rb.best[i];
      if (now.value > previousBest) {
        out.push({ exerciseId: ex.id, set: now.set, kind, value: now.value, previousBest });
        break;
      }
    }
  }
  return out;
}

/**
 * One line for a record: "100 kg × 5, estimated max 116.7 kg (+2.5)", "Held 1:05 (+5 s)",
 * "+5 kg, held 1:05 (+5 s)", "15 reps at bodyweight (+2)", "BW +10 kg × 7, most added weight (+2.5 kg)".
 */
export function recordText(r: Record, ex: Pick<Exercise, 'equipment' | 'measure'> | undefined): string {
  const gain = r.value - r.previousBest;
  const kg = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)} kg`;
  switch (r.kind) {
    case 'hold':
      return r.set.weight > 0 ? `+${kg(r.set.weight)}, held ${seconds(r.value)} (+${seconds(gain)})` : `Held ${seconds(r.value)} (+${seconds(gain)})`;
    case 'reps':
      return `${r.value} reps at bodyweight (+${gain})`;
    case 'added':
      return `${setText(r.set, ex)}, most added weight (+${kg(gain)})`;
    default:
      return `${setText(r.set, ex)}, estimated max ${r.value.toFixed(1)} kg (+${gain.toFixed(1)})`;
  }
}

/** Best weight lifted for each rep count from 1 to 12 (a rep-max table). */
export function repMaxes(sets: LoggedSet[]): Map<number, LoggedSet> {
  const out = new Map<number, LoggedSet>();
  for (const s of workSets(sets)) {
    if (s.reps < 1 || s.reps > 12) continue;
    const cur = out.get(s.reps);
    if (!cur || s.weight > cur.weight) out.set(s.reps, s);
  }
  return out;
}
