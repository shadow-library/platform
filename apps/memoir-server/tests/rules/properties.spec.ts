import { describe, expect, it } from 'bun:test';

import {
  type AchievementId,
  applyStreakEvent,
  comebackBonus,
  comebackNetXp,
  type CompletionKind,
  computeDayHp,
  crownWeightFor,
  currentRuleset,
  EMPTY_PROGRESS_COUNTERS,
  EMPTY_STREAK_STATE,
  endowCrown,
  evaluateComebackArming,
  forfeitCrownSlice,
  hpCostFor,
  type IntensityMode,
  type MomentumBucket,
  type ProgressCounters,
  type QuestLogState,
  type RewardInput,
  satisfiedAchievements,
  satisfiedTitles,
  type StreakState,
  type Strictness,
  type TimingBand,
  type TitleId,
  unlockedAchievements,
} from '@modules/rules';

const ruleset = currentRuleset();

const RUNS = 200;

const seeded = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
};

const pick = <T>(next: () => number, values: readonly [T, ...T[]]): T => values[Math.floor(next() * values.length)] ?? values[0];

const integer = (next: () => number, max: number): number => Math.floor(next() * (max + 1));

const MODES: readonly [IntensityMode, ...IntensityMode[]] = ['standard', 'low_intensity', 'high_intensity'];
const STATES: readonly [QuestLogState, ...QuestLogState[]] = ['completed', 'partial', 'late', 'recovery', 'skipped', 'missed', 'postponed', 'rescheduled'];
const BANDS: readonly [TimingBand, ...TimingBand[]] = ['on_time', 'late_0_2h', 'late_2h_plus', 'day_1', 'day_2', 'day_3', 'day_4'];
const COMPLETIONS: readonly [CompletionKind, ...CompletionKind[]] = ['full', 'partial'];
const PUNISHABLE: readonly [Strictness, ...Strictness[]] = ['anchor', 'routine'];
const MOMENTUM: readonly [MomentumBucket, ...MomentumBucket[]] = ['cold', 'steady', 'warm'];

const runs = (seed: number) => Array.from({ length: RUNS }, (_value, index) => seeded(seed + index * 7919));

describe('comeback is net negative', () => {
  it('should never repay the XP the arming miss gave up', () => {
    for (const next of runs(11)) {
      const forgone: RewardInput = { strictness: pick(next, PUNISHABLE), band: 'on_time', completion: 'full', streakDays: 0, lockActive: false, oneShot: 'none' };
      const claimed: RewardInput = {
        strictness: pick(next, PUNISHABLE),
        band: pick(next, BANDS),
        completion: pick(next, COMPLETIONS),
        streakDays: integer(next, 400),
        lockActive: next() < 0.5,
        oneShot: 'comeback',
      };

      expect(comebackNetXp(ruleset, { forgone, claimed })).toBeLessThan(0);
    }
  });

  it('should never pay a bonus beyond the single comeback coin', () => {
    for (const next of runs(23)) {
      const claimed: RewardInput = {
        strictness: pick(next, PUNISHABLE),
        band: pick(next, BANDS),
        completion: pick(next, COMPLETIONS),
        streakDays: integer(next, 400),
        lockActive: next() < 0.5,
        oneShot: 'comeback',
      };

      expect(comebackBonus(ruleset, claimed).coins).toBeLessThanOrEqual(ruleset.reward.comebackCoinBonus);
    }
  });
});

describe('recovery never cascades', () => {
  it('should cost no HP, no streak, and no crown whatever a recovery occurrence does', () => {
    for (const next of runs(37)) {
      const intensityMode = pick(next, MODES);
      const state = pick(next, STATES);
      const streakDaysBefore = integer(next, 400);
      const streak: StreakState = { ...EMPTY_STREAK_STATE, currentDays: streakDaysBefore, longestDays: streakDaysBefore, shields: integer(next, 2) };

      expect(hpCostFor(ruleset, intensityMode, { occurrenceKey: 'r', strictness: 'recovery', state, shielded: false, streakDaysBefore })).toBe(0);
      expect(crownWeightFor(ruleset, 'recovery')).toBe(0);

      const transition = applyStreakEvent(ruleset, streak, { state, strictness: 'recovery', intensityMode, streakOptIn: next() < 0.5, onTime: next() < 0.5 });
      expect(transition.outcome).toBe('neutral');
      expect(transition.state).toEqual(streak);
    }
  });

  it('should never arm a comeback from recovery misses alone', () => {
    for (const next of runs(41)) {
      const recentMisses = Array.from({ length: integer(next, 5) }, () => ({ daysAgo: integer(next, 3), strictness: 'recovery' as Strictness }));
      const arming = evaluateComebackArming(ruleset, { intensityMode: pick(next, MODES), momentum: pick(next, MOMENTUM), returnerFired: false, recentMisses });
      expect(arming.armed).toBe(false);
    }
  });
});

describe('optional quests never punish', () => {
  it('should cost no HP and no crown slice whatever an optional occurrence does', () => {
    for (const next of runs(53)) {
      const state = pick(next, STATES);
      const streakDaysBefore = integer(next, 400);

      expect(hpCostFor(ruleset, pick(next, MODES), { occurrenceKey: 'o', strictness: 'optional', state, shielded: false, streakDaysBefore })).toBe(0);
      expect(crownWeightFor(ruleset, 'optional')).toBe(0);

      const day = endowCrown(ruleset, [crownWeightFor(ruleset, 'anchor'), crownWeightFor(ruleset, 'optional')]);
      expect(forfeitCrownSlice(ruleset, day, crownWeightFor(ruleset, 'optional'))).toEqual(day);
    }
  });

  it('should never break the streak of an optional quest that did not opt in', () => {
    for (const next of runs(59)) {
      const streak: StreakState = { ...EMPTY_STREAK_STATE, currentDays: integer(next, 400), shields: integer(next, 2) };
      const transition = applyStreakEvent(ruleset, streak, {
        state: pick(next, STATES),
        strictness: 'optional',
        intensityMode: pick(next, MODES),
        streakOptIn: false,
        onTime: next() < 0.5,
      });

      expect(transition.outcome).toBe('neutral');
      expect(transition.state).toEqual(streak);
    }
  });

  it('should never arm a comeback from optional misses alone', () => {
    for (const next of runs(61)) {
      const recentMisses = Array.from({ length: integer(next, 5) }, () => ({ daysAgo: integer(next, 3), strictness: 'optional' as Strictness }));
      expect(evaluateComebackArming(ruleset, { intensityMode: pick(next, MODES), momentum: pick(next, MOMENTUM), returnerFired: false, recentMisses }).armed).toBe(false);
    }
  });
});

describe('progression only ever moves forward', () => {
  it('should never shorten the longest streak a quest has held', () => {
    for (const next of runs(67)) {
      let state = EMPTY_STREAK_STATE;
      for (let day = 0; day < 40; day++) {
        const transition = applyStreakEvent(ruleset, state, {
          state: pick(next, STATES),
          strictness: pick<Strictness>(next, ['anchor', 'routine', 'goal']),
          intensityMode: pick(next, MODES),
          streakOptIn: false,
          onTime: next() < 0.5,
        });

        expect(transition.state.longestDays).toBeGreaterThanOrEqual(state.longestDays);
        expect(transition.state.longestDays).toBeGreaterThanOrEqual(transition.state.currentDays);
        expect(transition.state.shields).toBeLessThanOrEqual(ruleset.shields.capPerQuest);
        state = transition.state;
      }
    }
  });

  it('should never let a day spend more HP than the day had breaks', () => {
    for (const next of runs(71)) {
      const intensityMode = pick(next, MODES);
      const breaks = Array.from({ length: integer(next, 6) }, (_value, index) => ({
        occurrenceKey: `quest-${index}`,
        strictness: pick<Strictness>(next, ['anchor', 'routine', 'goal', 'optional']),
        state: pick(next, STATES),
        shielded: next() < 0.5,
        streakDaysBefore: integer(next, 400),
      }));

      const day = computeDayHp(ruleset, intensityMode, { previousHpEnd: integer(next, 8), breaks });
      expect(day.hpEnd).toBeGreaterThanOrEqual(0);
      expect(day.hpEnd).toBeLessThanOrEqual(day.hpMax);
      expect(day.spent).toBeLessThanOrEqual(breaks.length * ruleset.intensityModes[intensityMode].hpCost.perBreakEndingHighStreak);
    }
  });

  it('should never revoke an achievement or a title once its counters have grown', () => {
    for (const next of runs(73)) {
      let counters = EMPTY_PROGRESS_COUNTERS;
      const achievements = new Set<AchievementId>();
      const titles = new Set<TitleId>();

      for (let step = 0; step < 12; step++) {
        counters = {
          ...counters,
          totalXp: counters.totalXp + integer(next, 80),
          level: counters.level + integer(next, 1),
          questsCompleted: counters.questsCompleted + integer(next, 4),
          longestStreakDays: counters.longestStreakDays + integer(next, 12),
          longestAnchorStreakDays: counters.longestAnchorStreakDays + integer(next, 6),
          questsReachingSilverStreak: counters.questsReachingSilverStreak + integer(next, 1),
          crownsBanked: counters.crownsBanked + integer(next, 2),
          activeDays: counters.activeDays + integer(next, 40),
          stats: {
            discipline: counters.stats.discipline + integer(next, 9),
            body: counters.stats.body + integer(next, 9),
            wealth: counters.stats.wealth + integer(next, 9),
            mind: counters.stats.mind + integer(next, 9),
          },
        } satisfies ProgressCounters;

        for (const id of unlockedAchievements(ruleset, counters, [...achievements])) achievements.add(id);
        for (const id of satisfiedAchievements(ruleset, counters)) expect(achievements.has(id)).toBe(true);

        const satisfied = satisfiedTitles(ruleset, counters);
        for (const id of titles) expect(satisfied).toContain(id);
        for (const id of satisfied) titles.add(id);
      }
    }
  });
});
