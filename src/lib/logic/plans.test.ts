import { describe, expect, it } from 'vitest';
import { dayOf, groupByPlan, nextRoutine, planOf } from './plans';

const r = (id: string, name: string) => ({ id, name });

describe('planOf and dayOf', () => {
  it('split "Plan > Day" names', () => {
    expect(planOf('ULUL 2026 > Upper #1')).toBe('ULUL 2026');
    expect(dayOf('ULUL 2026 > Upper #1')).toBe('Upper #1');
    expect(dayOf('PPL > Push > Heavy')).toBe('Push > Heavy');
  });

  it('leave names without a plan whole', () => {
    expect(planOf('Mobility')).toBe('');
    expect(dayOf('Mobility')).toBe('Mobility');
    expect(planOf(' > Day')).toBe('');
    expect(dayOf('Plan > ')).toBe('Plan > ');
  });
});

describe('groupByPlan', () => {
  it('groups in saved order', () => {
    const groups = groupByPlan([r('1', 'A > 1'), r('2', 'Mobility'), r('3', 'B > 1'), r('4', 'A > 2'), r('5', 'Rehab')]);
    expect(groups.map((g) => [g.plan, g.routines.map((x) => x.id)])).toEqual([
      ['A', ['1', '4']], ['', ['2', '5']], ['B', ['3']],
    ]);
  });
});

describe('nextRoutine', () => {
  const active = [r('u1', 'ULUL > Upper #1'), r('l1', 'ULUL > Lower #1'), r('mob', 'Mobility'), r('u2', 'ULUL > Upper #2'), r('h1', 'Hang > Day')];

  it('takes the next day of the last plan, wrapping around', () => {
    expect(nextRoutine(active, ['u1'])?.id).toBe('l1');
    expect(nextRoutine(active, ['l1'])?.id).toBe('u2');
    expect(nextRoutine(active, ['u2'])?.id).toBe('u1');
    expect(nextRoutine(active, ['h1'])?.id).toBe('h1');
  });

  it('ignores routines without a plan, empty workouts and archived routines', () => {
    expect(nextRoutine(active, ['mob', undefined, 'gone', 'l1'])?.id).toBe('u2');
  });

  it('rotates through everything when no plan was followed', () => {
    expect(nextRoutine(active, ['mob'])?.id).toBe('u2');
    expect(nextRoutine(active, [])?.id).toBe('u1');
    expect(nextRoutine([], ['u1'])).toBeUndefined();
  });
});
