import type { Gym } from '../model';

const EARTH_M = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Fix {
  lat: number;
  lng: number;
  /** Reported accuracy radius in metres. */
  accuracy: number;
}

/** Position accuracy we give the benefit of the doubt for; worse fixes don't stretch the radius further. */
const MAX_SLACK_M = 150;

/**
 * The gym you are at: the nearest gym whose radius contains the fix, allowing for the fix's accuracy
 * (capped, so a city-wide guess can't match a gym). Null when no gym matches.
 */
export function gymAt(gyms: Gym[], fix: Fix): { gym: Gym; distance: number } | null {
  let best: { gym: Gym; distance: number } | null = null;
  const slack = Math.min(Math.max(0, fix.accuracy), MAX_SLACK_M);
  for (const gym of gyms) {
    if (!gym.location) continue;
    const distance = distanceM(fix, gym.location);
    if (distance - slack > gym.location.radiusM) continue;
    if (!best || distance < best.distance) best = { gym, distance };
  }
  return best;
}

/** Parse "47.3769, 8.5417" (as copied from a map app) into coordinates, or null. */
export function parseCoords(text: string): { lat: number; lng: number } | null {
  const m = text.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return null;
  return { lat, lng };
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace(/\.0$/, '')} km`;
}
