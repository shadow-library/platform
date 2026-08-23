import { describe, expect, it } from 'bun:test';

import { currentRuleset, planReturnerShieldGrant, type ReturnerCandidate, returnerFires, returnerShieldTarget, returnerThresholdFor } from '@modules/rules';

const ruleset = currentRuleset();

const candidate = (questId: string, preAbsenceStreakDays: number, createdOrder: number, shields = 0): ReturnerCandidate => ({
  questId,
  preAbsenceStreakDays,
  createdOrder,
  shields,
});

describe('returnerThresholdFor', () => {
  it('should fall back to the ruleset default', () => {
    expect(returnerThresholdFor(ruleset, null)).toBe(7);
  });

  it('should honour a configured threshold', () => {
    expect(returnerThresholdFor(ruleset, 21)).toBe(21);
  });
});

describe('returnerFires', () => {
  const cases: readonly [absent: number, threshold: number | null, fires: boolean][] = [
    [0, null, false],
    [6, null, false],
    [7, null, true],
    [30, null, true],
    [7, 14, false],
    [14, 14, true],
    [3, 3, true],
  ];

  for (const [daysSinceLastActivity, thresholdDays, fires] of cases) {
    it(`should ${fires ? 'fire' : 'stay dormant'} after ${daysSinceLastActivity} days against a threshold of ${thresholdDays ?? 'default'}`, () => {
      expect(returnerFires(ruleset, { daysSinceLastActivity, thresholdDays })).toBe(fires);
    });
  }
});

describe('returnerShieldTarget', () => {
  it('should aim at the longest pre-absence streak', () => {
    const target = returnerShieldTarget([candidate('a', 3, 1), candidate('b', 12, 2), candidate('c', 9, 3)]);
    expect(target?.questId).toBe('b');
  });

  it('should break a tie by the most recent creation', () => {
    const target = returnerShieldTarget([candidate('older', 12, 1), candidate('newer', 12, 5), candidate('newest-but-shorter', 11, 9)]);
    expect(target?.questId).toBe('newer');
  });

  it('should still target a quest whose pre-absence streak was zero', () => {
    expect(returnerShieldTarget([candidate('a', 0, 1)])?.questId).toBe('a');
  });

  it('should find no target among no candidates', () => {
    expect(returnerShieldTarget([])).toBeNull();
  });
});

describe('planReturnerShieldGrant', () => {
  it('should grant the shield straight to the target below the cap', () => {
    expect(planReturnerShieldGrant(ruleset, [candidate('a', 12, 1, 1)])).toEqual({ questId: 'a', shields: 1, placement: 'granted' });
  });

  it('should hold the grant pending when the target sits at the cap', () => {
    expect(planReturnerShieldGrant(ruleset, [candidate('a', 12, 1, 2)])).toEqual({ questId: 'a', shields: 1, placement: 'held_pending' });
  });

  it('should hold the grant pending rather than spilling onto a runner-up', () => {
    expect(planReturnerShieldGrant(ruleset, [candidate('a', 12, 1, 2), candidate('b', 4, 2, 0)]).questId).toBe('a');
  });

  it('should hold the grant targetless when no pre-absence quest exists', () => {
    expect(planReturnerShieldGrant(ruleset, [])).toEqual({ questId: null, shields: 1, placement: 'held_targetless' });
  });
});
