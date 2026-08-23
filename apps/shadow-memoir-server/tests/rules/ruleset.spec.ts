import { describe, expect, it } from 'bun:test';

import fs from 'node:fs';
import path from 'node:path';

import { CURRENT_RULESET_VERSION, currentRuleset, getRuleset, RULESETS } from '@modules/rules';

const RULES_DIR = path.resolve(import.meta.dir, '../../src/modules/rules');
const ruleset = currentRuleset();

describe('RULESETS', () => {
  it('should expose version 1 as the current ruleset', () => {
    expect(CURRENT_RULESET_VERSION).toBe(1);
    expect(getRuleset(1)).toBe(ruleset);
    expect(ruleset.version).toBe(1);
    expect(Object.keys(RULESETS)).toEqual(['1']);
  });

  it('should carry the strictness table', () => {
    expect(ruleset.strictness).toEqual({
      anchor: {
        schedulingModel: 'strict_time',
        crownWeight: 1.5,
        incursHpCost: true,
        triggersRecovery: true,
        streakEligibility: 'always',
        allowsPostpone: true,
        consumesOneShot: true,
      },
      routine: {
        schedulingModel: 'time_window',
        crownWeight: 1.0,
        incursHpCost: true,
        triggersRecovery: true,
        streakEligibility: 'always',
        allowsPostpone: true,
        consumesOneShot: true,
      },
      goal: {
        schedulingModel: 'day_level',
        crownWeight: 1.0,
        incursHpCost: false,
        triggersRecovery: false,
        streakEligibility: 'always',
        allowsPostpone: true,
        consumesOneShot: false,
      },
      recovery: {
        schedulingModel: 'day_level',
        crownWeight: 0,
        incursHpCost: false,
        triggersRecovery: false,
        streakEligibility: 'never',
        allowsPostpone: false,
        consumesOneShot: false,
      },
      optional: {
        schedulingModel: 'day_level',
        crownWeight: 0,
        incursHpCost: false,
        triggersRecovery: false,
        streakEligibility: 'opt_in',
        allowsPostpone: false,
        consumesOneShot: false,
      },
    });
  });

  it('should carry the reward tables', () => {
    expect(ruleset.reward.baseXp).toEqual({
      anchor: { on_time: 12, late_0_2h: 8, late_2h_plus: 5, day_1: 3, day_2: 1, day_3: 0, day_4: 0 },
      routine: { on_time: 10, late_0_2h: 7, late_2h_plus: 5, day_1: 2, day_2: 1, day_3: 0, day_4: 0 },
      goal: { on_time: 8, late_0_2h: 8, late_2h_plus: 8, day_1: 2, day_2: 1, day_3: 0, day_4: 0 },
      recovery: { on_time: 5, late_0_2h: 5, late_2h_plus: 5, day_1: 0, day_2: 0, day_3: 0, day_4: 0 },
      optional: { on_time: 8, late_0_2h: 8, late_2h_plus: 8, day_1: 1, day_2: 0, day_3: 0, day_4: 0 },
    });
    expect(ruleset.reward.baseCoins).toEqual({ anchor: 2, routine: 1, goal: 1, recovery: 0, optional: 1 });
    expect(ruleset.reward.partialXpFactor).toBe(0.5);
    expect(ruleset.reward.lockXpModifier).toBe(1.1);
    expect(ruleset.reward.oneShotXpModifiers).toEqual({ returner: 1.2, comeback: 1.5 });
    expect(ruleset.reward.comebackCoinBonus).toBe(1);
    expect(ruleset.reward.xpCeiling).toBe(25);
    expect(ruleset.reward.statTick).toBe(1);
    expect(ruleset.reward.timing).toEqual({ anchorGraceMinutes: 30, lateStepMinutes: 120 });
  });

  it('should carry the level curve constants', () => {
    expect(ruleset.level).toEqual({ curveCoefficient: 100, curveExponent: 1.5, maxLevel: 999 });
  });

  it('should carry the milestone tiers and their modifiers', () => {
    expect(ruleset.streaks.tiers).toEqual([
      { id: 'none', minDays: 0, xpModifier: 1.0 },
      { id: 'bronze', minDays: 3, xpModifier: 1.0 },
      { id: 'silver', minDays: 7, xpModifier: 1.1 },
      { id: 'gold', minDays: 30, xpModifier: 1.2 },
      { id: 'platinum', minDays: 100, xpModifier: 1.3 },
    ]);
    expect(ruleset.streaks.breakAnnounceMinDays).toBe(7);
  });

  it('should carry the shield rules', () => {
    expect(ruleset.shields).toEqual({ capPerQuest: 2, expires: false, returnerGrant: 1 });
  });

  it('should carry the intensity-mode tables', () => {
    expect(ruleset.intensityModes.standard.hpMax).toBe(5);
    expect(ruleset.intensityModes.low_intensity.hpMax).toBe(8);
    expect(ruleset.intensityModes.high_intensity.hpMax).toBe(3);

    expect(ruleset.intensityModes.standard.overnightHpRegen).toBe(3);
    expect(ruleset.intensityModes.low_intensity.overnightHpRegen).toBe(5);
    expect(ruleset.intensityModes.high_intensity.overnightHpRegen).toBe(2);

    expect(ruleset.intensityModes.standard.crownCadence).toBe('daily');
    expect(ruleset.intensityModes.low_intensity.crownCadence).toBe('weekly');
    expect(ruleset.intensityModes.high_intensity.crownCadence).toBe('daily');

    expect(ruleset.intensityModes.standard.shieldEarnCadence).toBe(7);
    expect(ruleset.intensityModes.low_intensity.shieldEarnCadence).toBe(5);
    expect(ruleset.intensityModes.high_intensity.shieldEarnCadence).toBe(10);

    expect(ruleset.intensityModes.standard.hpCost).toEqual({ perBreak: 1, perBreakEndingHighStreak: 1 });
    expect(ruleset.intensityModes.low_intensity.hpCost).toEqual({ perBreak: 0, perBreakEndingHighStreak: 0 });
    expect(ruleset.intensityModes.high_intensity.hpCost).toEqual({ perBreak: 1, perBreakEndingHighStreak: 2 });
  });

  it('should carry the comeback arming triggers per mode', () => {
    expect(ruleset.intensityModes.standard.comebackTriggers).toEqual([
      { kind: 'miss_within_days', days: 3, strictness: ['anchor'], requiresColdMomentum: true },
      { kind: 'anchor_miss_yesterday' },
    ]);
    expect(ruleset.intensityModes.low_intensity.comebackTriggers).toEqual([{ kind: 'miss_within_days', days: 3, strictness: ['anchor', 'routine'], requiresColdMomentum: false }]);
    expect(ruleset.intensityModes.high_intensity.comebackTriggers).toEqual([{ kind: 'anchor_miss_yesterday' }]);
  });

  it('should carry the Crown constants', () => {
    expect(ruleset.crown).toEqual({ xpPerWeight: 4, coinsWeightDivisor: 2, maxCoins: 5, weeklyAnchorWeekday: 1 });
  });

  it('should carry the compassion windows', () => {
    expect(ruleset.recovery).toEqual({ maxPerDay: 1, triggeredByStrictness: ['anchor', 'routine'] });
    expect(ruleset.comeback).toEqual({ maxFiresPerDay: 1, maxFiresPerDayViaRecovery: 2 });
    expect(ruleset.returner).toEqual({ defaultThresholdDays: 7, shieldGrant: 1, suppressesComeback: true });
  });

  it('should carry the momentum windows', () => {
    expect(ruleset.momentum).toEqual({ recentDayWeights: [1.0, 0.7, 0.5], medianWindowDays: 14, coldBelowRatio: 0.3, warmAboveRatio: 1.1 });
  });

  it('should carry the capacity rules', () => {
    expect(ruleset.capacity).toEqual({
      newUserBaselineCap: 14,
      ratchetFactor: 1.15,
      medianWindowDays: 14,
      coldMomentumFactor: 0.7,
      heavyMissDayFactor: 0.85,
      softWarningRatio: 1.0,
      modalWarningRatio: 1.3,
      softWarningThrottleDays: 7,
      anchorWarnAboveCount: 3,
    });
  });

  it('should carry the 13-value reason-tag catalogue', () => {
    expect(ruleset.reasonTags).toEqual([
      'forgot',
      'too_tired',
      'task_too_big',
      'schedule_conflict',
      'avoided_it',
      'emotional_resistance',
      'health',
      'travel',
      'family_social',
      'work_emergency',
      'not_important_anymore',
      'poorly_planned',
      'other',
    ]);
  });

  it('should carry the quick-log reward table', () => {
    expect(ruleset.quickLogs).toEqual({
      journal: { xp: 5, coins: 0, statTick: 0, maxRewardedPerDay: 1 },
      meal: { xp: 3, coins: 0, statTick: 0, maxRewardedPerDay: 1 },
      weight: { xp: 3, coins: 0, statTick: 0, maxRewardedPerDay: 1 },
      side_quest: { xp: 8, coins: 1, statTick: 1, maxRewardedPerDay: 3 },
    });
    expect(ruleset.subscriptionConfirmationCoins).toBe(1);
  });
});

describe('rules module purity', () => {
  const sources = fs
    .readdirSync(RULES_DIR)
    .filter(file => file.endsWith('.ts'))
    .map(file => ({ file, content: fs.readFileSync(path.join(RULES_DIR, file), 'utf-8') }));

  it('should contain source files', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  for (const { file, content } of sources) {
    it(`should import only sibling modules in ${file}`, () => {
      const specifiers = [...content.matchAll(/from '([^']+)'/g)].map(match => match[1]);
      for (const specifier of specifiers) expect(specifier).toMatch(/^\.\//);
    });

    it(`should keep entitlement out of ${file}`, () => {
      expect(content).not.toMatch(/entitlement/i);
      expect(content).not.toMatch(/\bpaid\b/i);
      expect(content).not.toMatch(/'free'/);
    });

    it(`should keep runtime environment access out of ${file}`, () => {
      expect(content).not.toMatch(/process\.env/);
      expect(content).not.toMatch(/console\./);
      expect(content).not.toMatch(/new Error/);
    });
  }
});
