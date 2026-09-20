import { type ProgressCounters, statValues } from './progress';
import { streakTierMinDays } from './reward';
import { type Ruleset } from './rules.types';

export type AchievementId =
  | 'first_quest_completed'
  | 'first_level_up'
  | 'first_bronze_streak'
  | 'first_silver_streak'
  | 'first_gold_streak'
  | 'first_platinum_streak'
  | 'xp_100'
  | 'xp_500'
  | 'first_subscription_confirmed'
  | 'first_receipt_scanned'
  | 'all_stats_touched'
  | 'first_full_hp_day'
  | 'first_crown_banked'
  | 'first_recovery_completed'
  | 'first_locked_day_cleared'
  | 'first_comeback_claimed'
  | 'first_returner_ritual';

export interface AchievementDefinition {
  readonly id: AchievementId;
  readonly name: string;
  readonly isSatisfied: (ruleset: Ruleset, counters: ProgressCounters) => boolean;
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { id: 'first_quest_completed', name: 'First Quest Completed', isSatisfied: (_ruleset, counters) => counters.questsCompleted >= 1 },
  { id: 'first_level_up', name: 'First Level Up', isSatisfied: (_ruleset, counters) => counters.level >= 2 },
  { id: 'first_bronze_streak', name: 'First Bronze Streak', isSatisfied: (ruleset, counters) => counters.longestStreakDays >= streakTierMinDays(ruleset, 'bronze') },
  { id: 'first_silver_streak', name: 'First Silver Streak', isSatisfied: (ruleset, counters) => counters.longestStreakDays >= streakTierMinDays(ruleset, 'silver') },
  { id: 'first_gold_streak', name: 'First Gold Streak', isSatisfied: (ruleset, counters) => counters.longestStreakDays >= streakTierMinDays(ruleset, 'gold') },
  { id: 'first_platinum_streak', name: 'First Platinum Streak', isSatisfied: (ruleset, counters) => counters.longestStreakDays >= streakTierMinDays(ruleset, 'platinum') },
  { id: 'xp_100', name: '100 XP Earned', isSatisfied: (_ruleset, counters) => counters.totalXp >= 100 },
  { id: 'xp_500', name: '500 XP Earned', isSatisfied: (_ruleset, counters) => counters.totalXp >= 500 },
  { id: 'first_subscription_confirmed', name: 'First Subscription Confirmed', isSatisfied: (_ruleset, counters) => counters.subscriptionsConfirmed >= 1 },
  { id: 'first_receipt_scanned', name: 'First Receipt Scanned', isSatisfied: (_ruleset, counters) => counters.receiptsScanned >= 1 },
  { id: 'all_stats_touched', name: 'All Four Stats Touched', isSatisfied: (_ruleset, counters) => statValues(counters).every(value => value >= 1) },
  { id: 'first_full_hp_day', name: 'First Full HP Day', isSatisfied: (_ruleset, counters) => counters.fullHpDays >= 1 },
  { id: 'first_crown_banked', name: 'First Crown Banked', isSatisfied: (_ruleset, counters) => counters.crownsBanked >= 1 },
  { id: 'first_recovery_completed', name: 'First Recovery Quest Completed', isSatisfied: (_ruleset, counters) => counters.completionsByStrictness.recovery >= 1 },
  { id: 'first_locked_day_cleared', name: 'First Locked Day Cleared', isSatisfied: (_ruleset, counters) => counters.lockedDaysCleared >= 1 },
  { id: 'first_comeback_claimed', name: 'First Comeback Bonus Claimed', isSatisfied: (_ruleset, counters) => counters.comebackBonusesClaimed >= 1 },
  { id: 'first_returner_ritual', name: 'First Returner Ritual', isSatisfied: (_ruleset, counters) => counters.returnerRitualsCompleted >= 1 },
];

export const satisfiedAchievements = (ruleset: Ruleset, counters: ProgressCounters): readonly AchievementId[] =>
  ACHIEVEMENTS.filter(achievement => achievement.isSatisfied(ruleset, counters)).map(achievement => achievement.id);

export const unlockedAchievements = (ruleset: Ruleset, counters: ProgressCounters, earned: readonly AchievementId[]): readonly AchievementId[] =>
  satisfiedAchievements(ruleset, counters).filter(id => !earned.includes(id));

/** Reconciliation replays every snapshot: a grant is kept forever once its predicate held on any one of them. */
export const recomputeAchievements = (ruleset: Ruleset, snapshots: readonly ProgressCounters[]): readonly AchievementId[] => {
  const earned = new Set<AchievementId>();
  for (const counters of snapshots) for (const id of satisfiedAchievements(ruleset, counters)) earned.add(id);
  return ACHIEVEMENTS.filter(achievement => earned.has(achievement.id)).map(achievement => achievement.id);
};
