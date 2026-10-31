import { describe, expect, it } from 'vitest';
import { clampNumber, cleanText } from './limits';

describe('clampNumber', () => {
  it('keeps values in range and rounds whole numbers', () => {
    expect(clampNumber(5, 1, 20, 3, true)).toBe(5);
    expect(clampNumber(0, 1, 20, 3, true)).toBe(1);
    expect(clampNumber(99, 1, 20, 3, true)).toBe(20);
    expect(clampNumber(2.6, 1, 20, 3, true)).toBe(3);
    expect(clampNumber(2.5, 0, 100, 20)).toBe(2.5);
  });

  it('falls back when the field is empty or not a number', () => {
    expect(clampNumber(NaN, 1, 20, 3, true)).toBe(3);
    expect(clampNumber(Infinity, 1, 20, 3, true)).toBe(3);
  });
});

describe('cleanText', () => {
  it('trims, collapses spaces and cuts to the limit', () => {
    expect(cleanText('  Upper   A  ', 60, 'Routine')).toBe('Upper A');
    expect(cleanText('x'.repeat(70), 60, 'Routine')).toHaveLength(60);
  });

  it('falls back when nothing is left', () => {
    expect(cleanText('   ', 60, 'Workout')).toBe('Workout');
  });
});
