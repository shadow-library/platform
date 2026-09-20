import { type MomentumBucket, type Ruleset } from './rules.types';

export interface MomentumInput {
  /** Completion counts indexed by days before today, most recent first: today, yesterday, the day before. */
  readonly recentCompletions: readonly [number, number, number];
  /** Daily completion counts for the trailing window, most recent first; only the leading `medianWindowDays` are read. */
  readonly trailingCompletions: readonly number[];
}

export interface Momentum {
  readonly weighted: number;
  readonly median: number;
  /** Null when the trailing median is zero, where no ratio is defined. */
  readonly ratio: number | null;
  readonly bucket: MomentumBucket;
}

export const medianOf = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

export const trailingMedian = (values: readonly number[], windowDays: number): number => medianOf(values.slice(0, Math.max(0, windowDays)));

export const computeMomentum = (ruleset: Ruleset, input: MomentumInput): Momentum => {
  const weighted = ruleset.momentum.recentDayWeights.reduce((total, weight, index) => total + weight * Math.max(0, input.recentCompletions[index] ?? 0), 0);
  const median = trailingMedian(input.trailingCompletions, ruleset.momentum.medianWindowDays);

  if (median === 0) return { weighted, median, ratio: null, bucket: weighted > 0 ? 'warm' : 'cold' };

  const ratio = weighted / median;
  if (ratio < ruleset.momentum.coldBelowRatio) return { weighted, median, ratio, bucket: 'cold' };
  if (ratio > ruleset.momentum.warmAboveRatio) return { weighted, median, ratio, bucket: 'warm' };
  return { weighted, median, ratio, bucket: 'steady' };
};
