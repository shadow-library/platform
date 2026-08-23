import { type Ruleset, type RulesetVersion } from './rules.types';

const RULESET_V1: Ruleset = {
  version: 1,

  strictness: {
    anchor: {
      schedulingModel: 'strict_time',
      crownWeight: 1.5,
      incursHpCost: true,
      triggersRecovery: true,
      streakEligibility: 'always',
      allowsPostpone: true,
      consumesOneShot: true,
    },
    routine: {
      schedulingModel: 'time_window',
      crownWeight: 1.0,
      incursHpCost: true,
      triggersRecovery: true,
      streakEligibility: 'always',
      allowsPostpone: true,
      consumesOneShot: true,
    },
    goal: {
      schedulingModel: 'day_level',
      crownWeight: 1.0,
      incursHpCost: false,
      triggersRecovery: false,
      streakEligibility: 'always',
      allowsPostpone: true,
      consumesOneShot: false,
    },
    recovery: {
      schedulingModel: 'day_level',
      crownWeight: 0,
      incursHpCost: false,
      triggersRecovery: false,
      streakEligibility: 'never',
      allowsPostpone: false,
      consumesOneShot: false,
    },
    optional: {
      schedulingModel: 'day_level',
      crownWeight: 0,
      incursHpCost: false,
      triggersRecovery: false,
      streakEligibility: 'opt_in',
      allowsPostpone: false,
      consumesOneShot: false,
    },
  },

  reward: {
    baseXp: {
      anchor: { on_time: 12, late_0_2h: 8, late_2h_plus: 5, day_1: 3, day_2: 1, day_3: 0, day_4: 0 },
      routine: { on_time: 10, late_0_2h: 7, late_2h_plus: 5, day_1: 2, day_2: 1, day_3: 0, day_4: 0 },
      goal: { on_time: 8, late_0_2h: 8, late_2h_plus: 8, day_1: 2, day_2: 1, day_3: 0, day_4: 0 },
      recovery: { on_time: 5, late_0_2h: 5, late_2h_plus: 5, day_1: 0, day_2: 0, day_3: 0, day_4: 0 },
      optional: { on_time: 8, late_0_2h: 8, late_2h_plus: 8, day_1: 1, day_2: 0, day_3: 0, day_4: 0 },
    },
    baseCoins: { anchor: 2, routine: 1, goal: 1, recovery: 0, optional: 1 },
    partialXpFactor: 0.5,
    lockXpModifier: 1.1,
    oneShotXpModifiers: { returner: 1.2, comeback: 1.5 },
    comebackCoinBonus: 1,
    xpCeiling: 25,
    statTick: 1,
    timing: { anchorGraceMinutes: 30, lateStepMinutes: 120 },
  },

  level: { curveCoefficient: 100, curveExponent: 1.5, maxLevel: 999 },

  streaks: {
    tiers: [
      { id: 'none', minDays: 0, xpModifier: 1.0 },
      { id: 'bronze', minDays: 3, xpModifier: 1.0 },
      { id: 'silver', minDays: 7, xpModifier: 1.1 },
      { id: 'gold', minDays: 30, xpModifier: 1.2 },
      { id: 'platinum', minDays: 100, xpModifier: 1.3 },
    ],
    breakAnnounceMinDays: 7,
  },

  shields: { capPerQuest: 2, expires: false, returnerGrant: 1 },

  intensityModes: {
    standard: {
      hpMax: 5,
      overnightHpRegen: 3,
      crownCadence: 'daily',
      shieldEarnCadence: 7,
      hpCost: { perBreak: 1, perBreakEndingHighStreak: 1 },
      comebackTriggers: [{ kind: 'miss_within_days', days: 3, strictness: ['anchor'], requiresColdMomentum: true }, { kind: 'anchor_miss_yesterday' }],
    },
    low_intensity: {
      hpMax: 8,
      overnightHpRegen: 5,
      crownCadence: 'weekly',
      shieldEarnCadence: 5,
      hpCost: { perBreak: 0, perBreakEndingHighStreak: 0 },
      comebackTriggers: [{ kind: 'miss_within_days', days: 3, strictness: ['anchor', 'routine'], requiresColdMomentum: false }],
    },
    high_intensity: {
      hpMax: 3,
      overnightHpRegen: 2,
      crownCadence: 'daily',
      shieldEarnCadence: 10,
      hpCost: { perBreak: 1, perBreakEndingHighStreak: 2 },
      comebackTriggers: [{ kind: 'anchor_miss_yesterday' }],
    },
  },

  crown: { xpPerWeight: 4, coinsWeightDivisor: 2, maxCoins: 5, weeklyAnchorWeekday: 1 },

  recovery: { maxPerDay: 1, triggeredByStrictness: ['anchor', 'routine'] },

  comeback: { maxFiresPerDay: 1, maxFiresPerDayViaRecovery: 2 },

  returner: { defaultThresholdDays: 7, shieldGrant: 1, suppressesComeback: true },

  momentum: { recentDayWeights: [1.0, 0.7, 0.5], medianWindowDays: 14, coldBelowRatio: 0.3, warmAboveRatio: 1.1 },

  capacity: {
    newUserBaselineCap: 14,
    ratchetFactor: 1.15,
    medianWindowDays: 14,
    coldMomentumFactor: 0.7,
    heavyMissDayFactor: 0.85,
    softWarningRatio: 1.0,
    modalWarningRatio: 1.3,
    softWarningThrottleDays: 7,
    anchorWarnAboveCount: 3,
  },

  reasonTags: [
    'forgot',
    'too_tired',
    'task_too_big',
    'schedule_conflict',
    'avoided_it',
    'emotional_resistance',
    'health',
    'travel',
    'family_social',
    'work_emergency',
    'not_important_anymore',
    'poorly_planned',
    'other',
  ],

  quickLogs: {
    journal: { xp: 5, coins: 0, statTick: 0, maxRewardedPerDay: 1 },
    meal: { xp: 3, coins: 0, statTick: 0, maxRewardedPerDay: 1 },
    weight: { xp: 3, coins: 0, statTick: 0, maxRewardedPerDay: 1 },
    side_quest: { xp: 8, coins: 1, statTick: 1, maxRewardedPerDay: 3 },
  },

  subscriptionConfirmationCoins: 1,
};

/** Append a new version; never mutate a published one — history stamps `ruleset_version` to stay interpretable. */
export const RULESETS: Readonly<Record<RulesetVersion, Ruleset>> = { 1: RULESET_V1 };

export const CURRENT_RULESET_VERSION: RulesetVersion = 1;

export const getRuleset = (version: RulesetVersion): Ruleset => RULESETS[version];

export const currentRuleset = (): Ruleset => RULESETS[CURRENT_RULESET_VERSION];
