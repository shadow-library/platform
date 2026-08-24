import { beforeEach, describe, expect, it } from 'vitest';

import { type DeltaPage, SyncedFinanceProvider, SyncedHeroProvider, SyncedQuickLogProvider } from '@/lib/sync';

import { createTestEngine, type TestEngine } from './sync-harness';

const TODAY = '2026-08-24';

/** Rows shaped exactly as `apps/shadow-memoir-server`'s delta assembler serializes them — bigints as strings, timestamps as ISO. */
const EXPENSE_ROW = {
  id: '0193c2a0-0000-7000-8000-0000000000aa',
  amountMinor: '1250',
  amountText: '12.50',
  currency: 'EUR',
  fxRate: null,
  homeAmountMinor: null,
  fxRateDate: null,
  categoryId: 'food',
  merchant: 'Kaffebrenneriet',
  note: 'Coffee',
  receiptRef: null,
  lineItems: null,
  occurredOn: TODAY,
  loggedAt: `${TODAY}T08:00:00.000Z`,
  source: 'manual',
  linkedQuestId: null,
  linkedSubscriptionId: null,
  billingCycleDate: null,
  syncSeq: '1',
  createdAt: `${TODAY}T08:00:00.000Z`,
  updatedAt: `${TODAY}T08:00:00.000Z`,
};

const SUBSCRIPTION_ROW = {
  id: '7',
  name: 'Spotify',
  note: null,
  amountMinor: '1099',
  amountText: '10.99',
  currency: 'EUR',
  frequency: 'monthly',
  customIntervalDays: null,
  billingDay: 1,
  nextDueDate: '2026-09-01',
  lastConfirmedDate: '2026-08-01',
  categoryId: 'subs',
  reminderEnabled: true,
  reminderLead: '1_day',
  monthlyEquivalentMinor: '1099',
  active: true,
  syncSeq: '2',
  createdAt: `${TODAY}T08:00:00.000Z`,
  updatedAt: `${TODAY}T08:00:00.000Z`,
};

const CATEGORY_ROWS = [
  { id: '1', key: 'food', label: 'Food', builtin: true, active: true },
  { id: '2', key: 'groceries', label: 'Groceries', builtin: true, active: false },
];

const JOURNAL_ROW = {
  id: '0193c2a0-0000-7000-8000-0000000000bb',
  date: TODAY,
  text: 'Wrote the thing anyway.',
  mood: 3,
  tags: ['proof'],
  rewarded: true,
  loggedAt: `${TODAY}T21:00:00.000Z`,
  syncSeq: '3',
};

const MEAL_ROW = {
  id: '0193c2a0-0000-7000-8000-0000000000cc',
  date: TODAY,
  name: 'Oats',
  calories: 410,
  mealType: 'cooked',
  note: null,
  presetId: '4',
  rewarded: true,
  loggedAt: `${TODAY}T07:20:00.000Z`,
  syncSeq: '4',
};

const PRESET_ROW = { id: '4', name: 'Breakfast oats', calories: 410, mealType: 'cooked', note: null };

const WEIGHT_ROW = { date: TODAY, kg: '78.40', rewarded: true, loggedAt: `${TODAY}T07:05:00.000Z`, syncSeq: '5' };

const SIDE_QUEST_ROW = {
  id: '0193c2a0-0000-7000-8000-0000000000dd',
  date: TODAY,
  name: 'Fixed the bike light',
  statAffinity: 'discipline',
  xpAwarded: 8,
  coinsAwarded: 1,
  statTicked: 1,
  rewarded: true,
  loggedAt: `${TODAY}T18:40:00.000Z`,
  syncSeq: '6',
};

const METRIC_ROWS = [
  { id: '11', name: 'Steps', unit: 'steps', valueType: 'count', direction: 'higher', defaultValue: null, glyph: null, builtin: true, isHealth: true, active: true },
  { id: '12', name: 'Water', unit: 'ml', valueType: 'number', direction: 'higher', defaultValue: null, glyph: null, builtin: true, isHealth: true, active: true },
];

const METRIC_ENTRY_ROW = { id: '31', metricId: '11', date: TODAY, value: '8310', source: 'manual', questLogId: null, syncSeq: '7', createdAt: `${TODAY}T19:02:00.000Z` };

const HEALTH_OFFER_ROW = { questId: '5', questName: 'Move 8,000 steps', metricId: '11', date: TODAY, thresholdValue: 8000, currentValue: 8310, comparison: 'gte' };

const ACCOUNT_ROW = { level: 14, totalXp: '3400', coins: 500, hpToday: 5, hpMax: 5, warmthState: 'warm', displayedTitleId: 'anchor_holder' };

const GRANT_ROWS = {
  achievements_earned: [{ id: '1', achievementId: 'first_quest_completed', earnedAt: '2026-02-02T09:00:00.000Z' }],
  titles_earned: [{ id: '1', titleId: 'anchor_holder', earnedAt: '2026-08-14T09:00:00.000Z' }],
  cosmetic_unlocks: [{ id: '1', cosmeticId: 'badge_bronze', kind: 'badge', source: 'coin', equipped: true }],
};

function fullPage(): DeltaPage {
  return {
    cursor: '99',
    hasMore: false,
    tombstones: [],
    domains: {
      account: [ACCOUNT_ROW],
      expenses: [EXPENSE_ROW],
      expense_categories: CATEGORY_ROWS,
      subscriptions: [SUBSCRIPTION_ROW],
      journal_entries: [JOURNAL_ROW],
      meals: [MEAL_ROW],
      meal_presets: [PRESET_ROW],
      weights: [WEIGHT_ROW],
      side_quests: [SIDE_QUEST_ROW],
      metrics: METRIC_ROWS,
      metric_entries: [METRIC_ENTRY_ROW],
      health_offers: [HEALTH_OFFER_ROW],
      ...GRANT_ROWS,
    },
  };
}

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
}

async function started(page: DeltaPage = fullPage()): Promise<TestEngine> {
  const harness = createTestEngine({ pages: [page], today: TODAY });
  await harness.engine.start();
  return harness;
}

describe('FE-5 domain projection', () => {
  beforeEach(() => setOnline(true));

  it('should ingest every new domain by the field names the server sends', async () => {
    const { engine } = await started();
    const finance = new SyncedFinanceProvider(engine);

    const page = await finance.expenses({ range: 'month' });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ amountMinor: 1250, amountText: '12.50', currency: 'EUR', categoryId: 'food', occurredOnDate: TODAY, merchant: 'Kaffebrenneriet' });

    const subscriptions = await finance.subscriptions();
    expect(subscriptions.items[0]).toMatchObject({ name: 'Spotify', amountMinor: 1099, frequency: 'monthly', reminderLead: '1-day', categoryId: 'tools', billingDay: 1 });

    const categories = await finance.categories();
    expect(categories.items.find(slice => slice.category.id === 'groceries')?.category.archived).toBe(true);
  });

  it('should project every quick-log domain into its view shape', async () => {
    const { engine } = await started();
    const quickLogs = new SyncedQuickLogProvider(engine);

    const journal = await quickLogs.journal();
    expect(journal.today).toMatchObject({ text: 'Wrote the thing anyway.', mood: 3, tags: ['proof'], rewarded: true });
    expect(journal.writingStreakDays).toBe(1);

    const meals = await quickLogs.meals(TODAY);
    expect(meals.meals[0]).toMatchObject({ name: 'Oats', calories: 410, mealType: 'cooked', presetId: '4', sourceLabel: 'Preset' });
    expect(meals.presets[0]).toMatchObject({ id: '4', name: 'Breakfast oats' });

    const weight = await quickLogs.weight();
    expect(weight.today).toMatchObject({ date: TODAY, kg: 78.4 });

    const sideQuests = await quickLogs.sideQuests();
    expect(sideQuests.items[0]).toMatchObject({ name: 'Fixed the bike light', xpAwarded: 8, statTicked: true });
  });

  it('should surface the server-derived threshold offer against the quest it would complete', async () => {
    const { engine } = await started();
    const health = await new SyncedQuickLogProvider(engine).health(TODAY);

    const steps = health.metrics.find(metric => metric.definition.key === 'steps');
    expect(steps?.entry).toMatchObject({ value: 8310, date: TODAY });
    expect(steps?.offer).toMatchObject({ questId: '5', questTitle: 'Move 8,000 steps', thresholdValue: 8000, currentValue: 8310, met: true });
  });

  it('should project the earned grants and the equipped cosmetic onto the hero deck', async () => {
    const { engine } = await started();
    const deck = await new SyncedHeroProvider(engine).getDeck();

    expect(deck.hero.title).toBe('Anchor Holder');
    expect(deck.achievements.find(item => item.id === 'first_quest_completed')?.earnedOn).toBe('2026-02-02T09:00:00.000Z');
    expect(deck.cosmetics.find(item => item.id === 'badge_bronze')?.state).toBe('equipped');
    expect(deck.cosmetics.find(item => item.id === 'badge_silver')?.state).toBe('affordable');
  });
});

describe('FE-5 optimistic apply', () => {
  beforeEach(() => setOnline(true));

  it('should show a created expense before the server has answered and post it as expense.create', async () => {
    const { engine, server } = await started();
    const finance = new SyncedFinanceProvider(engine);

    const result = await finance.dispatchCommand({
      type: 'expense.create',
      draft: { amountText: '4.20', currency: 'EUR', categoryId: 'food', occurredOnDate: TODAY, note: 'Coffee' },
    });

    expect(result.message).toBe('Expense saved.');
    expect((await finance.expenses({ range: 'month' })).items).toHaveLength(2);

    await engine.sync();
    expect(server.batches.at(-1)?.types).toEqual(['expense.create']);
  });

  it('should reward only the first journal entry of a day, as the server does', async () => {
    const { engine } = await started(fullPage());
    const quickLogs = new SyncedQuickLogProvider(engine);

    const second = await quickLogs.dispatchCommand({ type: 'journal.save', draft: { date: TODAY, text: 'A second entry.', mood: 4 } });
    expect(second.reward?.rewarded).toBe(false);

    const fresh = new SyncedQuickLogProvider((await started({ ...fullPage(), domains: { account: [ACCOUNT_ROW] } })).engine);
    const first = await fresh.dispatchCommand({ type: 'journal.save', draft: { date: TODAY, text: 'The first entry.', mood: 4 } });
    expect(first.reward?.rewarded).toBe(true);
    expect(first.reward?.xp).toBe(5);
  });

  it('should hold a same-day weight back until the replacement is confirmed', async () => {
    const { engine, server } = await started();
    const quickLogs = new SyncedQuickLogProvider(engine);

    const held = await quickLogs.dispatchCommand({ type: 'weight.save', date: TODAY, kg: 78.1, confirmedReplacement: false });
    expect(held.needsConfirmation?.kind).toBe('weight-replace');
    expect(server.batches).toHaveLength(0);

    const confirmed = await quickLogs.dispatchCommand({ type: 'weight.save', date: TODAY, kg: 78.1, confirmedReplacement: true });
    expect(confirmed.message).toContain('Replaced 78.4 kg with 78.1 kg');

    await engine.sync();
    expect(server.batches.at(-1)?.types).toEqual(['weight.save']);
  });

  it('should spend the account coins on a purchase and refuse one the balance cannot reach', async () => {
    const { engine, server } = await started();
    const hero = new SyncedHeroProvider(engine);

    const purchase = await hero.dispatchCommand({ type: 'cosmetic.purchase', cosmeticId: 'badge_silver' });
    expect(purchase.status).toBe('applied');
    expect((await hero.getDeck()).cosmetics.find(item => item.id === 'badge_silver')?.state).toBe('equipped');

    await engine.sync();
    expect(server.batches.at(-1)?.types).toEqual(['cosmetic.purchase']);

    const refused = await hero.dispatchCommand({ type: 'cosmetic.purchase', cosmeticId: 'badge_gold_streak' });
    expect(refused.status).toBe('rejected');
  });

  it('should resolve a health metric key to the account catalogue id before queueing it', async () => {
    const { engine, server } = await started();
    const quickLogs = new SyncedQuickLogProvider(engine);

    await quickLogs.dispatchCommand({ type: 'health.save', key: 'water', date: TODAY, value: 1.4 });

    const queued = (await engine.outbox.pending()).at(-1);
    expect(queued?.type).toBe('metric.register');
    expect(queued?.payload).toMatchObject({ metricId: '12', date: TODAY, value: 1.4, source: 'manual' });

    await engine.sync();
    expect(server.batches.at(-1)?.types).toEqual(['metric.register']);
  });

  it('should keep a health save local when the metric catalogue has not been pulled yet', async () => {
    const { engine, server } = await started({ ...fullPage(), domains: { account: [ACCOUNT_ROW] } });
    const quickLogs = new SyncedQuickLogProvider(engine);

    const result = await quickLogs.dispatchCommand({ type: 'health.save', key: 'steps', date: TODAY, value: 8200 });

    expect(result.message).toBe('Saved.');
    expect(server.batches).toHaveLength(0);
  });
});

describe('FE-5 replay convergence', () => {
  beforeEach(() => setOnline(true));

  it('should replay a queued command over a fresh projection exactly once per domain', async () => {
    setOnline(false);
    const harness = createTestEngine({ pages: [fullPage()], today: TODAY });
    await harness.engine.start();

    const finance = new SyncedFinanceProvider(harness.engine);
    const quickLogs = new SyncedQuickLogProvider(harness.engine);
    const hero = new SyncedHeroProvider(harness.engine);

    await finance.dispatchCommand({ type: 'expense.create', draft: { amountText: '4.20', currency: 'EUR', categoryId: 'food', occurredOnDate: TODAY } });
    await quickLogs.dispatchCommand({ type: 'sidequest.log', draft: { date: TODAY, name: 'Tidied the workshop', statAffinity: 'discipline' } });
    await hero.dispatchCommand({ type: 'cosmetic.purchase', cosmeticId: 'accent_ember' });

    setOnline(true);
    await harness.engine.sync();
    await finance.reproject();
    await quickLogs.reproject();
    await hero.reproject();

    expect((await finance.expenses({ range: 'month' })).items).toHaveLength(1);
    expect((await quickLogs.sideQuests()).items).toHaveLength(1);
    expect((await hero.getDeck()).cosmetics.find(item => item.id === 'accent_ember')?.state).toBe('affordable');
    expect(await harness.engine.outbox.size()).toBe(0);
  });

  it('should keep an unacked command applied over the reprojected server rows', async () => {
    const harness = await started();
    const finance = new SyncedFinanceProvider(harness.engine);
    setOnline(false);

    await finance.dispatchCommand({ type: 'expense.create', draft: { amountText: '4.20', currency: 'EUR', categoryId: 'food', occurredOnDate: TODAY } });
    await finance.reproject();

    expect((await finance.expenses({ range: 'month' })).items).toHaveLength(2);
    expect(await harness.engine.outbox.size()).toBe(1);
  });
});
