import { type Ruleset } from './rules.types';

const thresholdCache = new WeakMap<Ruleset, readonly number[]>();

export const xpToAdvance = (ruleset: Ruleset, level: number): number => {
  const { curveCoefficient, curveExponent, maxLevel } = ruleset.level;
  const current = Math.trunc(level);
  if (current < 1 || current >= maxLevel) return 0;
  return Math.round(curveCoefficient * Math.pow(current, curveExponent));
};

/** Indexed by level: the lifetime XP at which that level is reached. Index 0 is unused; level 1 costs nothing. */
const levelThresholds = (ruleset: Ruleset): readonly number[] => {
  const cached = thresholdCache.get(ruleset);
  if (cached) return cached;

  const thresholds: number[] = [0, 0];
  let cumulative = 0;
  for (let level = 1; level < ruleset.level.maxLevel; level++) {
    cumulative += xpToAdvance(ruleset, level);
    thresholds.push(cumulative);
  }
  thresholdCache.set(ruleset, thresholds);
  return thresholds;
};

const clampLevel = (ruleset: Ruleset, level: number): number => Math.min(Math.max(Math.trunc(level), 1), ruleset.level.maxLevel);

export const xpThresholdForLevel = (ruleset: Ruleset, level: number): number => levelThresholds(ruleset)[clampLevel(ruleset, level)] ?? 0;

export const levelFor = (ruleset: Ruleset, totalXp: number): number => {
  const thresholds = levelThresholds(ruleset);
  const xp = Math.max(0, Math.trunc(totalXp));

  let low = 1;
  let high = ruleset.level.maxLevel;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if ((thresholds[mid] ?? Number.POSITIVE_INFINITY) <= xp) low = mid;
    else high = mid - 1;
  }
  return low;
};
