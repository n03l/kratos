// Domain model. Weights are stored in kilograms.

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'other';

export const MUSCLES = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'quads', 'hamstrings', 'glutes', 'calves', 'core',
] as const;
export type Muscle = (typeof MUSCLES)[number];

/**
 * Gym tags, in fixed order. Red, blue and green are competition plate colours; violet replaces yellow
 * (reserved for records) and white (reads as grey in charts). Validated as a categorical palette on --iron-1.
 */
export const GYM_COLORS = ['red', 'blue', 'green', 'violet'] as const;
export type GymColor = (typeof GYM_COLORS)[number];

export interface Gym {
  id: string;
  name: string;
  color: GymColor;
  /** Bar weight in kg for barbell lifts. */
  bar: number;
  /** Plate sizes available, in kg (one of each size assumed to be plentiful). */
  plates: number[];
  /** Smallest weight jump for machines and cable stacks. */
  stackIncrement: number;
  /** Where the gym is, for picking it automatically when a workout starts. */
  location?: GymLocation;
}

export interface GymLocation {
  lat: number;
  lng: number;
  /** Detect the gym when within this many metres. */
  radiusM: number;
}

export interface Exercise {
  id: string;
  name: string;
  muscles: Muscle[];
  equipment: Equipment;
  /** Machines and cables differ between gyms, so their history and records are kept per gym. */
  gymSpecific: boolean;
  notes?: string;
  /** Default rest after a set of this exercise; falls back to the app default. */
  restSec?: number;
  /** Archived, or deleted but kept because workouts in history use it. Hidden from lists and pickers. */
  archived?: boolean;
  /** How a set is measured: reps (default) or time held. */
  measure?: 'reps' | 'time';
}

export const isTimed = (e: Pick<Exercise, 'measure'> | undefined) => e?.measure === 'time';

/** Per-gym setup for an exercise: seat position, pin, which machine, etc. */
export interface GymSetup {
  gymId: string;
  exerciseId: string;
  note: string;
  /** Smallest weight jump on this machine or cable; falls back to the gym's `stackIncrement`. */
  increment?: number;
}

export interface StraightScheme {
  kind: 'straight';
  sets: number;
  repsMin: number;
  repsMax: number;
  rir: number;
  /** Drop sets after the last working set (none when missing or 0). */
  drops?: number;
  /** How much lighter each drop is, in percent (default DEFAULT_DROP_PCT). */
  dropPct?: number;
  /** Rest before each drop; 0 or missing means straight on, with no timer. */
  dropRestSec?: number;
}

export const DEFAULT_DROP_PCT = 20;

/** Timed sets (plank, wall sit, hangs): a hold time range in seconds instead of reps. */
export interface TimedScheme {
  kind: 'timed';
  sets: number;
  secMin: number;
  secMax: number;
}

export type SetScheme = StraightScheme | TimedScheme;

/** `increment` 0 means the equipment's own step at the gym (see `incrementFor`). */
export type Progression =
  | { kind: 'double'; increment: number }
  | { kind: 'linear'; increment: number }
  | { kind: 'none' };

export interface PlannedExercise {
  exerciseId: string;
  warmup: 'auto' | 'none';
  scheme: SetScheme;
  restSec: number;
  progression: Progression;
}

/** A block with more than one item is a superset: items are done back to back, rest after the round. */
export interface PlannedBlock {
  id: string;
  items: PlannedExercise[];
  /** Supersets only: rest after a full round, and an optional short rest between its exercises. */
  roundRestSec?: number;
  transitionSec?: number;
}

export interface Routine {
  id: string;
  name: string;
  blocks: PlannedBlock[];
  /** Hidden from Today and the routine list; its workouts stay in history. */
  archived?: boolean;
}

/**
 * `myo` (activation) and `mini` sets come from the myo-reps feature, which was removed in snapshot 6. They stay so
 * workouts logged with it load and show as they were; nothing creates them any more.
 */
export type SetType = 'warmup' | 'working' | 'myo' | 'mini' | 'drop';

/**
 * One set. `weight` is the load in kg; for bodyweight exercises it is the weight added to the body (0 = bodyweight
 * only). Timed exercises record `durationSec` and leave `reps` at 0.
 */
export interface LoggedSet {
  id: string;
  type: SetType;
  weight: number;
  reps: number;
  durationSec?: number;
  rir?: number;
  done: boolean;
}

export interface SessionExercise {
  exerciseId: string;
  sets: LoggedSet[];
  /** Targets for this workout: copied from the routine, or a default plan for exercises added on the fly. */
  plan?: PlannedExercise;
}

export interface SessionBlock {
  id: string;
  items: SessionExercise[];
  roundRestSec?: number;
  transitionSec?: number;
}

export interface Session {
  id: string;
  name: string;
  /** ISO timestamp of the start. */
  startedAt: string;
  durationMin: number;
  gymId: string;
  routineId?: string;
  blocks: SessionBlock[];
  notes?: string;
}

export interface BodyEntry {
  date: string; // YYYY-MM-DD
  weight?: number;
  waist?: number;
  chest?: number;
  arm?: number;
  thigh?: number;
}

/**
 * 2: routines can be archived. 3: setups can set the machine's weight step. 4: beep volume, pause music.
 * 5: straight sets can plan drop sets. 6: myo-reps removed; planned myo-reps load as straight sets.
 */
export const SNAPSHOT_VERSION = 6;

/** A file to merge into existing data: a shared routine, some workouts, or a whole backup. */
export interface ExportFile {
  kratos: 'export';
  version: number;
  gyms: Gym[];
  exercises: Exercise[];
  setups: GymSetup[];
  routines: Routine[];
  sessions: Session[];
  body: BodyEntry[];
}

export interface Snapshot {
  version: number;
  gyms: Gym[];
  exercises: Exercise[];
  setups: GymSetup[];
  routines: Routine[];
  sessions: Session[];
  body: BodyEntry[];
  settings: Settings;
}

export interface Settings {
  defaultGymId: string;
  defaultRestSec: number;
  /** Beeps for the last seconds of a rest and when it ends. */
  sound: boolean;
  /** Beep loudness, 0.1 to 1. */
  soundVolume: number;
  /** Play the final countdown as a short clip so Android pauses other audio (music apps) while it plays. */
  pauseMusic: boolean;
  vibrate: boolean;
  /** Check location when a workout starts and switch to the gym you're at. */
  detectGym: boolean;
  /** Stop the screen from dimming or locking while the app is open. */
  keepScreenOn: boolean;
}

export interface RestTimer {
  endsAt: number;
  total: number;
  label: string;
}

/** The workout in progress, saved separately so it survives closing the app mid-session. */
export interface Draft {
  session: Session;
  rest: RestTimer | null;
}

export const isGymSpecificEquipment = (e: Equipment) => e === 'machine' || e === 'cable';
