import { DEFAULT_DROP_PCT, GYM_COLORS, isTimed } from './model';
import type {
  BodyEntry, Exercise, Gym, LoggedSet, PlannedExercise, RestTimer, Session, SessionBlock, SessionExercise, SetType,
  Snapshot,
} from './model';
import {
  dropWeight, exerciseHistory, historyIndex, incrementFor, suggestNext, warmupSets, type Suggestion,
} from './logic/training';
import { restAfter, restCues, upNext, type RestContext } from './logic/rest';
import { formatDistance, gymAt, type Fix } from './logic/geo';
import { deleteExercise } from './logic/library';
import { decide, hashText, isBlank, mergeBoth, parseSyncState, type RemoteFile, type SyncState } from './logic/sync';
import { clientId, DriveApi, DriveError, NeedsSignIn, loadGis } from './sync/drive';
import { IdbRepo } from './repo/idb';
import { starter } from './repo/starter';
import { LIMITS, newestFirst, parseBackup, parseDraft, parseSession } from './repo/validate';
import { OtherTabError, type Repo } from './repo/types';
import { cancelCues, scheduleCues, unlockSound } from './sound';
import { showRest } from './media';
import { keepScreenOn } from './wakelock.svelte';
import { persistStorage } from './storage.svelte';
import { uid } from './id';
import { clampNumber, cleanText } from './logic/limits';
import { planOf } from './logic/plans';
import { setText } from './format';

const repo: Repo = new IdbRepo();

export const app = $state({
  data: null as Snapshot | null,
  gymId: '',
  active: null as Session | null,
  rest: null as RestTimer | null,
  /** The rest timer fills the screen; it opens that way and can be shrunk to the bar. */
  restFull: false,
  /** Block of the last logged set: where the search for the next set starts (see upNext). */
  upNextFrom: 0,
  /** A set row for the workout screen to scroll to; `n` changes on every request. */
  scrollTo: null as { setId: string; n: number } | null,
  now: Date.now(),
  /** Set when saving to the device failed or was disabled; shown as a banner. */
  storageError: '',
  /** A timed set being held right now. */
  setTimer: null as SetTimer | null,
  /** Result of gym detection for the workout in progress, with the gym to go back to if it switched. */
  gymNotice: null as { text: string; busy?: boolean; undoGymId?: string } | null,
  /** Google Drive sync. `state` is null when not connected; `remote` holds Drive's copy during a conflict. */
  sync: {
    state: null as SyncState | null,
    status: 'idle' as SyncStatus,
    message: '',
    remote: null as { file: RemoteFile; data: Snapshot } | null,
  },
});

/** signin: a tap is needed to get a Google token (on every launch, and about hourly). */
export type SyncStatus = 'idle' | 'syncing' | 'signin' | 'conflict' | 'error';

export { uid };

/** False when the stored data could not be read: saving then would overwrite it. */
let canSave = true;

export async function init() {
  let stored: Snapshot | null = null;
  try {
    await repo.claim();
    stored = await repo.load();
  } catch (err) {
    canSave = false;
    app.storageError = `Could not open data on this device (${(err as Error).message}). Changes won't be saved.`;
  }
  try {
    app.data = stored ? parseBackup(JSON.stringify(stored)) : starter();
  } catch (err) {
    // Keep the unreadable data untouched rather than overwrite it with an empty start.
    canSave = false;
    app.storageError = `Saved data on this device looks damaged (${(err as Error).message}). Changes won't be saved; export it from the browser before resetting.`;
    app.data = starter();
  }
  app.gymId = app.data.settings.defaultGymId;

  if (canSave) {
    try {
      const draft = parseDraft(await repo.loadDraft(), app.data);
      if (draft) {
        app.active = draft.session;
        app.gymId = draft.session.gymId;
        // A rest that ended long ago is stale; one still running continues where it was.
        app.rest = draft.rest && draft.rest.endsAt > Date.now() - 60_000 ? draft.rest : null;
      }
    } catch {
      // An unreadable draft is dropped; the saved workouts are unaffected.
    }
    if (!stored) await saveNow();
    void persistStorage();
    try {
      app.sync.state = clientId ? parseSyncState(await repo.loadSync()) : null;
    } catch {
      app.sync.state = null;
    }
    if (app.sync.state) {
      app.sync.status = 'signin';
      // Load Google's script early so the sign-in window opens straight from the first tap.
      if (navigator.onLine) loadGis().catch(() => undefined);
    }
  }

  setInterval(() => (app.now = Date.now()), 250);
  $effect.root(() => {
    $effect(() => {
      $state.snapshot(app.data);
      persist();
    });
    $effect(() => {
      keepScreenOn(app.data?.settings.keepScreenOn ?? false);
    });
    $effect(scheduleCountdown);
    $effect(restNotification);
    $effect(() => {
      $state.snapshot(app.active);
      $state.snapshot(app.rest);
      persistDraft();
    });
  });
  addEventListener('pagehide', () => void flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush().then(() => autoSync());
    else if (canSave) void repo.isWriter().then((ok) => ok || lostToOtherTab(), () => undefined);
  });
}

/** Kratos was opened in another tab or window, which saves from now on (see Repo.claim). This one stops. */
function lostToOtherTab() {
  canSave = false;
  clearTimeout(syncTimer);
  app.storageError = 'Kratos is open in another tab or window, so changes here are no longer saved. Reload this page to use it here instead.';
}

/** Countdown beeps for the set timer or the rest, scheduled ahead whenever either changes (see sound.ts). */
function scheduleCountdown() {
  const st = app.data?.settings;
  const t = app.setTimer;
  const r = app.rest;
  if (!st?.sound) return cancelCues();
  const opts = { soundVolume: st.soundVolume, pauseMusic: st.pauseMusic };
  if (t && t.targetSec > 0) {
    scheduleCues(t.startedAt + t.targetSec * 1000, restCues(t.targetSec).filter((q) => q.kind !== 'ten'), opts);
  } else if (r) scheduleCues(r.endsAt, restCues(r.total), opts);
  else cancelCues();
}

/** The rest and the next set in the phone's media notification (see media.ts). */
function restNotification() {
  const r = app.rest;
  const s = app.active;
  if (!r || !s) return showRest(null, restActions);
  const next = upNext(s, app.upNextFrom);
  const ex = next && exercise(s.blocks[next.blockIndex].items[next.itemIndex].exerciseId);
  showRest({
    title: next && ex ? `Next: ${ex.name}` : r.label,
    detail: next && ex ? setText(next.set, ex) : 'Rest',
    endsAt: r.endsAt,
    totalSec: r.total,
  }, restActions);
}

const restActions = { more: () => adjustRest(15), less: () => adjustRest(-15), skip: () => skipRest() };

let dataTimer: ReturnType<typeof setTimeout> | undefined;
let draftTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Why the app couldn't load this data back, or '' if it can. Saving such data would lose everything on the next
 * start (see init), so it is refused instead. Saved workouts are left out: they change only through store
 * functions that keep them valid, and checking them every time is slow on a phone.
 */
function unloadable(snap: Snapshot): string {
  if (snap.sessions.length > LIMITS.sessions) return `more than ${LIMITS.sessions} workouts`;
  try {
    parseBackup(JSON.stringify({ ...snap, sessions: [] }));
    return '';
  } catch (err) {
    return (err as Error).message;
  }
}

async function saveNow() {
  clearTimeout(dataTimer);
  dataTimer = undefined;
  if (!canSave || !app.data) return;
  const snap = $state.snapshot(app.data);
  const problem = unloadable(snap);
  if (problem) {
    app.storageError = `Saving failed: ${problem}. Undo the last change, or export a backup from More.`;
    return;
  }
  try {
    await repo.save(snap);
    if (app.storageError.startsWith('Saving failed')) app.storageError = '';
    scheduleSync();
  } catch (err) {
    if (err instanceof OtherTabError) lostToOtherTab();
    else app.storageError = `Saving failed: ${(err as Error).message}. Export a backup from More.`;
  }
}

async function saveDraftNow() {
  clearTimeout(draftTimer);
  draftTimer = undefined;
  if (!canSave || !app.data) return;
  const draft = app.active ? { session: $state.snapshot(app.active), rest: $state.snapshot(app.rest) } : null;
  try {
    // A draft the app couldn't read back would be dropped on the next start, losing the workout.
    if (draft) parseDraft(JSON.parse(JSON.stringify(draft)), app.data);
  } catch (err) {
    app.storageError = `Saving the workout in progress failed: ${(err as Error).message}`;
    return;
  }
  try {
    await repo.saveDraft(draft);
    if (app.storageError.startsWith('Saving the workout')) app.storageError = '';
  } catch (err) {
    if (err instanceof OtherTabError) lostToOtherTab();
    else app.storageError = `Saving the workout in progress failed: ${(err as Error).message}`;
  }
}

/** Save soon; changes arrive in bursts while typing. */
function persist() {
  clearTimeout(dataTimer);
  dataTimer = setTimeout(saveNow, 300);
}

function persistDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraftNow, 300);
}

/** Write pending changes now, e.g. when the app goes to the background. */
export async function flush() {
  await Promise.all([dataTimer ? saveNow() : null, draftTimer ? saveDraftNow() : null]);
}

/** The loaded snapshot; screens only render after `init` resolves. */
export const db = () => app.data!;

export function exercise(id: string): Exercise | undefined {
  return db().exercises.find((e) => e.id === id);
}

export function gym(id: string): Gym | undefined {
  return db().gyms.find((g) => g.id === id);
}

export const currentGym = () => gym(app.gymId) ?? db().gyms[0];

/** CSS colour for a gym tag; unknown values fall back instead of reaching the style attribute. */
export function gymColor(g: Gym | undefined): string {
  const c = g?.color;
  return `var(--gym-${c && (GYM_COLORS as readonly string[]).includes(c) ? c : 'red'})`;
}

const setupFor = (exerciseId: string, gymId: string) =>
  db().setups.find((s) => s.exerciseId === exerciseId && s.gymId === gymId);

export function setupNote(exerciseId: string, gymId: string): string | undefined {
  return setupFor(exerciseId, gymId)?.note;
}

export function setSetupNote(exerciseId: string, gymId: string, note: string) {
  const found = setupFor(exerciseId, gymId);
  if (found) found.note = note;
  else db().setups.push({ exerciseId, gymId, note });
}

/** The machine's own weight step at a gym, if set. */
export function setupIncrement(exerciseId: string, gymId: string): number | undefined {
  return setupFor(exerciseId, gymId)?.increment;
}

/** Set a machine's weight step at a gym, or clear it (empty or below 0.1 kg) to use the gym's step. */
export function setSetupIncrement(exerciseId: string, gymId: string, increment: number) {
  const value = Number.isFinite(increment) && increment >= 0.1 ? Math.min(increment, 100) : undefined;
  const found = setupFor(exerciseId, gymId);
  if (found) {
    if (value === undefined) delete found.increment;
    else found.increment = value;
  } else if (value !== undefined) db().setups.push({ exerciseId, gymId, note: '', increment: value });
}

/** Smallest weight jump for an exercise at a gym, including the machine's own step. */
export const stepFor = (ex: Exercise, g: Gym) => incrementFor(ex, g, setupFor(ex.id, g.id));

/** History scope for an exercise: its own gym for machines and cables, everywhere otherwise. */
// Rebuilt only when saved workouts change, not on every lookup.
const history = $derived(historyIndex(app.data?.sessions ?? []));

/** Each exercise's logged entries, newest first (see historyIndex). */
export const historyByExercise = () => history;

export function historyFor(ex: Exercise, gymId: string, allGyms = false) {
  return exerciseHistory(db().sessions, ex, ex.gymSpecific && !allGyms ? gymId : null, history);
}

/** Sets from the last workout that had more than warmups (a warmup-only workout says nothing about targets). */
export function lastSets(ex: Exercise, gymId: string): LoggedSet[] | undefined {
  return historyFor(ex, gymId).find((h) => h.entry.sets.some((x) => x.done && x.type !== 'warmup'))?.entry.sets;
}

export function suggestionFor(plan: PlannedExercise | undefined, ex: Exercise, gymId: string): Suggestion | null {
  if (!plan) return null;
  const g = gym(gymId);
  if (!g) return null;
  return suggestNext(plan, lastSets(ex, gymId), stepFor(ex, g));
}

const blankSet = (type: SetType, weight = 0, reps = 0): LoggedSet => ({ id: uid(), type, weight, reps, done: false });
const timedSet = (type: SetType, weight: number, sec: number): LoggedSet => ({ ...blankSet(type, weight, 0), durationSec: sec });

/** Default targets: 3 × 8–12 reps, or 3 holds of 30–60 s for timed exercises. */
export const defaultScheme = (ex: Exercise): PlannedExercise['scheme'] => isTimed(ex)
  ? { kind: 'timed', sets: 3, secMin: 30, secMax: 60 }
  : { kind: 'straight', sets: 3, repsMin: 8, repsMax: 12, rir: 2 };

/** Plan for an exercise added outside a routine: default targets with the exercise's own rest. */
export function defaultPlan(ex: Exercise, g: Gym): PlannedExercise {
  return {
    exerciseId: ex.id,
    warmup: 'none',
    scheme: defaultScheme(ex),
    restSec: ex.restSec ?? db().settings.defaultRestSec,
    progression: { kind: 'double', increment: 0 },
  };
}

function plannedSets(plan: PlannedExercise, ex: Exercise, g: Gym): LoggedSet[] {
  const last = lastSets(ex, g.id);
  const s = suggestNext(plan, last, stepFor(ex, g));
  const scheme = plan.scheme;
  const weight = s?.weight ?? 0;
  if (scheme.kind === 'timed') {
    const sec = s?.sec ?? scheme.secMin;
    return Array.from({ length: scheme.sets }, () => timedSet('working', weight, sec));
  }
  const reps = s?.reps ?? scheme.repsMin;
  const sets: LoggedSet[] = [];
  if (plan.warmup === 'auto') {
    for (const w of warmupSets(ex, g, weight, stepFor(ex, g))) sets.push(blankSet('warmup', w.weight, w.reps));
  }
  for (let i = 0; i < scheme.sets; i++) sets.push(blankSet('working', weight, reps));
  // Drops get lighter from today's weight; reps start from last time's drops.
  const lastDrops = last?.filter((x) => x.type === 'drop') ?? [];
  let w = weight;
  for (let i = 0; i < (scheme.drops ?? 0); i++) {
    w = dropWeight(w, scheme.dropPct ?? DEFAULT_DROP_PCT, stepFor(ex, g));
    sets.push(blankSet('drop', w, lastDrops[i]?.reps ?? reps));
  }
  return sets;
}

export class LocateError extends Error {}

/** One position fix. Errors carry a message that says what to do. */
export function locate(): Promise<Fix> {
  if (!isSecureContext) {
    return Promise.reject(new LocateError('Location needs a secure connection: open the app over HTTPS or on localhost.'));
  }
  if (!('geolocation' in navigator)) return Promise.reject(new LocateError('This browser has no location support.'));
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new LocateError(
        e.code === e.PERMISSION_DENIED
          ? 'Location is blocked for this site. Allow it in the browser’s site settings.'
          : e.code === e.TIMEOUT
            ? 'Finding your location took too long. Try again near a window or outdoors.'
            : 'Your location is unavailable right now.',
      )),
      // Always a fresh fix: a cached one could still point at the last gym.
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
    );
  });
}

/**
 * Pick the gym from the current position for a workout that just started. Leaves the gym alone if
 * detection is off, no gym has a location, or the gym was changed by hand meanwhile.
 */
async function detectGym(sessionId: string, startGymId: string) {
  const { settings, gyms } = db();
  if (!settings.detectGym || !gyms.some((g) => g.location)) return;
  app.gymNotice = { text: 'Checking which gym you’re at…', busy: true };
  let fix: Fix;
  try {
    fix = await locate();
  } catch (err) {
    if (app.active?.id === sessionId) {
      app.gymNotice = { text: `Couldn’t detect the gym. ${(err as Error).message}` };
    }
    return;
  }
  const s = app.active;
  if (!s || s.id !== sessionId) return;
  if (s.gymId !== startGymId) {
    app.gymNotice = null;
    return;
  }
  const hit = gymAt(db().gyms, fix);
  const start = gym(startGymId)?.name ?? 'your gym';
  if (!hit) {
    app.gymNotice = { text: `No saved gym nearby, so this workout stays at ${start}.` };
  } else if (hit.gym.id === startGymId) {
    // Nothing changed, so the confirmation goes away by itself.
    const text = `You’re at ${hit.gym.name} (${formatDistance(hit.distance)} away).`;
    app.gymNotice = { text };
    setTimeout(() => {
      if (app.gymNotice?.text === text && !app.gymNotice.undoGymId) app.gymNotice = null;
    }, 4000);
  } else {
    switchGym(hit.gym.id);
    app.gymNotice = {
      text: `You’re at ${hit.gym.name} (${formatDistance(hit.distance)} away), so the workout switched from ${start}.`,
      undoGymId: startGymId,
    };
  }
}

export function startWorkout(routineId?: string) {
  const g = currentGym();
  const routine = db().routines.find((r) => r.id === routineId);
  unlockSound();
  app.rest = null;
  app.gymNotice = null;
  app.setTimer = null;
  app.active = {
    id: uid(),
    name: routine?.name ?? 'Workout',
    startedAt: new Date().toISOString(),
    durationMin: 0,
    gymId: g.id,
    routineId: routine?.id,
    blocks: (routine?.blocks ?? []).flatMap((b) => {
      const items = b.items.flatMap((plan) => {
        const ex = exercise(plan.exerciseId);
        return ex ? [{ exerciseId: plan.exerciseId, plan: $state.snapshot(plan), sets: plannedSets(plan, ex, g) }] : [];
      });
      return items.length ? [{ id: uid(), items, roundRestSec: b.roundRestSec, transitionSec: b.transitionSec }] : [];
    }),
  };
  void detectGym(app.active.id, g.id);
}

export function addExercise(exerciseId: string) {
  const s = app.active;
  const ex = exercise(exerciseId);
  const g = gym(s?.gymId ?? '');
  if (!s || !ex || !g || s.blocks.length >= LIMITS.blocks) return;
  const last = lastSets(ex, s.gymId)?.filter((x) => x.type === 'working' || x.type === 'drop');
  const sets = last?.length
    ? last.map((x) => ({ ...blankSet(x.type, x.weight, x.reps), ...(x.durationSec !== undefined ? { durationSec: x.durationSec } : {}) }))
    : isTimed(ex)
      ? [0, 1, 2].map(() => timedSet('working', 0, 30))
      : [blankSet('working'), blankSet('working'), blankSet('working')];
  s.blocks.push({ id: uid(), items: [{ exerciseId, plan: defaultPlan(ex, g), sets }] });
}

export function addSet(item: SessionExercise, type: SetType) {
  if (item.sets.length >= LIMITS.sets) return;
  const ref = type === 'drop'
    ? item.sets.findLast((x) => x.type !== 'warmup')
    : item.sets.findLast((x) => x.type === type) ?? item.sets.findLast((x) => x.type !== 'warmup') ?? item.sets.at(-1);
  const set = blankSet(type, ref?.weight ?? 0, ref?.reps ?? 0);
  if (type === 'drop') set.weight = dropFrom(item, ref?.weight ?? 0);
  if (ref?.durationSec !== undefined) set.durationSec = ref.durationSec;
  if (type === 'warmup') {
    const firstWork = item.sets.findIndex((x) => x.type !== 'warmup');
    item.sets.splice(firstWork === -1 ? item.sets.length : firstWork, 0, set);
  } else {
    item.sets.push(set);
  }
}

/** A drop set's weight: lighter than `from` by the plan's drop (20 % by default), on the equipment's step. */
function dropFrom(item: SessionExercise, from: number): number {
  const ex = exercise(item.exerciseId);
  const g = gym(app.active?.gymId ?? app.gymId);
  const scheme = item.plan?.scheme;
  const pct = scheme?.kind === 'straight' ? (scheme.dropPct ?? DEFAULT_DROP_PCT) : DEFAULT_DROP_PCT;
  return dropWeight(from, pct, ex && g ? stepFor(ex, g) : 2.5);
}

/**
 * Edit a set from the workout screen; bad input becomes 0 or empty. Weight is optional (empty = 0, which for
 * bodyweight exercises means no added weight).
 */
export function updateSet(set: LoggedSet, key: 'weight' | 'reps' | 'durationSec', value: number) {
  const ok = Number.isFinite(value) && value >= 0;
  if (key === 'durationSec') set.durationSec = ok ? Math.min(86_400, Math.round(value)) : 0;
  else set[key] = ok ? (key === 'reps' ? Math.min(1000, Math.round(value)) : Math.min(2000, value)) : 0;
}

/**
 * The set timer for timed exercises. It counts down from the set's target and keeps going past zero
 * (overtime) until stopped; with no target it is a plain stopwatch. Only one runs at a time.
 */
export interface SetTimer {
  setId: string;
  startedAt: number;
  targetSec: number;
}

export function startSetTimer(set: LoggedSet) {
  unlockSound();
  app.rest = null;
  app.now = Date.now();
  app.setTimer = { setId: set.id, startedAt: app.now, targetSec: set.durationSec ?? 0 };
}

/** Stop the timer: the time held becomes the set's duration and the set is logged. */
export function stopSetTimer(blockIndex: number, itemIndex: number, set: LoggedSet) {
  const t = app.setTimer;
  if (!t || t.setId !== set.id) return;
  app.setTimer = null;
  set.durationSec = Math.min(86_400, Math.max(1, Math.round((Date.now() - t.startedAt) / 1000)));
  if (!set.done) toggleDone(blockIndex, itemIndex, set);
}

export function cancelSetTimer() {
  app.setTimer = null;
}

/** Change a set's type; a warmup moves in front of the working sets. */
export function setSetType(item: SessionExercise, set: LoggedSet, type: SetType) {
  if (set.type === type) return;
  set.type = type;
  if (type !== 'warmup') return;
  const i = item.sets.indexOf(set);
  const firstWork = item.sets.findIndex((x) => x.type !== 'warmup');
  if (i > firstWork && firstWork !== -1) {
    item.sets.splice(i, 1);
    item.sets.splice(firstWork, 0, set);
  }
}

export function removeSet(item: SessionExercise, setId: string) {
  item.sets = item.sets.filter((x) => x.id !== setId);
}

function restContext(): RestContext {
  return {
    name: (id) => exercise(id)?.name ?? 'Exercise',
    exerciseRest: (id) => exercise(id)?.restSec,
    defaultRest: db().settings.defaultRestSec,
  };
}

/** Mark a set done and start the right rest (see logic/rest.ts). */
export function toggleDone(blockIndex: number, itemIndex: number, set: LoggedSet) {
  const s = app.active;
  if (!s) return;
  unlockSound();
  set.done = !set.done;
  if (!set.done) return;
  const item = s.blocks[blockIndex]?.items[itemIndex];
  if (!item) return;
  app.upNextFrom = blockIndex;
  const next = restAfter(s, blockIndex, itemIndex, set, restContext());
  if (next) startRest(next.sec, next.label);
  else app.rest = null;
  if (item.sets.every((x) => x.done)) scrollToNext();
}

let scrolls = 0;

/** Ask the workout screen to bring the next set into view. */
function scrollToNext() {
  const next = app.active && upNext(app.active, app.upNextFrom);
  if (next) app.scrollTo = { setId: next.set.id, n: ++scrolls };
}

export function startRest(sec: number, label: string) {
  unlockSound();
  // Refresh the clock too, or the first frame can show one second more than the rest.
  app.now = Date.now();
  app.rest = sec > 0 ? { endsAt: app.now + sec * 1000, total: sec, label } : null;
  app.restFull = app.rest !== null;
}

export function adjustRest(deltaSec: number) {
  if (!app.rest) return;
  app.now = Date.now();
  const left = Math.max(0, app.rest.endsAt - app.now);
  const next = Math.max(0, left + deltaSec * 1000);
  app.rest.endsAt = app.now + next;
  app.rest.total = Math.max(1, app.rest.total + deltaSec);
}

export function skipRest() {
  app.rest = null;
  app.restFull = false;
  scrollToNext();
}

/** Shrink the full-screen rest timer to the bar, showing the next set. */
export function shrinkRest() {
  if (!app.restFull) return;
  app.restFull = false;
  scrollToNext();
}

/** Same exercises in the same order: how a workout block finds its routine block. */
const sameExercises = (a: { exerciseId: string }[], b: { exerciseId: string }[]) =>
  a.length === b.length && a.every((x, i) => x.exerciseId === b[i].exerciseId);

export interface RestSaveOptions {
  exerciseDefault?: boolean;
  routine?: boolean;
}

/** Change an exercise's rest in this workout, and optionally in its routine and as its default. */
export function setItemRest(item: SessionExercise, sec: number, opts: RestSaveOptions = {}) {
  if (item.plan) item.plan.restSec = sec;
  const ex = exercise(item.exerciseId);
  if (opts.exerciseDefault && ex) ex.restSec = sec;
  if (opts.routine) {
    for (const p of routinePlans(item.exerciseId)) p.restSec = sec;
  }
}

/** Change a superset's rests: after each round, and between its exercises. */
export function setBlockRest(block: SessionBlock, roundSec: number, transitionSec: number, opts: RestSaveOptions = {}) {
  block.roundRestSec = roundSec;
  block.transitionSec = transitionSec;
  if (opts.routine) {
    const r = db().routines.find((x) => x.id === app.active?.routineId);
    const b = r?.blocks.find((x) => sameExercises(x.items, block.items));
    if (b) {
      b.roundRestSec = roundSec;
      b.transitionSec = transitionSec;
    }
  }
}

function routinePlans(exerciseId: string): PlannedExercise[] {
  const r = db().routines.find((x) => x.id === app.active?.routineId);
  return r?.blocks.flatMap((b) => b.items).filter((p) => p.exerciseId === exerciseId) ?? [];
}

export function moveBlock(index: number, dir: -1 | 1) {
  const blocks = app.active?.blocks;
  const to = index + dir;
  if (!blocks || to < 0 || to >= blocks.length) return;
  [blocks[index], blocks[to]] = [blocks[to], blocks[index]];
}

/** Merge a block with the next one into a superset. */
export function linkWithNext(index: number) {
  const blocks = app.active?.blocks;
  if (!blocks || index >= blocks.length - 1) return;
  if (blocks[index].items.length + blocks[index + 1].items.length > LIMITS.items) return;
  blocks[index].items.push(...blocks[index + 1].items);
  blocks.splice(index + 1, 1);
}

/** Split an exercise out of a superset into its own block, placed right after it. */
export function unlink(blockIndex: number, itemIndex: number) {
  const blocks = app.active?.blocks;
  if (!blocks || (blocks.length >= LIMITS.blocks && blocks[blockIndex].items.length > 1)) return;
  const [item] = blocks[blockIndex].items.splice(itemIndex, 1);
  blocks.splice(blockIndex + 1, 0, { id: uid(), items: [item] });
  if (blocks[blockIndex].items.length === 0) blocks.splice(blockIndex, 1);
}

export function removeExercise(blockIndex: number, itemIndex: number) {
  const blocks = app.active?.blocks;
  if (!blocks) return;
  blocks[blockIndex].items.splice(itemIndex, 1);
  if (blocks[blockIndex].items.length === 0) blocks.splice(blockIndex, 1);
}

/**
 * Change the current gym. In a workout, gym-specific exercises with nothing logged yet are re-planned
 * from that gym's history, since machine weights don't carry over between gyms.
 */
export function switchGym(gymId: string) {
  const g = gym(gymId);
  if (!g) return;
  app.gymId = gymId;
  const s = app.active;
  if (!s) return;
  s.gymId = gymId;
  for (const item of s.blocks.flatMap((b) => b.items)) {
    const ex = exercise(item.exerciseId);
    if (ex?.gymSpecific && item.plan && !item.sets.some((x) => x.done)) item.sets = plannedSets(item.plan, ex, g);
  }
}

/** Sets of the workout in progress that weren't ticked but have something to log (reps or time). */
export function unloggedSets(s: Session) {
  return s.blocks.flatMap((b) => b.items).flatMap((item) => {
    const sets = item.sets.filter((x) => !x.done && (x.reps > 0 || (x.durationSec ?? 0) > 0));
    return sets.length ? [{ item, sets }] : [];
  });
}

/** Tick every set listed by `unloggedSets`, as planned; no rest starts. */
export function logUnticked() {
  if (!app.active) return;
  for (const { sets } of unloggedSets(app.active)) for (const x of sets) x.done = true;
}

/** Rename the workout in progress, keeping it in `plan` if given; an empty name keeps the old one. */
export function renameWorkout(name: string, plan = '') {
  const s = app.active;
  if (!s) return;
  const day = cleanText(name, 60, '');
  if (day) s.name = cleanText(plan ? `${plan} > ${day}` : day, 60, s.name);
}

/**
 * Save the active workout, dropping unfinished sets. Returns the saved session id, or why it couldn't be saved
 * (the workout stays open then).
 */
export function finishWorkout(): { id: string } | { error: string } | null {
  const s = app.active;
  if (!s) return null;
  const draft: Session = $state.snapshot(s);
  draft.name = cleanText(draft.name, 60, 'Workout');
  if (draft.notes !== undefined) draft.notes = draft.notes.slice(0, 5000);
  draft.durationMin = Math.min(24 * 60, Math.max(1, Math.round((Date.now() - Date.parse(draft.startedAt)) / 60000)));
  draft.blocks = draft.blocks
    .map((b) => ({ ...b, items: b.items.map((it) => ({ ...it, sets: it.sets.filter((x) => x.done) })).filter((it) => it.sets.length) }))
    .filter((b) => b.items.length);
  // Saved workouts aren't re-checked on every save (see unloadable), so one the app couldn't load back is refused here.
  let session: Session;
  try {
    session = parseSession(draft, db());
  } catch (err) {
    return { error: `Couldn’t save the workout (${(err as Error).message}). Change that set and try again.` };
  }
  db().sessions.unshift(session);
  app.active = null;
  app.rest = null;
  app.gymNotice = null;
  app.setTimer = null;
  // Finishing is a tap, so Google may open its sign-in window if the token expired.
  void flush().then(() => app.sync.state && syncNow(true));
  return { id: session.id };
}

// Editing a saved workout. Its sets are all logged, so new ones are too, and nothing may be left empty.

export interface SessionDetails {
  name: string;
  /** Local date and time, as from <input type="datetime-local">. */
  start: string;
  durationMin: number;
  gymId: string;
  notes: string;
}

/** Change a saved workout's name, start, length, gym or notes. Returns an error message, or '' when saved. */
export function updateSessionDetails(session: Session, d: SessionDetails): string {
  const name = d.name.trim().slice(0, 60);
  const start = new Date(d.start);
  if (!name) return 'Give the workout a name.';
  if (!Number.isFinite(start.getTime())) return 'Pick the date and time it started.';
  if (!Number.isFinite(d.durationMin) || d.durationMin < 0 || d.durationMin > 24 * 60) {
    return 'Enter how long it took, in minutes (up to 24 hours).';
  }
  if (!gym(d.gymId)) return 'Pick one of your gyms.';
  session.name = name;
  session.startedAt = start.toISOString();
  session.durationMin = Math.round(d.durationMin);
  session.gymId = d.gymId;
  const notes = d.notes.trim().slice(0, 5000);
  if (notes) session.notes = notes;
  else delete session.notes;
  // Workouts are kept newest first.
  db().sessions.sort(newestFirst);
  return '';
}

/** Add a logged set to an exercise of a saved workout, like its last set. */
export function addSavedSet(item: SessionExercise) {
  if (item.sets.length >= LIMITS.sets) return;
  const ref = item.sets.findLast((x) => x.type !== 'warmup') ?? item.sets.at(-1);
  const set = blankSet('working', ref?.weight ?? 0, ref?.reps ?? 0);
  if (ref?.durationSec !== undefined) set.durationSec = ref.durationSec;
  set.done = true;
  item.sets.push(set);
}

/** Remove a set from a saved workout; an exercise left without sets goes too. */
export function removeSavedSet(session: Session, blockIndex: number, itemIndex: number, setId: string) {
  const item = session.blocks[blockIndex]?.items[itemIndex];
  if (!item) return;
  removeSet(item, setId);
  if (!item.sets.length) removeSavedExercise(session, blockIndex, itemIndex);
}

export function removeSavedExercise(session: Session, blockIndex: number, itemIndex: number) {
  const block = session.blocks[blockIndex];
  if (!block) return;
  block.items.splice(itemIndex, 1);
  if (!block.items.length) session.blocks.splice(blockIndex, 1);
}

/** Add an exercise someone forgot to log, with one set like their last one. */
export function addSavedExercise(session: Session, exerciseId: string) {
  const ex = exercise(exerciseId);
  if (!ex || session.blocks.length >= LIMITS.blocks) return;
  const ref = lastSets(ex, session.gymId)?.findLast((x) => x.type === 'working');
  const set = isTimed(ex) ? timedSet('working', ref?.weight ?? 0, ref?.durationSec ?? 30) : blankSet('working', ref?.weight ?? 0, ref?.reps ?? 8);
  set.done = true;
  session.blocks.push({ id: uid(), items: [{ exerciseId, sets: [set] }] });
}

export function deleteSession(sessionId: string) {
  const sessions = db().sessions;
  const i = sessions.findIndex((x) => x.id === sessionId);
  if (i !== -1) sessions.splice(i, 1);
}

export function discardWorkout() {
  app.active = null;
  app.rest = null;
  app.gymNotice = null;
  app.setTimer = null;
}

/** Save a day's body weight and measurements; values outside what a backup accepts are left out. */
export function addBodyEntry(input: BodyEntry) {
  const entry: BodyEntry = { date: input.date };
  const inRange = (v: number | undefined, min: number, max: number) => v !== undefined && Number.isFinite(v) && v >= min && v <= max;
  if (inRange(input.weight, 20, 400)) entry.weight = input.weight;
  for (const k of ['waist', 'chest', 'arm', 'thigh'] as const) if (inRange(input[k], 1, 300)) entry[k] = input[k];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !Number.isFinite(Date.parse(entry.date))) return;
  const body = db().body;
  const existing = body.find((b) => b.date === entry.date);
  if (existing) Object.assign(existing, entry);
  else body.push(entry);
  body.sort((a, b) => a.date.localeCompare(b.date));
}

export function saveGym(input: Gym) {
  const g: Gym = {
    ...input,
    name: cleanText(input.name, 60, gym(input.id)?.name ?? 'Gym'),
    bar: clampNumber(input.bar, 0, 100, 20),
    stackIncrement: clampNumber(input.stackIncrement, 0.1, 100, 5),
  };
  const gyms = db().gyms;
  const i = gyms.findIndex((x) => x.id === g.id);
  if (i === -1) gyms.push(g);
  else gyms[i] = g;
}

export function setDefaultGym(gymId: string) {
  if (gym(gymId)) db().settings.defaultGymId = gymId;
}

export function saveExercise(e: Exercise) {
  const list = db().exercises;
  const i = list.findIndex((x) => x.id === e.id);
  if (i === -1) list.push(e);
  else list[i] = e;
}

export function exportJson(): string {
  return JSON.stringify($state.snapshot(app.data), null, 2);
}

/** Replace everything (import, sample data, erase). Drops any workout in progress. */
export async function replaceData(next: Snapshot) {
  app.active = null;
  app.rest = null;
  app.setTimer = null;
  app.data = next;
  app.gymId = next.settings.defaultGymId;
  canSave = true;
  app.storageError = '';
  await saveNow();
  await saveDraftNow();
}

/** Save merged-in data (import). Unlike replaceData, the workout in progress is kept. */
export async function mergeData(next: Snapshot) {
  app.data = next;
  await saveNow();
}

/**
 * Delete an exercise from the library (see logic/library.ts). Refused while the workout in progress uses it,
 * since the workout screen needs it.
 */
export function deleteExerciseById(exerciseId: string): 'archived' | 'removed' | 'in-workout' {
  if (app.active?.blocks.some((b) => b.items.some((i) => i.exerciseId === exerciseId))) return 'in-workout';
  return deleteExercise(db(), exerciseId);
}

/** Hide an exercise from the exercise list and pickers, or bring it back. Routines and history keep it. */
export function setExerciseArchived(exerciseId: string, archived: boolean) {
  const ex = exercise(exerciseId);
  if (!ex) return;
  if (archived) ex.archived = true;
  else delete ex.archived;
}

export const restoreExercise = (exerciseId: string) => setExerciseArchived(exerciseId, false);

/** Hide a routine from Today and the routine list, or bring it back. Its workouts stay in history. */
export function setRoutineArchived(routineId: string, archived: boolean) {
  const r = db().routines.find((x) => x.id === routineId);
  if (!r) return;
  if (archived) r.archived = true;
  else delete r.archived;
}

/** Archive or restore every routine of a plan (see logic/plans.ts). */
export function setPlanArchived(plan: string, archived: boolean) {
  if (!plan) return;
  for (const r of db().routines) if (planOf(r.name) === plan) setRoutineArchived(r.id, archived);
}

/** A new empty routine, in `plan` when given. Returns its id. */
export function createRoutine(plan = ''): string {
  const id = uid();
  db().routines.push({ id, name: plan ? `${plan} > New day` : 'New routine', blocks: [] });
  return id;
}

/** Routines that aren't archived, in their saved order. */
export const activeRoutines = () => db().routines.filter((r) => !r.archived);

/** Switch an exercise between reps and time; its routine targets switch to the matching default. */
export function setMeasure(exerciseId: string, measure: 'reps' | 'time') {
  const ex = exercise(exerciseId);
  if (!ex || (ex.measure ?? 'reps') === measure) return;
  if (measure === 'time') ex.measure = 'time';
  else delete ex.measure;
  for (const p of db().routines.flatMap((r) => r.blocks.flatMap((b) => b.items))) {
    if (p.exerciseId === exerciseId) p.scheme = defaultScheme(ex);
  }
}

// Google Drive sync (see logic/sync.ts). Only this device's IndexedDB is needed to train; Drive gets a copy
// of the snapshot (not the workout in progress) and changes from other devices come back from it.

const drive = new DriveApi(clientId);
export const driveAvailable = !!clientId;

let syncRun: Promise<void> | null = null;
let syncTimer: ReturnType<typeof setTimeout> | undefined;

/** Sync a little after changes settle, while a token is at hand. */
function scheduleSync() {
  clearTimeout(syncTimer);
  if (app.sync.state && drive.hasToken()) syncTimer = setTimeout(autoSync, 10_000);
}

function autoSync() {
  if (app.sync.state && drive.hasToken() && app.sync.status !== 'conflict') void syncNow(false);
}

/** Sync now. `interactive` only from a tap: it may open Google's sign-in window. */
export function syncNow(interactive = false): Promise<void> {
  syncRun ??= runSync(interactive).finally(() => (syncRun = null));
  return syncRun;
}

async function runSync(interactive: boolean) {
  const st = app.sync.state;
  if (!st || !app.data || !canSave) return;
  clearTimeout(syncTimer);
  app.sync.status = 'syncing';
  app.sync.message = '';
  try {
    if (!(await repo.isWriter())) throw new OtherTabError();
    const account = await signIn(interactive);
    await flush();
    const remote = (st.fileId ? await drive.meta(st.fileId) : null) ?? await drive.find();
    const local = $state.snapshot(app.data);
    const text = JSON.stringify(local);
    const hash = hashText(text);
    const action = decide(hash, st, remote, isBlank(local));
    if (action === 'none') await recordSync(remote!, hash, account);
    else if (action === 'create') await recordSync(await drive.create(text), hash, account);
    else if (action === 'push') await recordSync(await drive.update(remote!.id, text), hash, account);
    else {
      const data = parseBackup(await drive.download(remote!.id));
      // Changes made here during the download (a deleted workout, an erase) must not be overwritten.
      const unchanged = hashText(JSON.stringify($state.snapshot(app.data))) === hash;
      if (hashText(JSON.stringify(data)) === hash) await recordSync(remote!, hash, account);
      else if (action === 'pull' && !app.active && unchanged) await takeRemote(remote!, data, account);
      else {
        app.sync.remote = { file: remote!, data };
        app.sync.status = 'conflict';
      }
    }
  } catch (err) {
    syncFailed(err, 'error');
  }
}

function syncFailed(err: unknown, status: SyncStatus) {
  if (err instanceof OtherTabError) {
    lostToOtherTab();
    app.sync.status = 'idle';
    app.sync.message = '';
    return;
  }
  // A conflict stays open until it is settled, whatever went wrong.
  const signin = status === 'error' && err instanceof NeedsSignIn;
  app.sync.status = signin ? 'signin' : status;
  app.sync.message = signin ? '' : `Couldn’t sync with Drive: ${(err as Error).message}`;
}

/**
 * A token for the Google account this device syncs with. Another account would see other files (or none),
 * so its Drive could replace the data here or receive a copy of it: that is refused.
 */
async function signIn(interactive: boolean): Promise<string> {
  await drive.token(interactive);
  const account = await drive.account();
  const want = app.sync.state?.account;
  if (want && account !== want) {
    drive.chooseAccount();
    throw new DriveError('That’s a different Google account from the one this device syncs with. Tap Sync now and pick that account, or disconnect and connect again to switch.');
  }
  return account;
}

async function recordSync(file: RemoteFile, hash: string, account: string) {
  const state: SyncState = { fileId: file.id, version: file.version, hash, syncedAt: new Date().toISOString(), account };
  await repo.saveSync(state);
  app.sync.state = state;
  app.sync.remote = null;
  app.sync.status = 'idle';
}

async function takeRemote(file: RemoteFile, data: Snapshot, account: string) {
  app.data = data;
  if (!gym(app.gymId)) app.gymId = data.settings.defaultGymId;
  await saveNow();
  if (!canSave) throw new OtherTabError();
  await recordSync(file, hashText(JSON.stringify($state.snapshot(app.data))), account);
}

/**
 * Settle a conflict: merge both (add what's missing on each side), take Drive's copy, or overwrite Drive
 * with this device's. Taking Drive's copy is refused during a workout, which needs this device's data.
 */
export async function resolveConflict(choice: 'merge' | 'drive' | 'device') {
  // One sync at a time: a background one could otherwise upload in between.
  while (syncRun) await syncRun;
  syncRun = settle(choice).finally(() => (syncRun = null));
  return syncRun;
}

async function settle(choice: 'merge' | 'drive' | 'device') {
  const remote = app.sync.remote;
  if (!remote || !app.data) return;
  if (choice === 'drive' && app.active) {
    app.sync.message = 'Finish or discard the workout in progress first, then use Drive’s copy.';
    return;
  }
  app.sync.status = 'syncing';
  app.sync.message = '';
  try {
    if (!(await repo.isWriter())) throw new OtherTabError();
    const account = await signIn(true);
    if (choice === 'drive') {
      await takeRemote(remote.file, $state.snapshot(remote.data), account);
      return;
    }
    // Another device may have synced while the choice was open; overwriting that would lose its changes.
    const current = await drive.meta(remote.file.id);
    if (current?.id !== remote.file.id || current.version !== remote.file.version) {
      app.sync.remote = null;
      await runSync(true);
      // runSync changed the status meanwhile.
      if ((app.sync.status as SyncStatus) === 'conflict') app.sync.message = 'Drive changed again on another device. Choose again.';
      return;
    }
    if (choice === 'merge') {
      app.data = mergeBoth($state.snapshot(app.data), $state.snapshot(remote.data));
      await saveNow();
      if (!canSave) throw new OtherTabError();
    }
    const text = JSON.stringify($state.snapshot(app.data));
    await recordSync(await drive.update(remote.file.id, text), hashText(text), account);
  } catch (err) {
    syncFailed(err, 'conflict');
  }
}

/** Connect from a tap: sign in, then sync (which creates the file or picks up an existing one). */
export async function connectDrive() {
  app.sync.message = '';
  try {
    await drive.token(true);
    await repo.saveSync({});
  } catch (err) {
    if (err instanceof OtherTabError) lostToOtherTab();
    else app.sync.message = (err as Error).message;
    return;
  }
  app.sync.state = {};
  await syncNow(true);
}

/** Stop syncing on this device. The file in Drive is left as it is. */
export async function disconnectDrive() {
  clearTimeout(syncTimer);
  await drive.signOut();
  app.sync = { state: null, status: 'idle', message: '', remote: null };
  try {
    await repo.saveSync(null);
  } catch (err) {
    if (err instanceof OtherTabError) lostToOtherTab();
    else app.sync.message = `Couldn’t disconnect on this device: ${(err as Error).message}`;
  }
}
