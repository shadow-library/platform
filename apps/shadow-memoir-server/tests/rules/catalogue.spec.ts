import { describe, expect, it } from 'bun:test';

import {
  type AchievementId,
  ACHIEVEMENTS,
  currentRuleset,
  EMPTY_PROGRESS_COUNTERS,
  type ProgressCounters,
  recomputeAchievements,
  recomputeTitles,
  satisfiedAchievements,
  satisfiedTitles,
  type TitleId,
  TITLES,
  unlockedAchievements,
  unlockedTitles,
} from '@modules/rules';

const ruleset = currentRuleset();

type CounterPatch = Partial<Omit<ProgressCounters, 'stats' | 'completionsByStrictness'>> & {
  readonly stats?: Partial<ProgressCounters['stats']>;
  readonly completionsByStrictness?: Partial<ProgressCounters['completionsByStrictness']>;
};

const counters = (patch: CounterPatch = {}): ProgressCounters => ({
  ...EMPTY_PROGRESS_COUNTERS,
  ...patch,
  stats: { ...EMPTY_PROGRESS_COUNTERS.stats, ...patch.stats },
  completionsByStrictness: { ...EMPTY_PROGRESS_COUNTERS.completionsByStrictness, ...patch.completionsByStrictness },
});

const ALL_STATS_TOUCHED: CounterPatch = { stats: { discipline: 1, body: 1, wealth: 1, mind: 1 } };
const ALL_STATS_AT_30: CounterPatch = { stats: { discipline: 30, body: 30, wealth: 30, mind: 30 } };

describe('achievement catalogue', () => {
  it('should hold the seventeen phase-one achievements under unique ids', () => {
    expect(ACHIEVEMENTS).toHaveLength(17);
    expect(new Set(ACHIEVEMENTS.map(achievement => achievement.id)).size).toBe(17);
  });

  it('should grant nothing to a brand-new hero', () => {
    expect(satisfiedAchievements(ruleset, EMPTY_PROGRESS_COUNTERS)).toEqual([]);
  });

  const boundaries: readonly [id: AchievementId, satisfying: CounterPatch, short: CounterPatch][] = [
    ['first_quest_completed', { questsCompleted: 1 }, { questsCompleted: 0 }],
    ['first_level_up', { level: 2 }, { level: 1 }],
    ['first_bronze_streak', { longestStreakDays: 3 }, { longestStreakDays: 2 }],
    ['first_silver_streak', { longestStreakDays: 7 }, { longestStreakDays: 6 }],
    ['first_gold_streak', { longestStreakDays: 30 }, { longestStreakDays: 29 }],
    ['first_platinum_streak', { longestStreakDays: 100 }, { longestStreakDays: 99 }],
    ['xp_100', { totalXp: 100 }, { totalXp: 99 }],
    ['xp_500', { totalXp: 500 }, { totalXp: 499 }],
    ['first_subscription_confirmed', { subscriptionsConfirmed: 1 }, { subscriptionsConfirmed: 0 }],
    ['first_receipt_scanned', { receiptsScanned: 1 }, { receiptsScanned: 0 }],
    ['all_stats_touched', ALL_STATS_TOUCHED, { stats: { discipline: 40, body: 40, wealth: 40 } }],
    ['first_full_hp_day', { fullHpDays: 1 }, { fullHpDays: 0 }],
    ['first_crown_banked', { crownsBanked: 1 }, { crownsBanked: 0 }],
    ['first_recovery_completed', { completionsByStrictness: { recovery: 1 } }, { completionsByStrictness: { recovery: 0 } }],
    ['first_locked_day_cleared', { lockedDaysCleared: 1 }, { lockedDaysCleared: 0 }],
    ['first_comeback_claimed', { comebackBonusesClaimed: 1 }, { comebackBonusesClaimed: 0 }],
    ['first_returner_ritual', { returnerRitualsCompleted: 1 }, { returnerRitualsCompleted: 0 }],
  ];

  it('should cover every catalogued achievement', () => {
    expect(boundaries.map(([id]) => id).sort()).toEqual(ACHIEVEMENTS.map(achievement => achievement.id).sort());
  });

  for (const [id, satisfying, short] of boundaries) {
    it(`should grant ${id} at its threshold and not below it`, () => {
      expect(satisfiedAchievements(ruleset, counters(satisfying))).toContain(id);
      expect(satisfiedAchievements(ruleset, counters(short))).not.toContain(id);
    });
  }
});

describe('title catalogue', () => {
  it('should hold the seventeen phase-one titles under unique ids', () => {
    expect(TITLES).toHaveLength(17);
    expect(new Set(TITLES.map(title => title.id)).size).toBe(17);
  });

  it('should grant nothing to a brand-new hero', () => {
    expect(satisfiedTitles(ruleset, EMPTY_PROGRESS_COUNTERS)).toEqual([]);
  });

  const boundaries: readonly [id: TitleId, satisfying: CounterPatch, short: CounterPatch][] = [
    ['steady_builder', { stats: { discipline: 60 } }, { stats: { discipline: 59 } }],
    ['body_tempered', { stats: { body: 60 } }, { stats: { body: 59 } }],
    ['wealth_disciplined', { stats: { wealth: 60 } }, { stats: { wealth: 59 } }],
    ['mind_cultivated', { stats: { mind: 60 } }, { stats: { mind: 59 } }],
    ['anchor_holder', { longestAnchorStreakDays: 30 }, { longestAnchorStreakDays: 29 }],
    ['goal_keeper', { completionsByStrictness: { goal: 30 } }, { completionsByStrictness: { goal: 29 } }],
    ['routine_forged', { completionsByStrictness: { routine: 100 } }, { completionsByStrictness: { routine: 99 } }],
    ['quiet_climber', { questsReachingSilverStreak: 3 }, { questsReachingSilverStreak: 2 }],
    ['architect', { lockedDaysCleared: 10 }, { lockedDaysCleared: 9 }],
    ['honest_planner', { reschedulesWithReasonIn90Days: 10 }, { reschedulesWithReasonIn90Days: 9 }],
    ['reflective_practitioner', { reasonTaggedEvents: 20 }, { reasonTaggedEvents: 19 }],
    ['restorer', { completionsByStrictness: { recovery: 5 } }, { completionsByStrictness: { recovery: 4 } }],
    ['returner', { completionsAfterReturner: 1 }, { completionsAfterReturner: 0 }],
    ['comeback_steady', { comebackBonusesClaimed: 10 }, { comebackBonusesClaimed: 9 }],
    ['optional_surplus', { completionsByStrictness: { optional: 30 } }, { completionsByStrictness: { optional: 29 } }],
    ['cross_stat_climber', ALL_STATS_AT_30, { stats: { discipline: 90, body: 90, wealth: 90, mind: 29 } }],
    ['quiet_year', { activeDays: 365 }, { activeDays: 364 }],
  ];

  it('should cover every catalogued title', () => {
    expect(boundaries.map(([id]) => id).sort()).toEqual(TITLES.map(title => title.id).sort());
  });

  for (const [id, satisfying, short] of boundaries) {
    it(`should grant ${id} at its threshold and not below it`, () => {
      expect(satisfiedTitles(ruleset, counters(satisfying))).toContain(id);
      expect(satisfiedTitles(ruleset, counters(short))).not.toContain(id);
    });
  }
});

describe('incremental grants', () => {
  it('should report only the achievements not already earned', () => {
    const earned = counters({ questsCompleted: 4, totalXp: 120, level: 3 });
    expect(unlockedAchievements(ruleset, earned, [])).toEqual(['first_quest_completed', 'first_level_up', 'xp_100']);
    expect(unlockedAchievements(ruleset, earned, ['first_quest_completed', 'xp_100'])).toEqual(['first_level_up']);
    expect(unlockedAchievements(ruleset, earned, satisfiedAchievements(ruleset, earned))).toEqual([]);
  });

  it('should report only the titles not already earned', () => {
    const earned = counters({ stats: { discipline: 60 }, activeDays: 365 });
    expect(unlockedTitles(ruleset, earned, [])).toEqual(['steady_builder', 'quiet_year']);
    expect(unlockedTitles(ruleset, earned, ['steady_builder'])).toEqual(['quiet_year']);
  });
});

describe('reconciliation recompute', () => {
  const history: readonly ProgressCounters[] = [
    counters({ questsCompleted: 1, totalXp: 12, level: 1 }),
    counters({ questsCompleted: 9, totalXp: 104, level: 2, longestStreakDays: 7, ...ALL_STATS_TOUCHED }),
    counters({ questsCompleted: 40, totalXp: 520, level: 4, longestStreakDays: 31, crownsBanked: 2, ...ALL_STATS_TOUCHED }),
  ];

  it('should agree with the incremental fold over the same history', () => {
    const earned: AchievementId[] = [];
    for (const snapshot of history) earned.push(...unlockedAchievements(ruleset, snapshot, earned));
    expect([...earned].sort()).toEqual([...recomputeAchievements(ruleset, history)].sort());
  });

  it('should keep a title whose rolling window has since emptied', () => {
    const windowed: readonly ProgressCounters[] = [counters({ reschedulesWithReasonIn90Days: 10 }), counters({ reschedulesWithReasonIn90Days: 0 })];
    expect(recomputeTitles(ruleset, windowed)).toEqual(['honest_planner']);
    expect(satisfiedTitles(ruleset, windowed[1] ?? EMPTY_PROGRESS_COUNTERS)).toEqual([]);
  });

  it('should return the catalogue order regardless of the order conditions were met', () => {
    const reversed: readonly ProgressCounters[] = [counters({ crownsBanked: 1 }), counters({ questsCompleted: 1 })];
    expect(recomputeAchievements(ruleset, reversed)).toEqual(['first_quest_completed', 'first_crown_banked']);
  });

  it('should grant nothing from an empty history', () => {
    expect(recomputeAchievements(ruleset, [])).toEqual([]);
    expect(recomputeTitles(ruleset, [])).toEqual([]);
  });
});
