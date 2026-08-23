import { trailingMedian } from './momentum';
import { type MomentumBucket, type Ruleset } from './rules.types';

export type CapacityWarning = 'none' | 'soft' | 'modal';

export interface CapacityInput {
  /** Daily completion counts, most recent first; empty means a new user, who starts at the baseline cap. */
  readonly trailingCompletions: readonly number[];
  readonly momentum: MomentumBucket;
  readonly priorDayHeavyMiss: boolean;
}

export interface Capacity {
  readonly baseline: number;
  readonly capacity: number;
}

export interface CapacityWarningInput {
  readonly plannedLoad: number;
  readonly capacity: number;
  /** The modal only ever appears on a lock attempt; the soft advisory is ambient. */
  readonly onLockAttempt: boolean;
  /** Null when no soft warning has been shown yet. */
  readonly daysSinceLastSoftWarning: number | null;
}

export const computeCapacity = (ruleset: Ruleset, input: CapacityInput): Capacity => {
  const { capacity: rules } = ruleset;
  const baseline = input.trailingCompletions.length === 0 ? rules.newUserBaselineCap : trailingMedian(input.trailingCompletions, rules.medianWindowDays) * rules.ratchetFactor;

  const cold = input.momentum === 'cold' ? rules.coldMomentumFactor : 1;
  const heavyMiss = input.priorDayHeavyMiss ? rules.heavyMissDayFactor : 1;
  return { baseline, capacity: Math.max(1, Math.round(baseline * cold * heavyMiss)) };
};

export const capacityWarningFor = (ruleset: Ruleset, input: CapacityWarningInput): CapacityWarning => {
  const { capacity: rules } = ruleset;
  const ratio = input.capacity <= 0 ? Number.POSITIVE_INFINITY : input.plannedLoad / input.capacity;
  if (input.onLockAttempt && ratio > rules.modalWarningRatio) return 'modal';

  const throttled = input.daysSinceLastSoftWarning !== null && input.daysSinceLastSoftWarning < rules.softWarningThrottleDays;
  return ratio > rules.softWarningRatio && !throttled ? 'soft' : 'none';
};

/** Warns while creating the Anchor beyond the soft cap, never blocking it. */
export const anchorSoftCapWarned = (ruleset: Ruleset, existingAnchorCount: number): boolean => existingAnchorCount >= ruleset.capacity.anchorWarnAboveCount;
