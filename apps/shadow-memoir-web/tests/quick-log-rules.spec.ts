import { describe, expect, it } from 'vitest';

import {
  applyMarkdownTool,
  CAP_ADVISORY_THRESHOLD,
  capAdvisoryForTier,
  deriveCapAdvisory,
  deriveThresholdOffer,
  firstOfDayReward,
  formatMetricValue,
  type HealthMetricDefinition,
  type HealthMetricEntry,
  journalExcerpt,
  mealCaloriesError,
  type MealPreset,
  metricInputValue,
  MONTHLY_ENTRY_CAP,
  nextSideQuestReward,
  quickLogTiles,
  readMetricEntry,
  sameDayWeight,
  SIDE_QUEST_DAILY_REWARD_LIMIT,
  snapshotPresetToMeal,
  type WeightEntry,
  weightError,
} from '@/lib/data';

const preset: MealPreset = { id: 'preset-oats', name: 'Breakfast oats', calories: 410, mealType: 'cooked', proteinG: 24, carbsG: 58, fatG: 9, usageCount: 84 };

const steps: HealthMetricDefinition = { key: 'steps', name: 'Steps', unit: '', step: 100, precision: 0, threshold: { value: 8000, questTitle: 'Move 8,000 steps', xp: 30 } };

const sleep: HealthMetricDefinition = { key: 'sleep', name: 'Sleep', unit: 'h', step: 0.1, precision: 1, threshold: { value: 7, questTitle: null, xp: 0 } };

const water: HealthMetricDefinition = { key: 'water', name: 'Water', unit: 'l', step: 0.1, precision: 1, threshold: { value: 2000, questTitle: 'Drink 2 litres', xp: 20 } };

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

describe('quick-log entry validation', () => {
  it('should reject negative calories', () => {
    expect(mealCaloriesError(-50)).toBe('Calories are a whole number, zero or more.');
    expect(mealCaloriesError(null)).not.toBeNull();
    expect(mealCaloriesError(0)).toBeNull();
    expect(mealCaloriesError(720)).toBeNull();
  });

  it('should reject weight outside the allowed range', () => {
    expect(weightError(10)).toBe('Weight is between 30 and 250 kg.');
    expect(weightError(300)).toBe('Weight is between 30 and 250 kg.');
    expect(weightError(null)).not.toBeNull();
    expect(weightError(30)).toBeNull();
    expect(weightError(78.5)).toBeNull();
  });

  it('should reject a blank, non-numeric or negative metric entry', () => {
    expect(readMetricEntry('', steps)).toEqual({ kind: 'invalid', message: 'Type a value to save — a blank day stays blank.' });
    expect(readMetricEntry('abc', steps)).toEqual({ kind: 'invalid', message: 'Use digits only, like 7.5.' });
    expect(readMetricEntry('-500', steps)).toEqual({ kind: 'invalid', message: 'Steps can’t be negative.' });
    expect(readMetricEntry('0', steps)).toEqual({ kind: 'valid', storedValue: 0 });
  });

  it('should round-trip water between the litres shown and the millilitres stored', () => {
    expect(metricInputValue(1400, water)).toBe('1.4');
    expect(readMetricEntry('1.6', water)).toEqual({ kind: 'valid', storedValue: 1600 });
    expect(metricInputValue(1600, water)).toBe('1.6');
  });

  it('should prefill a metric with the precision its card shows', () => {
    expect(metricInputValue(7.25, sleep)).toBe('7.3');
    expect(metricInputValue(8310, steps)).toBe('8310');
  });

  it('should prefill water with every stored millilitre so saving it again changes nothing', () => {
    expect(metricInputValue(1650, water)).toBe('1.65');
    expect(metricInputValue(1655, water)).toBe('1.655');
    expect(metricInputValue(250, water)).toBe('0.25');
    expect(metricInputValue(2000, water)).toBe('2.0');
  });
});

describe('formatMetricValue', () => {
  it('should show water in litres to two decimals, rounding halves the same way up and down', () => {
    expect(formatMetricValue(1650, water)).toBe('1.65 l');
    expect(formatMetricValue(1750, water)).toBe('1.75 l');
    expect(formatMetricValue(1655, water)).toBe('1.66 l');
    expect(formatMetricValue(1645, water)).toBe('1.65 l');
    expect(formatMetricValue(1400, water)).toBe('1.4 l');
    expect(formatMetricValue(2000, water)).toBe('2.0 l');
  });

  it('should show water below a litre in millilitres', () => {
    expect(formatMetricValue(250, water)).toBe('250 ml');
    expect(formatMetricValue(0, water)).toBe('0 ml');
    expect(formatMetricValue(999.6, water)).toBe('1.0 l');
  });

  it('should round other metrics half up by their decimal value rather than their binary one', () => {
    expect(formatMetricValue(7.05, sleep)).toBe('7.1 h');
    expect(formatMetricValue(7.25, sleep)).toBe('7.3 h');
    expect(formatMetricValue(8000, steps)).toBe('8,000');
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
    const offer = deriveThresholdOffer(steps, '2026-08-22', 8310);
    expect(offer).toMatchObject({ met: true, questTitle: 'Move 8,000 steps', xp: 30 });
  });

  it('should report progress without offering while short of the threshold', () => {
    const offer = deriveThresholdOffer(steps, '2026-08-22', 4000);
    expect(offer?.met).toBe(false);
    expect(offer?.ratio).toBeCloseTo(0.5);
  });

  it('should offer nothing for a metric no quest reads', () => {
    expect(deriveThresholdOffer(sleep, '2026-08-22', 8)).toBeNull();
  });

  it('should offer nothing on a blank day', () => {
    expect(deriveThresholdOffer(steps, '2026-08-22', null)).toBeNull();
  });
});

describe('Today quick-log tiles', () => {
  it('should read the water tile in litres from a millilitre entry', () => {
    const water: HealthMetricEntry = { key: 'water', date: '2026-08-24', value: 1400, loggedAt: '2026-08-24T17:30:00.000Z', replacedValue: null, source: 'manual' };
    const tiles = quickLogTiles({ date: '2026-08-24', currency: 'EUR', expenses: [], meals: [], metrics: [water], weights: [], journal: [] });

    expect(tiles.find(tile => tile.id === 'water')?.value).toBe('1.4 l');
  });

  it('should read a water tile under a litre in millilitres and keep a 1.65 l day exact', () => {
    const entry = (value: number): HealthMetricEntry => ({ key: 'water', date: '2026-08-24', value, loggedAt: '2026-08-24T17:30:00.000Z', replacedValue: null, source: 'manual' });
    const tileFor = (value: number): string | undefined =>
      quickLogTiles({ date: '2026-08-24', currency: 'EUR', expenses: [], meals: [], metrics: [entry(value)], weights: [], journal: [] }).find(tile => tile.id === 'water')?.value;

    expect(tileFor(250)).toBe('250 ml');
    expect(tileFor(1650)).toBe('1.65 l');
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

  it('should describe the cap at exactly the limit', () => {
    const atLimit = deriveCapAdvisory('sidequests', MONTHLY_ENTRY_CAP);
    expect(atLimit.message).toContain(`logged ${MONTHLY_ENTRY_CAP} side quests this month and reached the free monthly allowance of ${MONTHLY_ENTRY_CAP}`);
    expect(atLimit.message).not.toContain('past');
    expect(deriveCapAdvisory('sidequests', MONTHLY_ENTRY_CAP + 1).message).toContain(`past the free monthly allowance of ${MONTHLY_ENTRY_CAP}`);
  });

  it('should not advise a paid owner about the free allowance', () => {
    const advisory = deriveCapAdvisory('meals', MONTHLY_ENTRY_CAP);
    expect(capAdvisoryForTier(advisory, 'paid')).toBeUndefined();
    expect(capAdvisoryForTier(advisory, 'free')).toBe(advisory);
  });

  it('should hold the advisory back while the plan is still unknown', () => {
    expect(capAdvisoryForTier(deriveCapAdvisory('meals', MONTHLY_ENTRY_CAP), 'unknown')).toBeUndefined();
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
