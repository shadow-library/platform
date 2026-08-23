export type RulesetVersion = 1;

export type Strictness = 'anchor' | 'routine' | 'goal' | 'recovery' | 'optional';

export type StatAffinity = 'discipline' | 'body' | 'wealth' | 'mind';

export type IntensityMode = 'standard' | 'low_intensity' | 'high_intensity';

export type SchedulingModel = 'strict_time' | 'time_window' | 'day_level';

export type StreakEligibility = 'always' | 'opt_in' | 'never';

export type TimingBand = 'on_time' | 'late_0_2h' | 'late_2h_plus' | 'day_1' | 'day_2' | 'day_3' | 'day_4';

export type CompletionKind = 'full' | 'partial';

/** Persisted terminal outcomes only; `upcoming` and `active` are display states and never reach the rules. */
export type QuestLogState = 'completed' | 'partial' | 'late' | 'skipped' | 'missed' | 'postponed' | 'rescheduled' | 'recovery';

export type OneShotModifier = 'none' | 'returner' | 'comeback';

export type StreakTierId = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum';

export type CrownCadence = 'daily' | 'weekly';

export type MomentumBucket = 'cold' | 'steady' | 'warm';

export type QuickLogSource = 'journal' | 'meal' | 'weight' | 'side_quest';

export type ReasonTag =
  | 'forgot'
  | 'too_tired'
  | 'task_too_big'
  | 'schedule_conflict'
  | 'avoided_it'
  | 'emotional_resistance'
  | 'health'
  | 'travel'
  | 'family_social'
  | 'work_emergency'
  | 'not_important_anymore'
  | 'poorly_planned'
  | 'other';

export interface StrictnessRules {
  readonly schedulingModel: SchedulingModel;
  /** Share of the period's Crown endowment this quest's scheduled occurrence carries. */
  readonly crownWeight: number;
  readonly incursHpCost: boolean;
  readonly triggersRecovery: boolean;
  readonly streakEligibility: StreakEligibility;
  readonly allowsPostpone: boolean;
  /** Returner and Comeback are spent only by the strictnesses that can be punished. */
  readonly consumesOneShot: boolean;
}

export interface TimingRules {
  /** Extends an Anchor's on-time window past its start minute; the window is half-open. */
  readonly anchorGraceMinutes: number;
  readonly lateStepMinutes: number;
}

export interface RewardRules {
  readonly baseXp: Readonly<Record<Strictness, Readonly<Record<TimingBand, number>>>>;
  readonly baseCoins: Readonly<Record<Strictness, number>>;
  readonly partialXpFactor: number;
  readonly lockXpModifier: number;
  readonly oneShotXpModifiers: Readonly<Record<Exclude<OneShotModifier, 'none'>, number>>;
  readonly comebackCoinBonus: number;
  readonly xpCeiling: number;
  readonly statTick: number;
  readonly timing: TimingRules;
}

export interface LevelCurve {
  readonly curveCoefficient: number;
  readonly curveExponent: number;
  readonly maxLevel: number;
}

export interface StreakTier {
  readonly id: StreakTierId;
  readonly minDays: number;
  readonly xpModifier: number;
}

export interface StreakRules {
  /** Ascending by `minDays`; the first entry is the floor tier and always matches. */
  readonly tiers: readonly [StreakTier, ...StreakTier[]];
  readonly breakAnnounceMinDays: number;
}

export interface ShieldRules {
  readonly capPerQuest: number;
  readonly expires: boolean;
  readonly returnerGrant: number;
}

export interface HpCostRules {
  readonly perBreak: number;
  /** Applied instead of `perBreak` when the break ends an unshielded Silver-or-better streak. */
  readonly perBreakEndingHighStreak: number;
}

export type ComebackTrigger =
  | { readonly kind: 'anchor_miss_yesterday' }
  | { readonly kind: 'miss_within_days'; readonly days: number; readonly strictness: readonly Strictness[]; readonly requiresColdMomentum: boolean };

export interface IntensityModeRules {
  readonly hpMax: number;
  readonly overnightHpRegen: number;
  readonly crownCadence: CrownCadence;
  readonly shieldEarnCadence: number;
  readonly hpCost: HpCostRules;
  /** Any satisfied trigger arms Comeback for the day. */
  readonly comebackTriggers: readonly ComebackTrigger[];
}

export interface CrownRules {
  readonly xpPerWeight: number;
  readonly coinsWeightDivisor: number;
  readonly maxCoins: number;
  /** ISO weekday the weekly cadence anchors on. */
  readonly weeklyAnchorWeekday: number;
}

export interface RecoveryRules {
  readonly maxPerDay: number;
  readonly triggeredByStrictness: readonly Strictness[];
}

export interface ComebackRules {
  readonly maxFiresPerDay: number;
  readonly maxFiresPerDayViaRecovery: number;
}

export interface ReturnerRules {
  readonly defaultThresholdDays: number;
  readonly shieldGrant: number;
  readonly suppressesComeback: boolean;
}

export interface MomentumRules {
  /** Indexed by days before today; weights the recent completion count. */
  readonly recentDayWeights: readonly [number, number, number];
  readonly medianWindowDays: number;
  readonly coldBelowRatio: number;
  readonly warmAboveRatio: number;
}

export interface CapacityRules {
  readonly newUserBaselineCap: number;
  readonly ratchetFactor: number;
  readonly medianWindowDays: number;
  readonly coldMomentumFactor: number;
  readonly heavyMissDayFactor: number;
  readonly softWarningRatio: number;
  readonly modalWarningRatio: number;
  readonly softWarningThrottleDays: number;
  readonly anchorWarnAboveCount: number;
}

export interface QuickLogReward {
  readonly xp: number;
  readonly coins: number;
  readonly statTick: number;
  readonly maxRewardedPerDay: number;
}

export interface Ruleset {
  readonly version: RulesetVersion;
  readonly strictness: Readonly<Record<Strictness, StrictnessRules>>;
  readonly reward: RewardRules;
  readonly level: LevelCurve;
  readonly streaks: StreakRules;
  readonly shields: ShieldRules;
  readonly intensityModes: Readonly<Record<IntensityMode, IntensityModeRules>>;
  readonly crown: CrownRules;
  readonly recovery: RecoveryRules;
  readonly comeback: ComebackRules;
  readonly returner: ReturnerRules;
  readonly momentum: MomentumRules;
  readonly capacity: CapacityRules;
  readonly reasonTags: readonly ReasonTag[];
  readonly quickLogs: Readonly<Record<QuickLogSource, QuickLogReward>>;
  readonly subscriptionConfirmationCoins: number;
}
