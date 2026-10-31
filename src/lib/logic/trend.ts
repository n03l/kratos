const DAY = 86_400_000;

/** Share of the gap between a reading and the trend that one day closes (10 %, as in The Hacker's Diet). */
export const TREND_DAILY = 0.1;

/**
 * Smoothed trend of readings sorted by time: an exponential moving average that weighs each reading by the days
 * since the previous one, so a week without weighing moves the trend as much as seven daily readings would.
 * Readings on the same day (or out of order) count as one day apart.
 */
export function weightTrend(points: readonly { x: number; y: number }[], daily = TREND_DAILY): number[] {
  const out: number[] = [];
  let trend = NaN;
  let prev = NaN;
  for (const p of points) {
    if (out.length === 0) trend = p.y;
    else {
      const days = Math.max(1, (p.x - prev) / DAY);
      trend += (1 - (1 - daily) ** days) * (p.y - trend);
    }
    prev = p.x;
    out.push(trend);
  }
  return out;
}
