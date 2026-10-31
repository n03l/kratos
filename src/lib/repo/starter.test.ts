import { describe, expect, it } from 'vitest';
import { libraryExercises } from './starter';
import library from './library.json';

/** Words that keep their capital inside a name. */
const PROPER = new Set(['Romanian', 'Pallof', 'TRX', 'EZ-bar', 'V-crunch']);

describe('exercise library', () => {
  const list = libraryExercises();

  it('has unique ids and names', () => {
    expect(list).toHaveLength(53);
    expect(list.find((e) => e.id === 'nohang')?.measure).toBe('time');
    expect(new Set(list.map((e) => e.id)).size).toBe(list.length);
    expect(new Set(list.map((e) => e.name.toLowerCase())).size).toBe(list.length);
  });

  it('names follow "Movement (variant, variant)" in sentence case', () => {
    for (const { name } of list) {
      expect(name, name).toMatch(/^[A-Z][^()]*?( \([^()]+\))?$/);
      const words = name.replace(/[(),]/g, ' ').split(/\s+/).filter(Boolean).slice(1);
      for (const w of words) expect(PROPER.has(w) || w === w.toLowerCase(), `${name}: "${w}"`).toBe(true);
      // Equipment goes in the parentheses, never as a suffix of the movement ("Leg press machine").
      expect(name.split(' (')[0], name).not.toMatch(/ machine$/i);
    }
  });

  it('marks machines and cables as different at each gym, and maps every FitNotes name once', () => {
    for (const e of list) expect(e.gymSpecific).toBe(e.equipment === 'machine' || e.equipment === 'cable');
    const fitnotes = library.flatMap((e) => e.fitnotes);
    expect(new Set(fitnotes).size).toBe(fitnotes.length);
  });
});
