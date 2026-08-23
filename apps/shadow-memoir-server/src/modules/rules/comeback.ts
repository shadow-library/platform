import { computeReward, type RewardInput } from './reward';
import { type ComebackTrigger, type IntensityMode, type MomentumBucket, type Ruleset, type Strictness } from './rules.types';

export type ComebackFireKind = 'fired' | 're_fired';

export interface RecentMiss {
  /** Whole local days before today; yesterday is 1. Today's misses are not yet knowable at arming time. */
  readonly daysAgo: number;
  readonly strictness: Strictness;
}

export interface ComebackArmingInput {
  readonly intensityMode: IntensityMode;
  readonly momentum: MomentumBucket;
  readonly returnerFired: boolean;
  readonly recentMisses: readonly RecentMiss[];
}

export interface ComebackArming {
  readonly armed: boolean;
  readonly trigger: ComebackTrigger | null;
  readonly suppressedByReturner: boolean;
}

export interface ComebackDayState {
  readonly armed: boolean;
  readonly fires: number;
  /** A Recovery Quest completion re-arms the day and lifts the fire allowance. */
  readonly armedViaRecovery: boolean;
}

export interface ComebackFire {
  readonly fired: boolean;
  readonly kind: ComebackFireKind | null;
  readonly state: ComebackDayState;
}

export interface ComebackNetInput {
  /** What the missed occurrence would have granted had it been completed on time. */
  readonly forgone: RewardInput;
  /** The completion the armed bonus is claimed on. */
  readonly claimed: RewardInput;
}

export const EMPTY_COMEBACK_DAY_STATE: ComebackDayState = { armed: false, fires: 0, armedViaRecovery: false };

const triggerSatisfied = (trigger: ComebackTrigger, input: ComebackArmingInput): boolean => {
  if (trigger.kind === 'anchor_miss_yesterday') return input.recentMisses.some(miss => miss.daysAgo === 1 && miss.strictness === 'anchor');
  if (trigger.requiresColdMomentum && input.momentum !== 'cold') return false;
  return input.recentMisses.some(miss => miss.daysAgo >= 1 && miss.daysAgo <= trigger.days && trigger.strictness.includes(miss.strictness));
};

export const evaluateComebackArming = (ruleset: Ruleset, input: ComebackArmingInput): ComebackArming => {
  if (input.returnerFired && ruleset.returner.suppressesComeback) return { armed: false, trigger: null, suppressedByReturner: true };

  const trigger = ruleset.intensityModes[input.intensityMode].comebackTriggers.find(candidate => triggerSatisfied(candidate, input)) ?? null;
  return { armed: trigger !== null, trigger, suppressedByReturner: false };
};

export const comebackFireAllowance = (ruleset: Ruleset, state: ComebackDayState): number =>
  state.armedViaRecovery ? ruleset.comeback.maxFiresPerDayViaRecovery : ruleset.comeback.maxFiresPerDay;

export const canFireComeback = (ruleset: Ruleset, state: ComebackDayState, strictness: Strictness): boolean =>
  state.armed && ruleset.strictness[strictness].consumesOneShot && state.fires < comebackFireAllowance(ruleset, state);

export const fireComeback = (ruleset: Ruleset, state: ComebackDayState, strictness: Strictness): ComebackFire => {
  if (!canFireComeback(ruleset, state, strictness)) return { fired: false, kind: null, state };
  const fires = state.fires + 1;
  return { fired: true, kind: fires > 1 ? 're_fired' : 'fired', state: { ...state, fires, armed: fires < comebackFireAllowance(ruleset, state) } };
};

export const armComebackViaRecovery = (state: ComebackDayState): ComebackDayState => ({ ...state, armed: true, armedViaRecovery: true });

export const comebackBonus = (ruleset: Ruleset, claimed: RewardInput): { xp: number; coins: number } => {
  const withBonus = computeReward(ruleset, { ...claimed, oneShot: 'comeback' });
  const without = computeReward(ruleset, { ...claimed, oneShot: 'none' });
  return { xp: withBonus.xp - without.xp, coins: withBonus.coins - without.coins };
};

/** Negative for every reachable pairing: the bonus can never repay the XP the arming miss gave up. */
export const comebackNetXp = (ruleset: Ruleset, input: ComebackNetInput): number =>
  comebackBonus(ruleset, input.claimed).xp - computeReward(ruleset, { ...input.forgone, oneShot: 'none' }).xp;
