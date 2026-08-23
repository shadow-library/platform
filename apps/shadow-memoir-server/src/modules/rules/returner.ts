import { type Ruleset } from './rules.types';

export type ReturnerPlacement = 'granted' | 'held_pending' | 'held_targetless';

export interface ReturnerCandidate {
  readonly questId: string;
  /** The streak length the Quest carried when the absence began — never recomputed from the absence itself. */
  readonly preAbsenceStreakDays: number;
  /** Monotonic creation ordinal; the most recently created Quest wins a streak-length tie. */
  readonly createdOrder: number;
  readonly shields: number;
}

export interface ReturnerFiringInput {
  readonly daysSinceLastActivity: number;
  /** Null falls back to the ruleset default. */
  readonly thresholdDays: number | null;
}

export interface ReturnerShieldGrant {
  readonly questId: string | null;
  readonly shields: number;
  readonly placement: ReturnerPlacement;
}

export const returnerThresholdFor = (ruleset: Ruleset, thresholdDays: number | null): number => thresholdDays ?? ruleset.returner.defaultThresholdDays;

export const returnerFires = (ruleset: Ruleset, input: ReturnerFiringInput): boolean => input.daysSinceLastActivity >= returnerThresholdFor(ruleset, input.thresholdDays);

const outranks = (candidate: ReturnerCandidate, best: ReturnerCandidate): boolean =>
  candidate.preAbsenceStreakDays > best.preAbsenceStreakDays || (candidate.preAbsenceStreakDays === best.preAbsenceStreakDays && candidate.createdOrder > best.createdOrder);

export const returnerShieldTarget = (candidates: readonly ReturnerCandidate[]): ReturnerCandidate | null =>
  candidates.reduce<ReturnerCandidate | null>((best, candidate) => (best === null || outranks(candidate, best) ? candidate : best), null);

/** With no pre-absence Quest to aim at, the gift waits targetless for the next Quest the user creates. */
export const planReturnerShieldGrant = (ruleset: Ruleset, candidates: readonly ReturnerCandidate[]): ReturnerShieldGrant => {
  const shields = ruleset.returner.shieldGrant;
  const target = returnerShieldTarget(candidates);
  if (target === null) return { questId: null, shields, placement: 'held_targetless' };
  return { questId: target.questId, shields, placement: target.shields >= ruleset.shields.capPerQuest ? 'held_pending' : 'granted' };
};
