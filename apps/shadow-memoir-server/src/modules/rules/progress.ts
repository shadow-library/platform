import { type StatAffinity, type Strictness } from './rules.types';

/**
 * Every input the Achievement and Title catalogues read. All fields but `reschedulesWithReasonIn90Days` are lifetime
 * monotonic counters, so a predicate that holds once holds forever.
 */
export interface ProgressCounters {
  readonly totalXp: number;
  readonly level: number;
  readonly stats: Readonly<Record<StatAffinity, number>>;
  readonly questsCompleted: number;
  readonly completionsByStrictness: Readonly<Record<Strictness, number>>;
  readonly longestStreakDays: number;
  readonly longestAnchorStreakDays: number;
  readonly questsReachingSilverStreak: number;
  readonly subscriptionsConfirmed: number;
  readonly receiptsScanned: number;
  readonly fullHpDays: number;
  readonly crownsBanked: number;
  readonly lockedDaysCleared: number;
  readonly comebackBonusesClaimed: number;
  readonly returnerRitualsCompleted: number;
  readonly completionsAfterReturner: number;
  readonly reschedulesWithReasonIn90Days: number;
  readonly reasonTaggedEvents: number;
  readonly activeDays: number;
}

export const EMPTY_PROGRESS_COUNTERS: ProgressCounters = {
  totalXp: 0,
  level: 1,
  stats: { discipline: 0, body: 0, wealth: 0, mind: 0 },
  questsCompleted: 0,
  completionsByStrictness: { anchor: 0, routine: 0, goal: 0, recovery: 0, optional: 0 },
  longestStreakDays: 0,
  longestAnchorStreakDays: 0,
  questsReachingSilverStreak: 0,
  subscriptionsConfirmed: 0,
  receiptsScanned: 0,
  fullHpDays: 0,
  crownsBanked: 0,
  lockedDaysCleared: 0,
  comebackBonusesClaimed: 0,
  returnerRitualsCompleted: 0,
  completionsAfterReturner: 0,
  reschedulesWithReasonIn90Days: 0,
  reasonTaggedEvents: 0,
  activeDays: 0,
};

export const statValues = (counters: ProgressCounters): readonly number[] => [counters.stats.discipline, counters.stats.body, counters.stats.wealth, counters.stats.mind];
