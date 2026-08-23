import { type CompletionKind, type OneShotModifier, type Ruleset, type StreakTier, type StreakTierId, type Strictness, type TimingBand } from './rules.types';

export interface RewardInput {
  readonly strictness: Strictness;
  readonly band: TimingBand;
  readonly completion: CompletionKind;
  readonly streakDays: number;
  readonly lockActive: boolean;
  readonly oneShot: OneShotModifier;
}

export interface RewardOutcome {
  readonly xp: number;
  readonly coins: number;
  readonly statTick: number;
  readonly baseXp: number;
  readonly modifier: number;
  readonly streakTier: StreakTierId;
  readonly oneShotConsumed: OneShotModifier;
}

export const streakTierFor = (ruleset: Ruleset, streakDays: number): StreakTier => {
  let resolved: StreakTier = ruleset.streaks.tiers[0];
  for (const tier of ruleset.streaks.tiers) if (streakDays >= tier.minDays) resolved = tier;
  return resolved;
};

export const computeReward = (ruleset: Ruleset, input: RewardInput): RewardOutcome => {
  const { reward } = ruleset;
  const tableXp = reward.baseXp[input.strictness][input.band];
  const baseXp = input.completion === 'partial' ? Math.floor(tableXp * reward.partialXpFactor) : tableXp;

  const tier = streakTierFor(ruleset, input.streakDays);
  const oneShotConsumed = ruleset.strictness[input.strictness].consumesOneShot ? input.oneShot : 'none';
  const lockModifier = input.lockActive ? reward.lockXpModifier : 1;
  const oneShotXpModifier = oneShotConsumed === 'none' ? 1 : reward.oneShotXpModifiers[oneShotConsumed];
  const modifier = tier.xpModifier * lockModifier * oneShotXpModifier;

  const xp = Math.min(reward.xpCeiling, Math.floor(baseXp * modifier));
  const earnsBaseCoins = input.completion === 'full' && input.band === 'on_time';
  const coins = (earnsBaseCoins ? reward.baseCoins[input.strictness] : 0) + (oneShotConsumed === 'comeback' ? reward.comebackCoinBonus : 0);

  return { xp, coins, statTick: reward.statTick, baseXp, modifier, streakTier: tier.id, oneShotConsumed };
};
