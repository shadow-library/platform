import { streakTierMinDays } from './reward';
import { type IntensityMode, type QuestLogState, type Ruleset, type Strictness } from './rules.types';

export interface HpBreak {
  /** One key per (quest, date) occurrence; repeats collapse so a miss record and its break never charge twice. */
  readonly occurrenceKey: string;
  readonly strictness: Strictness;
  readonly state: QuestLogState;
  readonly shielded: boolean;
  readonly streakDaysBefore: number;
}

export interface DayHpInput {
  /** Null for a first day, which opens at the mode's maximum. */
  readonly previousHpEnd: number | null;
  readonly breaks: readonly HpBreak[];
}

export interface DayHp {
  readonly hpStart: number;
  readonly hpEnd: number;
  readonly hpMax: number;
  readonly spent: number;
}

const COSTING_STATES: readonly QuestLogState[] = ['missed', 'skipped', 'postponed'];

export const hpMaxFor = (ruleset: Ruleset, intensityMode: IntensityMode): number => ruleset.intensityModes[intensityMode].hpMax;

export const hpStartFor = (ruleset: Ruleset, intensityMode: IntensityMode, previousHpEnd: number | null): number => {
  const mode = ruleset.intensityModes[intensityMode];
  if (previousHpEnd === null) return mode.hpMax;
  return Math.min(mode.hpMax, Math.max(0, previousHpEnd) + mode.overnightHpRegen);
};

export const hpCostFor = (ruleset: Ruleset, intensityMode: IntensityMode, event: HpBreak): number => {
  if (!ruleset.strictness[event.strictness].incursHpCost) return 0;
  if (!COSTING_STATES.includes(event.state)) return 0;
  const { hpCost } = ruleset.intensityModes[intensityMode];
  const endsHighStreak = !event.shielded && event.streakDaysBefore >= streakTierMinDays(ruleset, 'silver');
  return endsHighStreak ? hpCost.perBreakEndingHighStreak : hpCost.perBreak;
};

export const computeDayHp = (ruleset: Ruleset, intensityMode: IntensityMode, input: DayHpInput): DayHp => {
  const hpStart = hpStartFor(ruleset, intensityMode, input.previousHpEnd);
  const charged = new Map<string, number>();
  for (const event of input.breaks) charged.set(event.occurrenceKey, Math.max(charged.get(event.occurrenceKey) ?? 0, hpCostFor(ruleset, intensityMode, event)));

  const spent = [...charged.values()].reduce((total, cost) => total + cost, 0);
  return { hpStart, hpEnd: Math.max(0, hpStart - spent), hpMax: hpMaxFor(ruleset, intensityMode), spent };
};

/** The first miss of a day is always silent, and low intensity never signals at all. */
export const energyLowIndicated = (intensityMode: IntensityMode, missesToday: number): boolean => intensityMode !== 'low_intensity' && missesToday >= 2;
