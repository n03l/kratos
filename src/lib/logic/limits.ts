// Values typed into forms, kept within what the data check (repo/validate.ts) accepts. Saved data outside those
// limits would be refused the next time the app starts.

/** A number in [min, max]: out of range is clamped, empty or not a number gives `fallback`. */
export function clampNumber(value: number, min: number, max: number, fallback: number, integer = false): number {
  if (!Number.isFinite(value)) return fallback;
  const v = integer ? Math.round(value) : value;
  return Math.min(max, Math.max(min, v));
}

/** Trimmed, single-spaced and at most `max` characters; `fallback` when nothing is left. */
export function cleanText(text: string, max: number, fallback: string): string {
  const t = text.trim().replace(/\s+/g, ' ').slice(0, max).trim();
  return t || fallback;
}
