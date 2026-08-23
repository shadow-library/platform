import { describe, expect, it } from 'vitest';

import {
  applyMarkdownTool,
  CAP_ADVISORY_THRESHOLD,
  deriveCapAdvisory,
  deriveThresholdOffer,
  firstOfDayReward,
  type HealthMetricDefinition,
  journalExcerpt,
  type MealPreset,
  MONTHLY_ENTRY_CAP,
  nextSideQuestReward,
  sameDayWeight,
  SIDE_QUEST_DAILY_REWARD_LIMIT,
  snapshotPresetToMeal,
  type WeightEntry,
} from '@/lib/data';

const preset: MealPreset = { id: 'preset-oats', name: 'Breakfast oats', calories: 410, mealType: 'cooked', proteinG: 24, carbsG: 58, fatG: 9, usageCount: 84 };

const steps: HealthMetricDefinition = { key: 'steps', name: 'Steps', unit: '', step: 100, precision: 0, threshold: { value: 8000, questTitle: 'Move 8,000 steps', xp: 30 } };

const sleep: HealthMetricDefinition = { key: 'sleep', name: 'Sleep', unit: 'h', step: 0.1, precision: 1, threshold: { value: 7, questTitle: null, xp: 0 } };

describe('meal preset snapshot', () => {
  it('should copy the preset values onto the meal so a later preset edit cannot rewrite it', () => {
    const meal = snapshotPresetToMeal(preset, { id: 'meal-1', date: '2026-08-23', loggedAt: '2026-08-23T07:20:00', rewarded: true });
    const edited: MealPreset = { ...preset, calories: 999, proteinG: 1 };

    expect(meal.calories).toBe(410);
    expect(meal.proteinG).toBe(24);
    expect(meal.presetId).toBe('preset-oats');
    expect(edited.calories).toBe(999);
    expect(meal.calories).toBe(410);
  });
});

describe('weight same-day entry', () => {
  const entries: WeightEntry[] = [{ id: 'w-1', date: '2026-08-23', kg: 78.9, loggedAt: '2026-08-23T06:58:00', rewarded: true }];

  it('should find the entry a same-day save would replace', () => {
    expect(sameDayWeight(entries, '2026-08-23')?.kg).toBe(78.9);
  });

  it('should find nothing to replace on a day with no entry', () => {
    expect(sameDayWeight(entries, '2026-08-22')).toBeNull();
  });

  it('should reward only the first weight of the day', () => {
    expect(firstOfDayReward('weight', false).rewarded).toBe(true);
    expect(firstOfDayReward('weight', true)).toMatchObject({ rewarded: false, xp: 0 });
  });
});

describe('side quest rewards', () => {
  it(`should reward the first ${SIDE_QUEST_DAILY_REWARD_LIMIT} of a day`, () => {
    expect(nextSideQuestReward(0).rewarded).toBe(true);
    expect(nextSideQuestReward(SIDE_QUEST_DAILY_REWARD_LIMIT - 1).rewarded).toBe(true);
  });

  it('should still log past the limit, with zero deltas rather than a refusal', () => {
    const reward = nextSideQuestReward(SIDE_QUEST_DAILY_REWARD_LIMIT);
    expect(reward).toMatchObject({ rewarded: false, xp: 0, coins: 0, statTicked: false });
  });
});

describe('health threshold offer', () => {
  it('should offer the quest once the threshold is met', () => {
    const offer = deriveThresholdOffer(steps, 8310);
    expect(offer).toMatchObject({ met: true, questTitle: 'Move 8,000 steps', xp: 30 });
  });

  it('should report progress without offering while short of the threshold', () => {
    const offer = deriveThresholdOffer(steps, 4000);
    expect(offer?.met).toBe(false);
    expect(offer?.ratio).toBeCloseTo(0.5);
  });

  it('should offer nothing for a metric no quest reads', () => {
    expect(deriveThresholdOffer(sleep, 8)).toBeNull();
  });

  it('should offer nothing on a blank day', () => {
    expect(deriveThresholdOffer(steps, null)).toBeNull();
  });
});

describe('entry cap advisory', () => {
  it('should stay silent below the advisory threshold', () => {
    const advisory = deriveCapAdvisory('journal', 40);
    expect(advisory.level).toBe('clear');
    expect(advisory.message).toBeNull();
  });

  it(`should advise once ${CAP_ADVISORY_THRESHOLD * 100}% of the allowance is used`, () => {
    const advisory = deriveCapAdvisory('meals', MONTHLY_ENTRY_CAP * CAP_ADVISORY_THRESHOLD);
    expect(advisory.level).toBe('approaching');
    expect(advisory.message).toContain('entries keep saving');
  });

  it('should keep saving past the allowance', () => {
    const advisory = deriveCapAdvisory('expenses', MONTHLY_ENTRY_CAP + 5);
    expect(advisory.level).toBe('reached');
    expect(advisory.blocksSave).toBe(false);
    expect(advisory.message).toContain('Everything still saves');
  });

  it('should never block a save at any level', () => {
    for (const used of [0, 79, 80, 100, 500]) expect(deriveCapAdvisory('sidequests', used).blocksSave).toBe(false);
  });
});

describe('markdown-lite', () => {
  it('should wrap the selection in bold markers', () => {
    expect(applyMarkdownTool('five kilometres', 0, 4, 'bold').text).toBe('**five** kilometres');
  });

  it('should prefix the current line for a quote', () => {
    expect(applyMarkdownTool('one\ntwo', 4, 4, 'quote').text).toBe('one\n> two');
  });

  it('should strip markers from an excerpt', () => {
    expect(journalExcerpt('- **Five kilometres** felt short')).toBe('Five kilometres felt short');
  });
});
