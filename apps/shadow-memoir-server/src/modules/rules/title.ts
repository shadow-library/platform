import { type ProgressCounters, statValues } from './progress';
import { streakTierMinDays } from './reward';
import { type Ruleset } from './rules.types';

export type TitleId =
  | 'steady_builder'
  | 'body_tempered'
  | 'wealth_disciplined'
  | 'mind_cultivated'
  | 'anchor_holder'
  | 'goal_keeper'
  | 'routine_forged'
  | 'quiet_climber'
  | 'architect'
  | 'honest_planner'
  | 'reflective_practitioner'
  | 'restorer'
  | 'returner'
  | 'comeback_steady'
  | 'optional_surplus'
  | 'cross_stat_climber'
  | 'quiet_year';

export interface TitleDefinition {
  readonly id: TitleId;
  readonly name: string;
  readonly isSatisfied: (ruleset: Ruleset, counters: ProgressCounters) => boolean;
}

const STAT_TITLE_THRESHOLD = 60;
const CROSS_STAT_THRESHOLD = 30;

export const TITLES: readonly TitleDefinition[] = [
  { id: 'steady_builder', name: 'Steady Builder', isSatisfied: (_ruleset, counters) => counters.stats.discipline >= STAT_TITLE_THRESHOLD },
  { id: 'body_tempered', name: 'Body Tempered', isSatisfied: (_ruleset, counters) => counters.stats.body >= STAT_TITLE_THRESHOLD },
  { id: 'wealth_disciplined', name: 'Wealth Disciplined', isSatisfied: (_ruleset, counters) => counters.stats.wealth >= STAT_TITLE_THRESHOLD },
  { id: 'mind_cultivated', name: 'Mind Cultivated', isSatisfied: (_ruleset, counters) => counters.stats.mind >= STAT_TITLE_THRESHOLD },
  { id: 'anchor_holder', name: 'Anchor Holder', isSatisfied: (ruleset, counters) => counters.longestAnchorStreakDays >= streakTierMinDays(ruleset, 'gold') },
  { id: 'goal_keeper', name: 'Goal Keeper', isSatisfied: (_ruleset, counters) => counters.completionsByStrictness.goal >= 30 },
  { id: 'routine_forged', name: 'Routine Forged', isSatisfied: (_ruleset, counters) => counters.completionsByStrictness.routine >= 100 },
  { id: 'quiet_climber', name: 'Quiet Climber', isSatisfied: (_ruleset, counters) => counters.questsReachingSilverStreak >= 3 },
  { id: 'architect', name: 'Architect', isSatisfied: (_ruleset, counters) => counters.lockedDaysCleared >= 10 },
  { id: 'honest_planner', name: 'Honest Planner', isSatisfied: (_ruleset, counters) => counters.reschedulesWithReasonIn90Days >= 10 },
  { id: 'reflective_practitioner', name: 'Reflective Practitioner', isSatisfied: (_ruleset, counters) => counters.reasonTaggedEvents >= 20 },
  { id: 'restorer', name: 'Restorer', isSatisfied: (_ruleset, counters) => counters.completionsByStrictness.recovery >= 5 },
  { id: 'returner', name: 'Returner', isSatisfied: (_ruleset, counters) => counters.completionsAfterReturner >= 1 },
  { id: 'comeback_steady', name: 'Comeback Steady', isSatisfied: (_ruleset, counters) => counters.comebackBonusesClaimed >= 10 },
  { id: 'optional_surplus', name: 'Optional Surplus', isSatisfied: (_ruleset, counters) => counters.completionsByStrictness.optional >= 30 },
  { id: 'cross_stat_climber', name: 'Cross-Stat Climber', isSatisfied: (_ruleset, counters) => statValues(counters).every(value => value >= CROSS_STAT_THRESHOLD) },
  { id: 'quiet_year', name: 'Quiet Year', isSatisfied: (_ruleset, counters) => counters.activeDays >= 365 },
];

export const satisfiedTitles = (ruleset: Ruleset, counters: ProgressCounters): readonly TitleId[] =>
  TITLES.filter(title => title.isSatisfied(ruleset, counters)).map(title => title.id);

export const unlockedTitles = (ruleset: Ruleset, counters: ProgressCounters, earned: readonly TitleId[]): readonly TitleId[] =>
  satisfiedTitles(ruleset, counters).filter(id => !earned.includes(id));

/** Titles are kept forever, so the rolling-window predicates are replayed over every snapshot rather than re-tested against today. */
export const recomputeTitles = (ruleset: Ruleset, snapshots: readonly ProgressCounters[]): readonly TitleId[] => {
  const earned = new Set<TitleId>();
  for (const counters of snapshots) for (const id of satisfiedTitles(ruleset, counters)) earned.add(id);
  return TITLES.filter(title => earned.has(title.id)).map(title => title.id);
};
