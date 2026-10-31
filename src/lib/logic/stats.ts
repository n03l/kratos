import type { Session } from '../model';
import { volume } from './training';

export interface WorkoutStats {
  total: number;
  thisMonth: number;
  /** Weeks in a row (Monday to Sunday, local time) with at least one workout, up to this week or last week. */
  weekStreak: number;
  /** Weight × reps over every done working set. */
  liftedKg: number;
}

const DAY = 86_400_000;

/** Midnight on the Monday of the week holding `t`, local time. */
function weekStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** The Monday before `monday`; date arithmetic, so a daylight-saving change doesn't shift it. */
function previousWeek(monday: number): number {
  const d = new Date(monday);
  d.setDate(d.getDate() - 7);
  return d.getTime();
}

/** The tiles at the top of Progress. Workouts with an unreadable start time count only towards the total. */
export function workoutStats(sessions: Session[], now: number): WorkoutStats {
  const starts = sessions.map((s) => Date.parse(s.startedAt)).filter((t) => Number.isFinite(t) && t <= now + DAY);
  const today = new Date(now);
  const thisMonth = starts.filter((t) => {
    const d = new Date(t);
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
  }).length;

  const weeks = new Set(starts.map(weekStart));
  let week = weekStart(now);
  if (!weeks.has(week)) week = previousWeek(week);
  let weekStreak = 0;
  while (weeks.has(week)) {
    weekStreak++;
    week = previousWeek(week);
  }

  const liftedKg = sessions.reduce(
    (sum, s) => sum + s.blocks.reduce((b, block) => b + block.items.reduce((i, item) => i + volume(item.sets), 0), 0),
    0,
  );
  return { total: sessions.length, thisMonth, weekStreak, liftedKg };
}
