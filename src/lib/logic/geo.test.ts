import { describe, expect, it } from 'vitest';
import type { Gym } from '../model';
import { distanceM, formatDistance, gymAt, parseCoords } from './geo';

const gym = (id: string, lat: number, lng: number, radiusM = 200): Gym =>
  ({ id, name: id, color: 'red', bar: 20, plates: [20], stackIncrement: 5, location: { lat, lng, radiusM } });

describe('distanceM', () => {
  it('measures great-circle distance', () => {
    expect(distanceM({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
    // One degree of latitude is about 111.2 km.
    expect(distanceM({ lat: 47, lng: 8 }, { lat: 48, lng: 8 })).toBeCloseTo(111_195, -2);
    // About 0.001 degrees of latitude is 111 m.
    expect(distanceM({ lat: 47.37, lng: 8.54 }, { lat: 47.371, lng: 8.54 })).toBeCloseTo(111, 0);
  });
});

describe('gymAt', () => {
  const a = gym('a', 47.37, 8.54);
  const b = gym('b', 47.3712, 8.54); // ~133 m north of a
  const far = gym('far', 46.2, 6.14);
  const noLoc: Gym = { ...gym('x', 0, 0), location: undefined };

  it('picks the nearest gym whose radius contains the position', () => {
    expect(gymAt([a, b, far, noLoc], { lat: 47.37, lng: 8.54, accuracy: 10 })?.gym.id).toBe('a');
    expect(gymAt([a, b], { lat: 47.3711, lng: 8.54, accuracy: 10 })?.gym.id).toBe('b');
  });

  it('returns null when nothing is within range', () => {
    expect(gymAt([a, far], { lat: 47.4, lng: 8.6, accuracy: 20 })).toBeNull();
    expect(gymAt([noLoc], { lat: 0, lng: 0, accuracy: 5 })).toBeNull();
  });

  it('allows for accuracy, but only up to a cap', () => {
    const at300m = { lat: 47.3727, lng: 8.54 }; // ~300 m north of a, outside its 200 m radius
    expect(gymAt([a], { ...at300m, accuracy: 10 })).toBeNull();
    expect(gymAt([a], { ...at300m, accuracy: 120 })?.gym.id).toBe('a');
    expect(gymAt([a], { lat: 47.4, lng: 8.54, accuracy: 5000 })).toBeNull();
  });
});

describe('parseCoords', () => {
  it('reads coordinates copied from map apps', () => {
    expect(parseCoords('47.3769, 8.5417')).toEqual({ lat: 47.3769, lng: 8.5417 });
    expect(parseCoords(' -33.8688 151.2093 ')).toEqual({ lat: -33.8688, lng: 151.2093 });
    expect(parseCoords('47.3769;8.5417')).toEqual({ lat: 47.3769, lng: 8.5417 });
  });
  it('rejects anything else', () => {
    expect(parseCoords('91, 8')).toBeNull();
    expect(parseCoords('47, 181')).toBeNull();
    expect(parseCoords('Zurich')).toBeNull();
    expect(parseCoords('47.1, 8.2, 3')).toBeNull();
  });
});

describe('formatDistance', () => {
  it('rounds metres and switches to km', () => {
    expect(formatDistance(123)).toBe('120 m');
    expect(formatDistance(1530)).toBe('1.5 km');
    expect(formatDistance(1000)).toBe('1 km');
  });
});
