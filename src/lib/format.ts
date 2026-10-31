const DAY = 86_400_000;

// Building a date formatter is slow; long history lists format hundreds of dates.
let weekdayFormat: Intl.DateTimeFormat | undefined;
let shortDateFormat: Intl.DateTimeFormat | undefined;
let timeFormat: Intl.DateTimeFormat | undefined;

export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return (weekdayFormat ??= new Intl.DateTimeFormat(undefined, { weekday: 'long' })).format(d);
  return (shortDateFormat ??= new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })).format(d);
}

/** Local clock time in the user's format, e.g. "07:30" or "7:30 AM". */
export function timeLabel(iso: string): string {
  return (timeFormat ??= new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })).format(new Date(iso));
}

export function startOfDay(d: Date): number {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c.getTime();
}

/** Monday of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const c = new Date(startOfDay(d));
  c.setDate(c.getDate() - ((c.getDay() + 6) % 7));
  return c;
}

export function tonnes(kg: number): string {
  return kg >= 1000 ? `${(kg / 1000).toFixed(1)} t` : `${Math.round(kg)} kg`;
}

export function duration(min: number): string {
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}

export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Sort exercise names so "Curl (dumbbell)" comes before "Curl (dumbbell, incline)". */
export const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base', ignorePunctuation: true });

/** "Dumbbell, biceps": equipment and muscles, skipping what's missing. */
export const exerciseMeta = (e: { equipment: string; muscles: string[] }) => [e.equipment, ...e.muscles].join(', ');

/**
 * Logged sets in one line, warmups left out: "112.5 kg × 5, 5, 4" when the weight doesn't change, otherwise each
 * set ("16 kg × 11, 12 kg × 9"). Empty when nothing past warmups was logged.
 */
export function setsSummary(
  sets: { type: string; weight: number; reps: number; durationSec?: number; done: boolean }[],
  ex: { equipment: string; measure?: 'reps' | 'time' } | undefined,
): string {
  const done = sets.filter((s) => s.done && s.type !== 'warmup');
  if (!done.length) return '';
  const timed = ex?.measure === 'time';
  if (done.every((s) => s.weight === done[0].weight)) {
    const first = setText(done[0], ex);
    const amounts = done.map((s) => (timed ? seconds(s.durationSec ?? 0) : String(s.reps)));
    return `${first.slice(0, first.length - amounts[0].length)}${amounts.join(', ')}`;
  }
  return done.map((s) => setText(s, ex)).join(', ');
}

/** " + 2 drop sets" for straight sets that plan drops; empty otherwise. */
export function dropsText(s: { kind: string; drops?: number }): string {
  return s.kind === 'straight' && s.drops ? ` + ${s.drops} drop ${s.drops === 1 ? 'set' : 'sets'}` : '';
}

/** "1:30" for 90 s, "45 s" under a minute. */
export function seconds(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Parse "90", "1:30" or "1m30" into seconds; null if it isn't a time. */
export function parseSeconds(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,3})(?:\s*[:m]\s*(\d{1,2})\s*s?)?$/i);
  if (!m) return null;
  const sec = m[2] === undefined ? Number(m[1]) : Number(m[1]) * 60 + Number(m[2]);
  return m[2] !== undefined && Number(m[2]) >= 60 ? null : sec;
}

/**
 * One set for display: "80 kg × 8", "BW × 12", "BW +10 kg × 6", "45 s", "+5 kg × 45 s".
 * Bodyweight weights are added weight, so 0 means bodyweight only.
 */
export function setText(
  s: { weight: number; reps: number; durationSec?: number },
  ex: { equipment: string; measure?: 'reps' | 'time' } | undefined,
): string {
  const kg = (w: number) => `${Number.isInteger(w) ? w : w.toFixed(w * 4 === Math.round(w * 4) ? 2 : 1).replace(/0$/, '')} kg`;
  const timed = ex?.measure === 'time' || (s.reps === 0 && s.durationSec !== undefined);
  const bw = ex?.equipment === 'bodyweight';
  const amount = timed ? seconds(s.durationSec ?? 0) : String(s.reps);
  if (s.weight > 0) return `${bw ? 'BW +' : timed ? '+' : ''}${kg(s.weight)} × ${amount}`;
  if (timed) return amount;
  return `${bw ? 'BW' : kg(0)} × ${amount}`;
}
