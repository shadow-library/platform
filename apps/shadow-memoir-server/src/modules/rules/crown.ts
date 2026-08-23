import { type CrownCadence, type IntensityMode, type Ruleset, type Strictness } from './rules.types';
import { addDays, type LocalDate, weekdayOf } from './time';

export interface CrownShare {
  readonly xp: number;
  readonly coins: number;
}

export interface CrownPeriod {
  readonly cadence: CrownCadence;
  readonly start: LocalDate;
  readonly closesOn: LocalDate;
}

export interface CrownDayState {
  readonly endowedWeight: number;
  readonly forfeitedWeight: number;
  readonly grantedXp: number;
  readonly grantedCoins: number;
  readonly remainingXp: number;
  readonly remainingCoins: number;
}

const DAYS_PER_WEEK = 7;

const sumWeights = (weights: readonly number[]): number => weights.reduce((total, weight) => total + Math.max(0, weight), 0);

export const crownWeightFor = (ruleset: Ruleset, strictness: Strictness): number => ruleset.strictness[strictness].crownWeight;

export const crownCadenceFor = (ruleset: Ruleset, intensityMode: IntensityMode): CrownCadence => ruleset.intensityModes[intensityMode].crownCadence;

export const crownShare = (ruleset: Ruleset, weight: number): CrownShare => {
  const surviving = Math.max(0, weight);
  return { xp: Math.round(surviving * ruleset.crown.xpPerWeight), coins: Math.min(ruleset.crown.maxCoins, Math.ceil(surviving / ruleset.crown.coinsWeightDivisor)) };
};

/** A mid-period weight change may shrink the remainder but never lift it above the endowment the period opened with. */
const withRemainder = (ruleset: Ruleset, state: Omit<CrownDayState, 'remainingXp' | 'remainingCoins'>): CrownDayState => {
  const remainder = crownShare(ruleset, state.endowedWeight - state.forfeitedWeight);
  return { ...state, remainingXp: Math.min(state.grantedXp, remainder.xp), remainingCoins: Math.min(state.grantedCoins, remainder.coins) };
};

export const endowCrown = (ruleset: Ruleset, weights: readonly number[]): CrownDayState => {
  const endowedWeight = sumWeights(weights);
  const granted = crownShare(ruleset, endowedWeight);
  return withRemainder(ruleset, { endowedWeight, forfeitedWeight: 0, grantedXp: granted.xp, grantedCoins: granted.coins });
};

export const forfeitCrownSlice = (ruleset: Ruleset, state: CrownDayState, weight: number): CrownDayState =>
  withRemainder(ruleset, { ...state, forfeitedWeight: Math.min(state.endowedWeight, state.forfeitedWeight + Math.max(0, weight)) });

export const rescaleCrown = (ruleset: Ruleset, state: CrownDayState, weights: readonly number[]): CrownDayState => {
  const endowedWeight = sumWeights(weights);
  return withRemainder(ruleset, { ...state, endowedWeight, forfeitedWeight: Math.min(endowedWeight, state.forfeitedWeight) });
};

export const crownPeriodOf = (ruleset: Ruleset, cadence: CrownCadence, date: LocalDate): CrownPeriod => {
  if (cadence === 'daily') return { cadence, start: date, closesOn: date };
  const offset = (weekdayOf(date) - ruleset.crown.weeklyAnchorWeekday + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  const start = addDays(date, -offset);
  return { cadence, start, closesOn: addDays(start, DAYS_PER_WEEK - 1) };
};

export const isCrownPeriodClose = (ruleset: Ruleset, cadence: CrownCadence, date: LocalDate): boolean =>
  cadence === 'daily' || weekdayOf(date) === ((ruleset.crown.weeklyAnchorWeekday + DAYS_PER_WEEK - 2) % DAYS_PER_WEEK) + 1;

/** Daily remainders accumulate across a weekly period and bank once, on the period's closing day. */
export const crownBankAmount = (days: readonly CrownDayState[]): CrownShare =>
  days.reduce<CrownShare>((total, day) => ({ xp: total.xp + day.remainingXp, coins: total.coins + day.remainingCoins }), { xp: 0, coins: 0 });

export const recomputeCrownDay = (ruleset: Ruleset, weights: readonly number[], forfeitedWeights: readonly number[]): CrownDayState =>
  forfeitedWeights.reduce((state, weight) => forfeitCrownSlice(ruleset, state, weight), endowCrown(ruleset, weights));
