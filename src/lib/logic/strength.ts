import type { Exercise } from '../model';
import { bestE1rm, type HistoryEntry } from './training';

const DAY = 86_400_000;

export interface LiftTrend {
  exercise: Exercise;
  /** Best estimated 1RM of each workout in the window, oldest first. */
  points: { x: number; y: number }[];
  latest: number;
  /** Change since about four weeks before the latest workout (or the first in the window). */
  change: number;
}

/**
 * The lifts to follow on Progress: free-weight exercises measured in reps (not machines, which differ per gym, and
 * not bodyweight or timed ones, which have no 1RM to compare), trained at least `minSessions` times in the last
 * `weeks` weeks, most trained first and, among equals, heaviest first (so squats beat curls).
 */
export function mainLifts(
  index: Map<string, HistoryEntry[]>, exercises: Exercise[], now: number, { count = 4, weeks = 12, minSessions = 3 } = {},
): LiftTrend[] {
  const since = now - weeks * 7 * DAY;
  const trends: LiftTrend[] = [];
  for (const ex of exercises) {
    if (ex.gymSpecific || ex.equipment === 'bodyweight' || ex.measure === 'time') continue;
    const points = (index.get(ex.id) ?? [])
      .filter((h) => Date.parse(h.session.startedAt) >= since)
      .map((h) => ({ x: Date.parse(h.session.startedAt), y: bestE1rm(h.entry.sets) }))
      .filter((p) => p.y > 0)
      .sort((a, b) => a.x - b.x);
    if (points.length < minSessions) continue;
    const last = points[points.length - 1];
    const base = points.findLast((p) => p.x <= last.x - 28 * DAY) ?? points[0];
    trends.push({ exercise: ex, points, latest: last.y, change: last.y - base.y });
  }
  return trends.sort((a, b) => b.points.length - a.points.length || b.latest - a.latest).slice(0, count);
}
