import { SNAPSHOT_VERSION } from '../model';
import type {
  BodyEntry, Exercise, Gym, GymSetup, LoggedSet, PlannedExercise, Routine, Session, SessionBlock, Snapshot,
} from '../model';
import { incrementFor, roundTo } from '../logic/training';
import { newestFirst } from './validate';

// Sample data for trying the app (More > Load sample data). Synthetic only.

const gyms: Gym[] = [
  // Locations are synthetic points a few km apart, not real places.
  { id: 'iron', name: 'Iron District', color: 'red', bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25], stackIncrement: 5, location: { lat: 45.0, lng: 7.0, radiusM: 200 } },
  { id: 'garage', name: 'Home garage', color: 'blue', bar: 20, plates: [20, 10, 5, 2.5], stackIncrement: 2.5, location: { lat: 45.02, lng: 7.03, radiusM: 100 } },
  { id: 'office', name: 'Office gym', color: 'green', bar: 15, plates: [20, 10, 5, 2.5], stackIncrement: 7 },
];

const ex = (
  id: string, name: string, equipment: Exercise['equipment'], muscles: Exercise['muscles'], notes?: string,
): Exercise => ({ id, name, equipment, muscles, gymSpecific: equipment === 'machine' || equipment === 'cable', notes });

const exercises: Exercise[] = [
  ex('squat', 'Squat (barbell)', 'barbell', ['quads', 'glutes'], 'High bar, belt from 85% on.'),
  ex('bench', 'Bench press (barbell)', 'barbell', ['chest', 'triceps']),
  ex('dead', 'Deadlift (conventional)', 'barbell', ['hamstrings', 'glutes', 'back']),
  ex('ohp', 'Overhead press (barbell)', 'barbell', ['shoulders', 'triceps']),
  ex('row', 'Row (barbell)', 'barbell', ['back', 'biceps']),
  ex('rdl', 'Deadlift (Romanian)', 'barbell', ['hamstrings', 'glutes']),
  ex('pullup', 'Pull-up', 'bodyweight', ['back', 'biceps']),
  { ...ex('plank', 'Plank', 'bodyweight', ['core']), measure: 'time' },
  ex('dip', 'Dip (bodyweight)', 'bodyweight', ['chest', 'triceps']),
  ex('incdb', 'Bench press (dumbbell, incline)', 'dumbbell', ['chest', 'shoulders']),
  ex('lateral', 'Lateral raise (dumbbell)', 'dumbbell', ['shoulders']),
  ex('curl', 'Curl (dumbbell)', 'dumbbell', ['biceps']),
  ex('legpress', 'Leg press', 'machine', ['quads', 'glutes']),
  ex('legcurl', 'Leg curl (seated)', 'machine', ['hamstrings']),
  ex('calf', 'Calf raise (standing machine)', 'machine', ['calves']),
  { ...ex('pulldown', 'Lat pulldown', 'cable', ['back', 'biceps']), restSec: 90 },
  ex('pushdown', 'Pushdown (rope)', 'cable', ['triceps']),
  ex('fly', 'Fly (cable)', 'cable', ['chest']),
];

const setups: GymSetup[] = [
  { gymId: 'iron', exerciseId: 'legpress', note: 'Hammer Strength plate-loaded. Seat 4, feet high.', increment: 10 },
  { gymId: 'garage', exerciseId: 'legpress', note: 'Vertical sled, back pad at 3rd hole.' },
  { gymId: 'iron', exerciseId: 'legcurl', note: 'Technogym. Back 5, shin pad 2.' },
  { gymId: 'iron', exerciseId: 'pulldown', note: 'Wide bar, thigh pad 3.', increment: 2.5 },
  { gymId: 'office', exerciseId: 'pulldown', note: 'Only a V-handle, use neutral grip.' },
  { gymId: 'iron', exerciseId: 'calf', note: 'Shoulder pads at 6.' },
];

const straight = (sets: number, repsMin: number, repsMax: number, rir = 2) =>
  ({ kind: 'straight', sets, repsMin, repsMax, rir }) as const;

const p = (
  exerciseId: string, scheme: PlannedExercise['scheme'], restSec: number,
  increment = 2.5, warmup: PlannedExercise['warmup'] = 'none',
): PlannedExercise => ({ exerciseId, scheme, restSec, warmup, progression: { kind: 'double', increment } });

const routines: Routine[] = [
  {
    id: 'lowerA', name: '3-day split > Lower A',
    blocks: [
      { id: 'la1', items: [{ ...p('squat', straight(3, 5, 7), 180, 2.5, 'auto'), progression: { kind: 'linear', increment: 2.5 } }] },
      { id: 'la2', items: [p('rdl', straight(3, 8, 10), 150, 5, 'auto')] },
      { id: 'la3', items: [p('legpress', straight(3, 10, 15), 120, 0)] },
      { id: 'la4', roundRestSec: 90, items: [p('legcurl', straight(3, 10, 12), 60, 0), p('calf', straight(3, 10, 15), 60, 0)] },
    ],
  },
  {
    id: 'upperA', name: '3-day split > Upper A',
    blocks: [
      { id: 'ua1', items: [p('bench', straight(3, 6, 8), 180, 2.5, 'auto')] },
      { id: 'ua2', roundRestSec: 120, transitionSec: 30, items: [p('row', straight(3, 8, 10), 90), p('incdb', straight(3, 8, 12), 90, 2)] },
      { id: 'ua3', items: [p('pulldown', straight(3, 10, 12), 90, 0)] },
      { id: 'ua4', items: [p('lateral', { ...straight(3, 12, 15, 1), drops: 1, dropPct: 30 }, 60, 1), p('pushdown', straight(2, 10, 15), 60, 0)] },
    ],
  },
  {
    id: 'pull', name: '3-day split > Pull + arms',
    blocks: [
      { id: 'pa1', items: [p('dead', straight(2, 3, 5, 3), 240, 5, 'auto')] },
      { id: 'pa2', items: [p('pullup', straight(3, 6, 10), 120, 2.5)] },
      { id: 'pa3', items: [p('curl', { ...straight(3, 10, 12), drops: 2, dropPct: 20 }, 60, 2), p('pushdown', straight(3, 10, 15), 60, 0)] },
      { id: 'pa4', items: [p('plank', { kind: 'timed', sets: 3, secMin: 30, secMax: 60 }, 60, 2.5)] },
    ],
  },
];

/** Deterministic pseudo-random numbers so screenshots are stable. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

// Starting working weights; machines differ per gym, which is the point of gym-specific history.
const base: Record<string, number | Record<string, number>> = {
  squat: 100, bench: 77.5, dead: 140, ohp: 50, row: 70, rdl: 90, pullup: 0, plank: 0, dip: 10, incdb: 26,
  lateral: 10, curl: 14, calf: { iron: 80, garage: 60, office: 63 },
  legpress: { iron: 180, garage: 120, office: 140 },
  legcurl: { iron: 45, garage: 40, office: 42 },
  pulldown: { iron: 65, garage: 55, office: 56 },
  pushdown: { iron: 30, garage: 25, office: 28 },
  fly: { iron: 15, garage: 12.5, office: 14 },
};

function buildSessions(now: Date): Session[] {
  const rand = rng(7);
  const sessions: Session[] = [];
  const order = ['lowerA', 'upperA', 'pull'];
  const gymPlan = ['iron', 'iron', 'garage', 'iron', 'office'];
  let id = 0;
  const weeks = 12;
  for (let w = weeks; w >= 1; w--) {
    for (let d = 0; d < 3; d++) {
      const day = new Date(now);
      day.setDate(now.getDate() - w * 7 + d * 2 + 1);
      day.setHours(7 + Math.floor(rand() * 11), Math.floor(rand() * 4) * 15, 0, 0);
      if (day >= now) continue;
      const routine = routines.find((r) => r.id === order[d])!;
      const gymId = gymPlan[(weeks - w + d) % gymPlan.length];
      const gym = gyms.find((g) => g.id === gymId)!;
      const progress = (weeks - w) / weeks;
      const blocks: SessionBlock[] = routine.blocks.map((b) => ({
        id: `${b.id}-${id}`,
        items: b.items.map((it) => {
          const b0 = base[it.exerciseId];
          const start = typeof b0 === 'number' ? b0 : b0[gymId];
          const setup = setups.find((s) => s.gymId === gymId && s.exerciseId === it.exerciseId);
          const step = incrementFor(exercises.find((e) => e.id === it.exerciseId)!, gym, setup);
          const top = roundTo(start * (1 + progress * 0.12), step);
          const sets: LoggedSet[] = [];
          let sid = 0;
          const mk = (type: LoggedSet['type'], weight: number, reps: number, rir?: number): LoggedSet =>
            ({ id: `${id}-${it.exerciseId}-${sid++}`, type, weight, reps, rir, done: true });
          if (it.warmup === 'auto') {
            for (const pct of [0.4, 0.6, 0.8]) sets.push(mk('warmup', roundTo(top * pct, step), pct < 0.7 ? 5 : 3));
          }
          if (it.scheme.kind === 'straight') {
            for (let i = 0; i < it.scheme.sets; i++) {
              const reps = it.scheme.repsMin + Math.floor(rand() * (it.scheme.repsMax - it.scheme.repsMin + 1)) - (i > 1 ? 1 : 0);
              sets.push(mk('working', top, Math.max(1, reps), it.scheme.rir));
            }
          } else {
            for (let i = 0; i < it.scheme.sets; i++) {
              const sec = it.scheme.secMin + 5 * Math.floor(rand() * ((it.scheme.secMax - it.scheme.secMin) / 5 + 1));
              sets.push({ ...mk('working', top, 0), durationSec: sec });
            }
          }
          return { exerciseId: it.exerciseId, sets };
        }),
      }));
      sessions.push({
        id: `s${id++}`, name: routine.name, startedAt: day.toISOString(),
        durationMin: 50 + Math.floor(rand() * 35), gymId, routineId: routine.id, blocks,
      });
    }
  }
  return sessions.sort(newestFirst);
}

function buildBody(now: Date): BodyEntry[] {
  const rand = rng(3);
  const out: BodyEntry[] = [];
  for (let i = 84; i >= 0; i -= 3) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const trend = 82.4 - (84 - i) * 0.018;
    out.push({
      date: d.toISOString().slice(0, 10),
      weight: Math.round((trend + (rand() - 0.5) * 0.9) * 10) / 10,
      ...(i % 21 === 0 ? { waist: Math.round((86 - (84 - i) * 0.02) * 10) / 10, arm: 38.5, chest: 104, thigh: 60 } : {}),
    });
  }
  return out;
}

export function seed(now = new Date()): Snapshot {
  return structuredClone({
    version: SNAPSHOT_VERSION,
    gyms, exercises, setups, routines,
    sessions: buildSessions(now),
    body: buildBody(now),
    settings: { defaultGymId: 'iron', defaultRestSec: 120, sound: true, soundVolume: 0.8, pauseMusic: true, vibrate: true, detectGym: true, keepScreenOn: false },
  });
}
