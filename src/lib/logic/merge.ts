import { SNAPSHOT_VERSION, type ExportFile, type Snapshot } from '../model';
import { uid } from '../id';
import { LIMITS, newestFirst } from '../repo/validate';

/**
 * Merging an imported file into existing data, and building files to share. Match and skip: anything already
 * present is left alone, so importing the same file twice adds nothing.
 */

export interface MergePick {
  routines: boolean;
  exercises: boolean;
  sessions: boolean;
  body: boolean;
}

export interface MergeSummary {
  exercisesAdded: string[];
  exercisesMatched: number;
  gymsAdded: string[];
  routinesAdded: string[];
  routinesSkipped: string[];
  sessionsAdded: number;
  sessionsSkipped: number;
  bodyAdded: number;
  bodySkipped: number;
  setupsAdded: number;
}

/** Names compare case-insensitively, ignoring extra spaces. */
export const sameName = (a: string, b: string) => norm(a) === norm(b);
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

const minute = (iso: string) => Math.floor(Date.parse(iso) / 60_000);

export function isEmpty(s: MergeSummary): boolean {
  return !s.exercisesAdded.length && !s.gymsAdded.length && !s.routinesAdded.length
    && !s.sessionsAdded && !s.bodyAdded && !s.setupsAdded;
}

/**
 * Plan a merge without touching the inputs. `next` is the merged snapshot to save; `summary` drives the
 * preview. Routines and workouts bring the exercises (and workouts their gyms) they need, picked or not.
 * `overLimit` says why `next` must not be saved (it holds more than loads, see LIMITS), or is ''.
 */
export function planMerge(
  current: Snapshot, file: ExportFile, pick: MergePick, newId: () => string = uid,
): { next: Snapshot; summary: MergeSummary; overLimit: string } {
  const next = structuredClone(current);
  const src = structuredClone(file);
  const summary: MergeSummary = {
    exercisesAdded: [], exercisesMatched: 0, gymsAdded: [], routinesAdded: [], routinesSkipped: [],
    sessionsAdded: 0, sessionsSkipped: 0, bodyAdded: 0, bodySkipped: 0, setupsAdded: 0,
  };

  // Which routines and workouts are new.
  const routines = pick.routines ? src.routines.filter((r) => {
    if (next.routines.some((x) => sameName(x.name, r.name)) || summary.routinesAdded.some((n) => sameName(n, r.name))) {
      summary.routinesSkipped.push(r.name);
      return false;
    }
    summary.routinesAdded.push(r.name);
    return true;
  }) : [];
  const sessions = pick.sessions ? src.sessions.filter((s) => {
    const dup = next.sessions.some((x) => x.id === s.id || (minute(x.startedAt) === minute(s.startedAt) && sameName(x.name, s.name)));
    if (dup) summary.sessionsSkipped++;
    return !dup;
  }) : [];
  summary.sessionsAdded = sessions.length;

  // Exercises: everything when picked, otherwise only what the new routines and workouts use.
  const usedEx = new Set<string>(pick.exercises ? src.exercises.map((e) => e.id) : []);
  for (const r of routines) for (const b of r.blocks) for (const it of b.items) usedEx.add(it.exerciseId);
  for (const s of sessions) for (const b of s.blocks) for (const it of b.items) usedEx.add(it.exerciseId);
  const exMap = new Map<string, string>();
  for (const e of src.exercises) {
    if (!usedEx.has(e.id)) continue;
    const match = next.exercises.find((x) => sameName(x.name, e.name));
    if (match) {
      // Importing an exercise you deleted earlier brings it back.
      delete match.archived;
      exMap.set(e.id, match.id);
      summary.exercisesMatched++;
      continue;
    }
    const id = next.exercises.some((x) => x.id === e.id) ? newId() : e.id;
    next.exercises.push({ ...e, id });
    exMap.set(e.id, id);
    summary.exercisesAdded.push(e.name);
  }

  // Gyms: only those the new workouts were recorded at.
  const usedGyms = new Set(sessions.map((s) => s.gymId));
  const gymMap = new Map<string, string>();
  for (const g of src.gyms) {
    if (!usedGyms.has(g.id)) continue;
    const match = next.gyms.find((x) => sameName(x.name, g.name));
    if (match) {
      gymMap.set(g.id, match.id);
      continue;
    }
    const id = next.gyms.some((x) => x.id === g.id) ? newId() : g.id;
    next.gyms.push({ ...g, id });
    gymMap.set(g.id, id);
    summary.gymsAdded.push(g.name);
  }

  for (const r of routines) {
    for (const b of r.blocks) for (const it of b.items) it.exerciseId = exMap.get(it.exerciseId)!;
    if (next.routines.some((x) => x.id === r.id)) r.id = newId();
    next.routines.push(r);
  }

  for (const s of sessions) {
    s.gymId = gymMap.get(s.gymId)!;
    for (const b of s.blocks) {
      for (const it of b.items) {
        it.exerciseId = exMap.get(it.exerciseId)!;
        if (it.plan) it.plan.exerciseId = it.exerciseId;
      }
    }
    // Link to a routine of the same name if there is one after the merge.
    const name = src.routines.find((r) => r.id === s.routineId)?.name ?? s.name;
    const routine = next.routines.find((r) => sameName(r.name, name));
    if (routine) s.routineId = routine.id;
    else delete s.routineId;
    next.sessions.push(s);
  }
  next.sessions.sort(newestFirst);

  if (pick.body) {
    for (const e of src.body) {
      if (next.body.some((x) => x.date === e.date)) summary.bodySkipped++;
      else {
        next.body.push(e);
        summary.bodyAdded++;
      }
    }
    next.body.sort((a, b) => a.date.localeCompare(b.date));
  }

  for (const st of src.setups) {
    const gymId = gymMap.get(st.gymId);
    const exerciseId = exMap.get(st.exerciseId);
    if (!gymId || !exerciseId || (!st.note && !st.increment)) continue;
    if (next.setups.some((x) => x.gymId === gymId && x.exerciseId === exerciseId)) continue;
    next.setups.push({ gymId, exerciseId, note: st.note, increment: st.increment });
    summary.setupsAdded++;
  }

  return { next, summary, overLimit: overLimit(next) };
}

const LIST_NAMES = {
  gyms: 'gyms', exercises: 'exercises', setups: 'gym setups', routines: 'routines', sessions: 'workouts',
  body: 'body entries',
} as const;

function overLimit(next: Snapshot): string {
  for (const [key, name] of Object.entries(LIST_NAMES) as [keyof typeof LIST_NAMES, string][]) {
    if (next[key].length > LIMITS[key]) {
      return `Together with your data that makes ${next[key].length} ${name}, more than the ${LIMITS[key]} Kratos can keep. Import less, or delete some first.`;
    }
  }
  return '';
}

export interface ExportPick {
  /** Specific routines; overrides `routines`. */
  routineIds?: string[];
  routines?: boolean;
  exercises?: boolean;
  sessions?: boolean;
  body?: boolean;
}

/** A file with the chosen data and everything it refers to. Never includes settings. */
export function buildExport(snap: Snapshot, pick: ExportPick): ExportFile {
  const routines = pick.routineIds
    ? snap.routines.filter((r) => pick.routineIds!.includes(r.id))
    : pick.routines ? snap.routines : [];
  const sessions = pick.sessions ? snap.sessions : [];
  const usedEx = new Set<string>();
  for (const r of routines) for (const b of r.blocks) for (const it of b.items) usedEx.add(it.exerciseId);
  for (const s of sessions) for (const b of s.blocks) for (const it of b.items) usedEx.add(it.exerciseId);
  const exercises = snap.exercises.filter((e) => pick.exercises || usedEx.has(e.id));
  const gymIds = new Set(sessions.map((s) => s.gymId));
  const exIds = new Set(exercises.map((e) => e.id));
  return structuredClone({
    kratos: 'export' as const,
    version: SNAPSHOT_VERSION,
    gyms: snap.gyms.filter((g) => gymIds.has(g.id)),
    exercises,
    setups: snap.setups.filter((s) => gymIds.has(s.gymId) && exIds.has(s.exerciseId)),
    routines,
    sessions,
    body: pick.body ? snap.body : [],
  });
}
