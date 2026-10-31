// Plans are read from routine names: "ULUL 2026 > Upper #1" is the day "Upper #1" of the plan "ULUL 2026" (the
// FitNotes import names routines this way). A routine without " > " belongs to no plan.

const SEP = ' > ';

export function planOf(name: string): string {
  const i = name.indexOf(SEP);
  return i > 0 ? name.slice(0, i).trim() : '';
}

/** The routine's name within its plan ("Upper #1"), or the whole name without a plan. */
export function dayOf(name: string): string {
  const plan = planOf(name);
  return plan ? name.slice(name.indexOf(SEP) + SEP.length).trim() || name : name;
}

export interface PlanGroup<T> {
  /** '' for routines without a plan. */
  plan: string;
  routines: T[];
}

/** Routines grouped by plan, in saved order: groups appear where their first routine is. */
export function groupByPlan<T extends { name: string }>(routines: T[]): PlanGroup<T>[] {
  const groups: PlanGroup<T>[] = [];
  for (const r of routines) {
    const plan = planOf(r.name);
    const g = groups.find((x) => x.plan === plan);
    if (g) g.routines.push(r);
    else groups.push({ plan, routines: [r] });
  }
  return groups;
}

/**
 * The routine to suggest next: the one after the latest workout's routine, within its plan. Workouts from
 * routines outside any plan (mobility, rehab) don't move the rotation; without a plan to follow, it rotates
 * through every active routine. `recent` lists the routine ids of past workouts, newest first.
 */
export function nextRoutine<T extends { id: string; name: string }>(
  active: T[], recent: Iterable<string | undefined>,
): T | undefined {
  if (!active.length) return undefined;
  let fallback: T | undefined;
  for (const id of recent) {
    const r = id === undefined ? undefined : active.find((x) => x.id === id);
    if (!r) continue;
    fallback ??= r;
    const plan = planOf(r.name);
    if (!plan) continue;
    const days = active.filter((x) => planOf(x.name) === plan);
    return days[(days.indexOf(r) + 1) % days.length];
  }
  if (fallback) return active[(active.indexOf(fallback) + 1) % active.length];
  return active[0];
}
