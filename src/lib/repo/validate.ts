import {
  GYM_COLORS, MUSCLES, SNAPSHOT_VERSION, isGymSpecificEquipment,
  type BodyEntry, type Draft, type Equipment, type ExportFile, type Exercise, type Gym, type GymSetup, type LoggedSet, type PlannedBlock,
  type PlannedExercise, type Progression, type RestTimer, type Routine, type Session, type SessionBlock, type SessionExercise,
  type SetScheme, type SetType, type Settings, type Snapshot,
} from '../model';
import { uid } from '../id';

/**
 * Validation for imported backups. The file is untrusted: every object is rebuilt from known fields only
 * (so keys like `__proto__` are never copied), every value is type- and range-checked, and references
 * between records must resolve. Errors name the path of the first bad value.
 */

export class ImportError extends Error {}

type Obj = Record<string, unknown>;

const fail = (path: string, what: string): never => {
  throw new ImportError(`${path}: ${what}`);
};

function obj(v: unknown, path: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, 'expected an object');
  return v as Obj;
}

/** Own properties only, so inherited names never count as present. */
const get = (o: Obj, key: string) => (Object.hasOwn(o, key) ? o[key] : undefined);

function str(v: unknown, path: string, max = 200, min = 0): string {
  if (typeof v !== 'string') fail(path, 'expected text');
  const s = v as string;
  if (s.length < min) fail(path, 'must not be empty');
  if (s.length > max) fail(path, `longer than ${max} characters`);
  return s;
}

const id = (v: unknown, path: string) => str(v, path, 100, 1);

function num(v: unknown, path: string, min: number, max: number, integer = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'expected a number');
  const n = v as number;
  if (n < min || n > max) fail(path, `must be between ${min} and ${max}`);
  if (integer && !Number.isInteger(n)) fail(path, 'expected a whole number');
  return n;
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') fail(path, 'expected true or false');
  return v as boolean;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], path: string): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) fail(path, `expected one of ${allowed.join(', ')}`);
  return v as T;
}

function arr<T>(v: unknown, path: string, max: number, each: (x: unknown, p: string) => T): T[] {
  if (!Array.isArray(v)) fail(path, 'expected a list');
  const a = v as unknown[];
  if (a.length > max) fail(path, `more than ${max} entries`);
  return a.map((x, i) => each(x, `${path}[${i}]`));
}

const opt = <T>(v: unknown, f: (x: unknown) => T): T | undefined => (v === undefined || v === null ? undefined : f(v));

/**
 * The most of each list that loads. Anything that adds to stored data (imports, store functions) must stay
 * within these, or the next start finds the data unreadable.
 */
export const LIMITS = {
  gyms: 50, exercises: 2000, setups: 20000, routines: 500, sessions: 20000, body: 20000,
  /** Per workout or routine. */
  blocks: 100,
  /** Exercises per block (a superset). */
  items: 10,
  /** Sets per exercise in a workout. */
  sets: 100,
} as const;

const KG = 2000;
const REST = 3600;
const EQUIPMENT: readonly Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'];
const SET_TYPES: readonly SetType[] = ['warmup', 'working', 'myo', 'mini', 'drop'];
const DEFAULT_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

function gym(v: unknown, p: string): Gym {
  const o = obj(v, p);
  return {
    id: id(get(o, 'id'), `${p}.id`),
    name: str(get(o, 'name'), `${p}.name`, 60, 1),
    color: oneOf(get(o, 'color'), GYM_COLORS, `${p}.color`),
    bar: num(get(o, 'bar'), `${p}.bar`, 0, 100),
    // A gym needs at least one plate size to plan barbell weights; older files may have none.
    plates: nonEmpty(arr(get(o, 'plates'), `${p}.plates`, 20, (x, q) => num(x, q, 0.1, 100)), DEFAULT_PLATES),
    stackIncrement: num(get(o, 'stackIncrement'), `${p}.stackIncrement`, 0.1, 100),
    location: opt(get(o, 'location'), (x) => {
      const l = obj(x, `${p}.location`);
      return {
        lat: num(get(l, 'lat'), `${p}.location.lat`, -90, 90),
        lng: num(get(l, 'lng'), `${p}.location.lng`, -180, 180),
        radiusM: num(get(l, 'radiusM'), `${p}.location.radiusM`, 25, 5000),
      };
    }),
  };
}

const nonEmpty = <T>(list: T[], fallback: T[]) => (list.length ? list : [...fallback]);

function exercise(v: unknown, p: string): Exercise {
  const o = obj(v, p);
  return {
    id: id(get(o, 'id'), `${p}.id`),
    name: str(get(o, 'name'), `${p}.name`, 80, 1),
    muscles: arr(get(o, 'muscles'), `${p}.muscles`, MUSCLES.length, (x, q) => oneOf(x, MUSCLES, q)),
    equipment: oneOf(get(o, 'equipment'), EQUIPMENT, `${p}.equipment`),
    gymSpecific: bool(get(o, 'gymSpecific'), `${p}.gymSpecific`),
    notes: opt(get(o, 'notes'), (x) => str(x, `${p}.notes`, 2000)),
    restSec: opt(get(o, 'restSec'), (x) => num(x, `${p}.restSec`, 0, REST, true)),
    archived: opt(get(o, 'archived'), (x) => bool(x, `${p}.archived`)) || undefined,
    measure: opt(get(o, 'measure'), (x) => oneOf(x, ['reps', 'time'] as const, `${p}.measure`)),
  };
}

function setup(v: unknown, p: string): GymSetup {
  const o = obj(v, p);
  return {
    gymId: id(get(o, 'gymId'), `${p}.gymId`),
    exerciseId: id(get(o, 'exerciseId'), `${p}.exerciseId`),
    note: str(get(o, 'note'), `${p}.note`, 200),
    increment: opt(get(o, 'increment'), (x) => num(x, `${p}.increment`, 0.1, 100)),
  };
}

function scheme(v: unknown, p: string): SetScheme {
  const o = obj(v, p);
  const kind = oneOf(get(o, 'kind'), ['straight', 'myo', 'timed'] as const, `${p}.kind`);
  if (kind === 'timed') {
    return {
      kind,
      sets: num(get(o, 'sets'), `${p}.sets`, 1, 20, true),
      secMin: num(get(o, 'secMin'), `${p}.secMin`, 1, 3600, true),
      secMax: num(get(o, 'secMax'), `${p}.secMax`, 1, 3600, true),
    };
  }
  if (kind === 'straight') {
    return {
      kind,
      sets: num(get(o, 'sets'), `${p}.sets`, 1, 20, true),
      repsMin: num(get(o, 'repsMin'), `${p}.repsMin`, 1, 100, true),
      repsMax: num(get(o, 'repsMax'), `${p}.repsMax`, 1, 100, true),
      rir: num(get(o, 'rir'), `${p}.rir`, 0, 10, true),
      drops: opt(get(o, 'drops'), (x) => num(x, `${p}.drops`, 0, 5, true)),
      dropPct: opt(get(o, 'dropPct'), (x) => num(x, `${p}.dropPct`, 5, 60, true)),
      dropRestSec: opt(get(o, 'dropRestSec'), (x) => num(x, `${p}.dropRestSec`, 0, REST, true)),
    };
  }
  // Myo-reps (before snapshot 6) become 3 straight sets over the activation range, close to failure.
  const a = num(get(o, 'activationMin'), `${p}.activationMin`, 1, 100, true);
  const b = num(get(o, 'activationMax'), `${p}.activationMax`, 1, 100, true);
  return { kind: 'straight', sets: 3, repsMin: Math.min(a, b), repsMax: Math.max(a, b), rir: 1 };
}

function progression(v: unknown, p: string): Progression {
  const o = obj(v, p);
  const kind = oneOf(get(o, 'kind'), ['double', 'linear', 'none'] as const, `${p}.kind`);
  return kind === 'none' ? { kind } : { kind, increment: num(get(o, 'increment'), `${p}.increment`, 0, 100) };
}

function planned(v: unknown, p: string): PlannedExercise {
  const o = obj(v, p);
  return {
    exerciseId: id(get(o, 'exerciseId'), `${p}.exerciseId`),
    warmup: oneOf(get(o, 'warmup'), ['auto', 'none'] as const, `${p}.warmup`),
    scheme: scheme(get(o, 'scheme'), `${p}.scheme`),
    restSec: num(get(o, 'restSec'), `${p}.restSec`, 0, REST, true),
    progression: progression(get(o, 'progression'), `${p}.progression`),
  };
}

function blockRest(o: Obj, p: string) {
  return {
    roundRestSec: opt(get(o, 'roundRestSec'), (x) => num(x, `${p}.roundRestSec`, 0, REST, true)),
    transitionSec: opt(get(o, 'transitionSec'), (x) => num(x, `${p}.transitionSec`, 0, REST, true)),
  };
}

function routine(v: unknown, p: string): Routine {
  const o = obj(v, p);
  return {
    id: id(get(o, 'id'), `${p}.id`),
    name: str(get(o, 'name'), `${p}.name`, 60, 1),
    blocks: uniqueNested(arr(get(o, 'blocks'), `${p}.blocks`, LIMITS.blocks, (b, q): PlannedBlock => {
      const bo = obj(b, q);
      return {
        id: id(get(bo, 'id'), `${q}.id`),
        items: arr(get(bo, 'items'), `${q}.items`, LIMITS.items, planned),
        ...blockRest(bo, q),
      };
    })),
    archived: opt(get(o, 'archived'), (x) => bool(x, `${p}.archived`)) || undefined,
  };
}

function loggedSet(v: unknown, p: string): LoggedSet {
  const o = obj(v, p);
  return {
    id: id(get(o, 'id'), `${p}.id`),
    type: oneOf(get(o, 'type'), SET_TYPES, `${p}.type`),
    weight: num(get(o, 'weight'), `${p}.weight`, 0, KG),
    reps: num(get(o, 'reps'), `${p}.reps`, 0, 1000, true),
    durationSec: opt(get(o, 'durationSec'), (x) => num(x, `${p}.durationSec`, 0, 86_400, true)),
    rir: opt(get(o, 'rir'), (x) => num(x, `${p}.rir`, 0, 10, true)),
    done: bool(get(o, 'done'), `${p}.done`),
  };
}

/**
 * Block and set ids are keys on screen, so they must be unique within a workout or routine. Repeats (from a
 * hand-edited file) get fresh ids rather than failing, which would leave stored data unreadable.
 */
function uniqueNested<B extends { id: string; items: unknown[] }>(blocks: B[]): B[] {
  const blockIds = new Set<string>();
  const setIds = new Set<string>();
  for (const b of blocks) {
    if (blockIds.has(b.id)) b.id = uid();
    blockIds.add(b.id);
    for (const s of b.items.flatMap((it) => (it as { sets?: { id: string }[] }).sets ?? [])) {
      if (setIds.has(s.id)) s.id = uid();
      setIds.add(s.id);
    }
  }
  return blocks;
}

function session(v: unknown, p: string): Session {
  const o = obj(v, p);
  const ms = Date.parse(str(get(o, 'startedAt'), `${p}.startedAt`, 40, 1));
  if (!Number.isFinite(ms) || ms < Date.UTC(1900, 0, 1) || ms > Date.UTC(9999, 0, 1)) fail(`${p}.startedAt`, 'expected a date and time');
  return {
    id: id(get(o, 'id'), `${p}.id`),
    name: str(get(o, 'name'), `${p}.name`, 60, 1),
    // Workouts are ordered by comparing this text, so every date is stored the same way.
    startedAt: new Date(ms).toISOString(),
    durationMin: num(get(o, 'durationMin'), `${p}.durationMin`, 0, 24 * 60, true),
    gymId: id(get(o, 'gymId'), `${p}.gymId`),
    routineId: opt(get(o, 'routineId'), (x) => id(x, `${p}.routineId`)),
    notes: opt(get(o, 'notes'), (x) => str(x, `${p}.notes`, 5000)),
    blocks: uniqueNested(arr(get(o, 'blocks'), `${p}.blocks`, LIMITS.blocks, (b, q): SessionBlock => {
      const bo = obj(b, q);
      return {
        id: id(get(bo, 'id'), `${q}.id`),
        items: arr(get(bo, 'items'), `${q}.items`, LIMITS.items, (it, r): SessionExercise => {
          const io = obj(it, r);
          return {
            exerciseId: id(get(io, 'exerciseId'), `${r}.exerciseId`),
            sets: arr(get(io, 'sets'), `${r}.sets`, LIMITS.sets, loggedSet),
            plan: opt(get(io, 'plan'), (x) => planned(x, `${r}.plan`)),
          };
        }),
        ...blockRest(bo, q),
      };
    })),
  };
}

/** Newest first, for lists of workouts (startedAt is always ISO text, see session). */
export const newestFirst = (a: { startedAt: string }, b: { startedAt: string }) =>
  a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0;

function bodyEntry(v: unknown, p: string): BodyEntry {
  const o = obj(v, p);
  const date = str(get(o, 'date'), `${p}.date`, 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) fail(`${p}.date`, 'expected YYYY-MM-DD');
  const cm = (k: string) => opt(get(o, k), (x) => num(x, `${p}.${k}`, 1, 300));
  return {
    date,
    weight: opt(get(o, 'weight'), (x) => num(x, `${p}.weight`, 20, 400)),
    waist: cm('waist'), chest: cm('chest'), arm: cm('arm'), thigh: cm('thigh'),
  };
}

function settings(v: unknown, p: string): Settings {
  const o = obj(v, p);
  return {
    defaultGymId: id(get(o, 'defaultGymId'), `${p}.defaultGymId`),
    defaultRestSec: num(get(o, 'defaultRestSec'), `${p}.defaultRestSec`, 0, REST, true),
    sound: opt(get(o, 'sound'), (x) => bool(x, `${p}.sound`)) ?? true,
    soundVolume: opt(get(o, 'soundVolume'), (x) => num(x, `${p}.soundVolume`, 0.1, 1)) ?? 0.8,
    pauseMusic: opt(get(o, 'pauseMusic'), (x) => bool(x, `${p}.pauseMusic`)) ?? true,
    vibrate: opt(get(o, 'vibrate'), (x) => bool(x, `${p}.vibrate`)) ?? true,
    detectGym: opt(get(o, 'detectGym'), (x) => bool(x, `${p}.detectGym`)) ?? true,
    keepScreenOn: opt(get(o, 'keepScreenOn'), (x) => bool(x, `${p}.keepScreenOn`)) ?? false,
  };
}

/** Drop `undefined` optional fields so the stored data matches what the app writes itself. */
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

function readJson(text: string): { o: Obj; version: number } {
  if (text.length > MAX_IMPORT_BYTES) throw new ImportError('The file is larger than 20 MB.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError('The file is not valid JSON.');
  }
  const o = obj(raw, 'file');
  const version = num(get(o, 'version') ?? 1, 'version', 1, 1_000_000, true);
  if (version > SNAPSHOT_VERSION) throw new ImportError('This file comes from a newer version of Kratos. Update the app and try again.');
  return { o, version };
}

/**
 * Bring older data up to date. Before version 3 every routine exercise stored "+2.5 kg" as the default; machines
 * and cables now default to their own step at each gym (increment 0), so that default is cleared for them.
 */
function migrate(d: Sections, version: number) {
  if (version >= 3) return;
  const stack = new Set(d.exercises.filter((e) => isGymSpecificEquipment(e.equipment)).map((e) => e.id));
  for (const it of d.routines.flatMap((r) => r.blocks.flatMap((b) => b.items))) {
    if (stack.has(it.exerciseId) && it.progression.kind !== 'none' && it.progression.increment === 2.5) it.progression.increment = 0;
  }
}

type Sections = Omit<ExportFile, 'kratos' | 'version'>;

/** Parse every data section; missing ones become empty lists. */
function sections(o: Obj): Sections {
  return {
    gyms: arr(get(o, 'gyms') ?? [], 'gyms', LIMITS.gyms, gym),
    exercises: arr(get(o, 'exercises') ?? [], 'exercises', LIMITS.exercises, exercise),
    setups: arr(get(o, 'setups') ?? [], 'setups', LIMITS.setups, setup),
    routines: arr(get(o, 'routines') ?? [], 'routines', LIMITS.routines, routine),
    sessions: arr(get(o, 'sessions') ?? [], 'sessions', LIMITS.sessions, session),
    body: arr(get(o, 'body') ?? [], 'body', LIMITS.body, bodyEntry),
  };
}

/** Ids must be unique and every reference must resolve within the same file. Sorts lists. */
function checkRefs(d: Sections, extraGymRef?: string) {
  const unique = (ids: string[], path: string) => {
    const seen = new Set<string>();
    for (const x of ids) {
      if (seen.has(x)) fail(path, `duplicate id "${x}"`);
      seen.add(x);
    }
    return seen;
  };
  const gymIds = unique(d.gyms.map((g) => g.id), 'gyms');
  const exIds = unique(d.exercises.map((e) => e.id), 'exercises');
  unique(d.routines.map((r) => r.id), 'routines');
  unique(d.sessions.map((s) => s.id), 'sessions');
  unique(d.body.map((b) => b.date), 'body');
  const needGym = (x: string, path: string) => gymIds.has(x) || fail(path, `unknown gym "${x}"`);
  const needEx = (x: string, path: string) => exIds.has(x) || fail(path, `unknown exercise "${x}"`);

  if (extraGymRef !== undefined) needGym(extraGymRef, 'settings.defaultGymId');
  d.setups.forEach((s, i) => { needGym(s.gymId, `setups[${i}].gymId`); needEx(s.exerciseId, `setups[${i}].exerciseId`); });
  d.routines.forEach((r, i) => r.blocks.forEach((b, j) => b.items.forEach((it, k) =>
    needEx(it.exerciseId, `routines[${i}].blocks[${j}].items[${k}].exerciseId`))));
  d.sessions.forEach((s, i) => {
    needGym(s.gymId, `sessions[${i}].gymId`);
    s.blocks.forEach((b, j) => b.items.forEach((it, k) => needEx(it.exerciseId, `sessions[${i}].blocks[${j}].items[${k}].exerciseId`)));
  });

  d.sessions.sort(newestFirst);
  d.body.sort((a, b) => a.date.localeCompare(b.date));
}

/** Parse and check a full backup (for restore, which replaces everything). Throws ImportError. */
export function parseBackup(text: string): Snapshot {
  const { o, version } = readJson(text);
  const d = sections(o);
  migrate(d, version);
  if (d.gyms.length === 0) throw new ImportError('gyms: the backup needs at least one gym');
  const st = settings(get(o, 'settings'), 'settings');
  checkRefs(d, st.defaultGymId);
  return clean({ version: SNAPSHOT_VERSION, ...d, settings: st });
}

/**
 * Parse and check a file to merge in: a partial export (a shared routine, some workouts, body entries) or a
 * full backup. Every section is optional; settings are ignored. Throws ImportError.
 */
export function parseExport(text: string): ExportFile {
  const { o, version } = readJson(text);
  const d = sections(o);
  migrate(d, version);
  checkRefs(d);
  if (!d.exercises.length && !d.routines.length && !d.sessions.length && !d.body.length) {
    throw new ImportError('The file has no routines, exercises, workouts or body entries to import.');
  }
  return clean({ kratos: 'export', version: SNAPSHOT_VERSION, ...d });
}

/** Check one workout against the current data, e.g. before saving a finished one. Throws ImportError. */
export function parseSession(raw: unknown, snap: Snapshot, path = 'workout'): Session {
  const s = session(raw, path);
  if (!snap.gyms.some((g) => g.id === s.gymId)) fail(`${path}.gymId`, 'unknown gym');
  for (const it of s.blocks.flatMap((b) => b.items)) {
    if (!snap.exercises.some((e) => e.id === it.exerciseId)) fail(path, `unknown exercise "${it.exerciseId}"`);
  }
  return clean(s);
}

/** Check a saved workout-in-progress against the current data. Returns null when there is none. */
export function parseDraft(raw: unknown, snap: Snapshot): Draft | null {
  if (raw === null || raw === undefined) return null;
  const o = obj(raw, 'draft');
  const s = parseSession(get(o, 'session'), snap, 'draft.session');
  const r = get(o, 'rest');
  const rest: RestTimer | null = r === null || r === undefined ? null : (() => {
    const ro = obj(r, 'draft.rest');
    return {
      endsAt: num(get(ro, 'endsAt'), 'draft.rest.endsAt', 0, 1e15),
      total: num(get(ro, 'total'), 'draft.rest.total', 0, REST * 2),
      label: str(get(ro, 'label'), 'draft.rest.label', 200),
    };
  })();
  return clean({ session: s, rest });
}
