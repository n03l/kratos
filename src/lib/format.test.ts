import { describe, expect, it } from 'vitest';
import { parseSeconds, seconds, setText, setsSummary, timeLabel } from './format';

describe('timeLabel', () => {
  it('shows the local start time with minutes', () => {
    const d = new Date(2026, 9, 26, 7, 5);
    expect(timeLabel(d.toISOString())).toMatch(/7.05/);
  });
});

describe('seconds and parseSeconds', () => {
  it('formats and reads hold times', () => {
    expect(seconds(45)).toBe('45 s');
    expect(seconds(90)).toBe('1:30');
    expect(parseSeconds('90')).toBe(90);
    expect(parseSeconds('1:30')).toBe(90);
    expect(parseSeconds('1m30')).toBe(90);
    expect(parseSeconds(' 0:45 ')).toBe(45);
    expect(parseSeconds('1:75')).toBeNull();
    expect(parseSeconds('abc')).toBeNull();
    expect(parseSeconds('')).toBeNull();
  });
});

describe('setText', () => {
  const barbell = { equipment: 'barbell' };
  const bodyweight = { equipment: 'bodyweight' };
  const plank = { equipment: 'bodyweight', measure: 'time' as const };
  const hang = { equipment: 'other', measure: 'time' as const };

  it('shows weight as load, or as added weight for bodyweight exercises', () => {
    expect(setText({ weight: 80, reps: 8 }, barbell)).toBe('80 kg × 8');
    expect(setText({ weight: 0, reps: 12 }, bodyweight)).toBe('BW × 12');
    expect(setText({ weight: 10, reps: 6 }, bodyweight)).toBe('BW +10 kg × 6');
  });

  it('shows holds as time, with weight only when there is some', () => {
    expect(setText({ weight: 0, reps: 0, durationSec: 45 }, plank)).toBe('45 s');
    expect(setText({ weight: 5, reps: 0, durationSec: 90 }, plank)).toBe('BW +5 kg × 1:30');
    expect(setText({ weight: 38, reps: 0, durationSec: 7 }, hang)).toBe('+38 kg × 7 s');
  });
});

describe('setsSummary', () => {
  const bar = { equipment: 'barbell' };
  const set = (weight: number, reps: number, type = 'working', done = true) => ({ type, weight, reps, done });

  it('lists reps once when the weight stays the same, leaving out warmups and unlogged sets', () => {
    expect(setsSummary([set(60, 5, 'warmup'), set(112.5, 5), set(112.5, 5), set(112.5, 4), set(112.5, 5, 'working', false)], bar))
      .toBe('112.5 kg × 5, 5, 4');
  });

  it('lists each set when the weight changes', () => {
    expect(setsSummary([set(16, 11), set(12, 9, 'drop')], { equipment: 'dumbbell' })).toBe('16 kg × 11, 12 kg × 9');
  });

  it('handles bodyweight, timed and empty', () => {
    expect(setsSummary([set(0, 8), set(0, 7)], { equipment: 'bodyweight' })).toBe('BW × 8, 7');
    expect(setsSummary([{ ...set(0, 0), durationSec: 45 }, { ...set(0, 0), durationSec: 50 }], { equipment: 'bodyweight', measure: 'time' }))
      .toBe('45 s, 50 s');
    expect(setsSummary([set(20, 10, 'warmup')], bar)).toBe('');
  });
});
