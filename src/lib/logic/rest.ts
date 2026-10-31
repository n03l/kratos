import type { LoggedSet, Session, SessionExercise } from '../model';

export interface RestDecision {
  sec: number;
  label: string;
}

export interface RestContext {
  name: (exerciseId: string) => string;
  /** The exercise's own default rest, if it has one. */
  exerciseRest: (exerciseId: string) => number | undefined;
  defaultRest: number;
}

/** Rest after a normal set of this exercise: workout override, then exercise default, then app default. */
export function itemRest(item: SessionExercise, ctx: RestContext): number {
  return item.plan?.restSec ?? ctx.exerciseRest(item.exerciseId) ?? ctx.defaultRest;
}

/**
 * Which rest to start after logging `set`, or null for none.
 * - Warmups: a short rest, at most 60 s.
 * - Drop sets: none before a drop (or the planned drop rest), the normal rest after the last one.
 * - Supersets: the optional between-exercises rest until the last exercise, then the round rest.
 */
export function restAfter(
  session: Session, blockIndex: number, itemIndex: number, set: LoggedSet, ctx: RestContext,
): RestDecision | null {
  const block = session.blocks[blockIndex];
  const item = block?.items[itemIndex];
  if (!item) return null;
  const name = ctx.name(item.exerciseId);
  const own = itemRest(item, ctx);

  if (set.type === 'warmup') return { sec: Math.min(60, own), label: `Warmup, ${name}` };

  const scheme = item.plan?.scheme;

  // Drop sets follow straight on, or after their own short rest.
  const following = item.sets[item.sets.indexOf(set) + 1];
  if (following?.type === 'drop' && !following.done) {
    const sec = scheme?.kind === 'straight' ? (scheme.dropRestSec ?? 0) : 0;
    return sec > 0 ? { sec, label: `Drop set, ${name}` } : null;
  }

  if (block.items.length > 1) {
    if (itemIndex < block.items.length - 1) {
      const t = block.transitionSec ?? 0;
      return t > 0 ? { sec: t, label: `Next: ${ctx.name(block.items[itemIndex + 1].exerciseId)}` } : null;
    }
    const round = block.roundRestSec ?? Math.max(...block.items.map((i) => itemRest(i, ctx)));
    return { sec: round, label: 'Superset round done' };
  }

  return { sec: own, label: name };
}

export interface NextSet {
  blockIndex: number;
  itemIndex: number;
  set: LoggedSet;
}

/**
 * The set to do next: the first block with something left, scanning from `fromBlock` (where the last set was
 * logged) and wrapping, so skipped exercises come up last. In a superset, the exercise with the fewest logged
 * sets goes first (earlier on a tie), which takes the exercises in turn, except that a drop set follows its set at
 * once. Within an exercise, sets after the last logged one come first, so skipped warmups don't come back after
 * the working sets have started.
 */
export function upNext(session: Session, fromBlock = 0): NextSet | null {
  const n = session.blocks.length;
  const start = Number.isInteger(fromBlock) && fromBlock > 0 ? fromBlock % n : 0;
  for (let k = 0; k < n; k++) {
    const blockIndex = (start + k) % n;
    let best: NextSet | null = null;
    let fewest = Infinity;
    const items = session.blocks[blockIndex].items;
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const sets = items[itemIndex].sets;
      const last = sets.findLastIndex((x) => x.done);
      // A drop set comes straight after the set it drops from, even in a superset.
      if (last >= 0 && sets[last + 1]?.type === 'drop' && !sets[last + 1].done) {
        return { blockIndex, itemIndex, set: sets[last + 1] };
      }
      const set = sets.find((x, i) => !x.done && i > last) ?? sets.find((x) => !x.done);
      const logged = sets.filter((x) => x.done && x.type !== 'warmup').length;
      if (set && logged < fewest) {
        best = { blockIndex, itemIndex, set };
        fewest = logged;
      }
    }
    if (best) return best;
  }
  return null;
}

export interface Cue {
  /** When to play, in ms before the end of the rest. */
  beforeEndMs: number;
  kind: 'ten' | 'tick' | 'end';
}

/** Countdown cues: 10 s left (rests of 20 s or more), each of the last 3 seconds, and the end. */
export function restCues(totalSec: number): Cue[] {
  const cues: Cue[] = [];
  if (totalSec >= 20) cues.push({ beforeEndMs: 10_000, kind: 'ten' });
  for (const s of [3, 2, 1]) if (s < totalSec) cues.push({ beforeEndMs: s * 1000, kind: 'tick' });
  cues.push({ beforeEndMs: 0, kind: 'end' });
  return cues;
}

export function formatRest(sec: number): string {
  if (sec <= 0) return 'Off';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}:${String(s).padStart(2, '0')}` : `${s} s`;
}
