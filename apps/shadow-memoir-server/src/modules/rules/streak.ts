import { streakTierFor } from './reward';
import { type IntensityMode, type QuestLogState, type Ruleset, type StreakTierId, type Strictness } from './rules.types';

export type StreakOutcome = 'hold' | 'bridge' | 'break' | 'neutral';

export interface StreakState {
  readonly currentDays: number;
  readonly longestDays: number;
  readonly shields: number;
  readonly completionsTowardShield: number;
  /** A Returner shield aimed at a Quest already at cap waits here until consumption frees a slot. */
  readonly pendingShieldGrant: number;
}

export interface StreakEvent {
  readonly state: QuestLogState;
  readonly strictness: Strictness;
  readonly intensityMode: IntensityMode;
  /** Optional Quests count toward a streak only when their owner opted in. */
  readonly streakOptIn: boolean;
  /** Shield accrual counts on-time and partial completions only. */
  readonly onTime: boolean;
}

export interface StreakTransition {
  readonly outcome: StreakOutcome;
  readonly state: StreakState;
  readonly shieldsEarned: number;
  readonly shieldsConsumed: number;
  readonly endedAtDays: number;
  readonly announceBreak: boolean;
  readonly milestone: StreakTierId | null;
}

export interface ShieldGrantResult {
  readonly state: StreakState;
  readonly granted: number;
  readonly heldPending: number;
}

export const EMPTY_STREAK_STATE: StreakState = { currentDays: 0, longestDays: 0, shields: 0, completionsTowardShield: 0, pendingShieldGrant: 0 };

/** `late` is absent from PRD §4.6's hold and break lists; it is a completion that occurred, so it holds. */
const HOLD_STATES: readonly QuestLogState[] = ['completed', 'partial', 'late', 'recovery'];

const BREAK_STATES: readonly QuestLogState[] = ['skipped', 'missed', 'postponed'];

export const streakApplies = (ruleset: Ruleset, strictness: Strictness, streakOptIn: boolean): boolean => {
  const eligibility = ruleset.strictness[strictness].streakEligibility;
  return eligibility === 'always' || (eligibility === 'opt_in' && streakOptIn);
};

const settleShields = (ruleset: Ruleset, shields: number, pendingShieldGrant: number): Pick<StreakState, 'shields' | 'pendingShieldGrant'> => {
  const grantable = Math.min(Math.max(0, pendingShieldGrant), Math.max(0, ruleset.shields.capPerQuest - shields));
  return { shields: shields + grantable, pendingShieldGrant: Math.max(0, pendingShieldGrant) - grantable };
};

const neutral = (state: StreakState): StreakTransition => ({
  outcome: 'neutral',
  state,
  shieldsEarned: 0,
  shieldsConsumed: 0,
  endedAtDays: 0,
  announceBreak: false,
  milestone: null,
});

const hold = (ruleset: Ruleset, state: StreakState, event: StreakEvent): StreakTransition => {
  const cadence = ruleset.intensityModes[event.intensityMode].shieldEarnCadence;
  const accrues = event.state === 'partial' || event.onTime;
  const progress = state.completionsTowardShield + (accrues ? 1 : 0);
  const reachedCadence = accrues && cadence > 0 && progress >= cadence;
  const shieldsEarned = reachedCadence && state.shields < ruleset.shields.capPerQuest ? 1 : 0;

  const currentDays = state.currentDays + 1;
  const tierBefore = streakTierFor(ruleset, state.currentDays);
  const tierAfter = streakTierFor(ruleset, currentDays);

  return {
    outcome: 'hold',
    state: {
      currentDays,
      longestDays: Math.max(state.longestDays, currentDays),
      completionsTowardShield: reachedCadence ? 0 : progress,
      ...settleShields(ruleset, state.shields + shieldsEarned, state.pendingShieldGrant),
    },
    shieldsEarned,
    shieldsConsumed: 0,
    endedAtDays: 0,
    announceBreak: false,
    milestone: tierAfter.id === tierBefore.id ? null : tierAfter.id,
  };
};

const bridge = (ruleset: Ruleset, state: StreakState): StreakTransition => ({
  outcome: 'bridge',
  state: { ...state, ...settleShields(ruleset, state.shields - 1, state.pendingShieldGrant) },
  shieldsEarned: 0,
  shieldsConsumed: 1,
  endedAtDays: 0,
  announceBreak: false,
  milestone: null,
});

const breakRun = (ruleset: Ruleset, state: StreakState): StreakTransition => ({
  outcome: 'break',
  state: { currentDays: 0, longestDays: state.longestDays, completionsTowardShield: 0, ...settleShields(ruleset, 0, state.pendingShieldGrant) },
  shieldsEarned: 0,
  shieldsConsumed: 0,
  endedAtDays: state.currentDays,
  announceBreak: state.currentDays >= ruleset.streaks.breakAnnounceMinDays,
  milestone: null,
});

export const applyStreakEvent = (ruleset: Ruleset, state: StreakState, event: StreakEvent): StreakTransition => {
  if (!streakApplies(ruleset, event.strictness, event.streakOptIn)) return neutral(state);
  if (HOLD_STATES.includes(event.state)) return hold(ruleset, state, event);
  if (!BREAK_STATES.includes(event.state)) return neutral(state);
  return state.shields > 0 ? bridge(ruleset, state) : breakRun(ruleset, state);
};

export const grantStreakShield = (ruleset: Ruleset, state: StreakState, count: number): ShieldGrantResult => {
  const settled = settleShields(ruleset, state.shields, state.pendingShieldGrant + Math.max(0, count));
  return {
    state: { ...state, ...settled },
    granted: settled.shields - state.shields,
    heldPending: settled.pendingShieldGrant,
  };
};

export const recomputeStreak = (ruleset: Ruleset, events: readonly StreakEvent[], initial: StreakState = EMPTY_STREAK_STATE): StreakState =>
  events.reduce((state, event) => applyStreakEvent(ruleset, state, event).state, initial);
