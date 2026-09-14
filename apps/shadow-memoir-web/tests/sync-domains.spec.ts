import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatShortDate } from '@/lib/data';
import { type DeltaPage, SyncedAccountProvider, SyncedDataProvider, SyncedFinanceProvider, SyncedHeroProvider, SyncedQuickLogProvider, SyncedReflectProvider } from '@/lib/sync';

import { withTimeZone } from './setup';
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
  { id: '1', key: 'food', label: 'Food', builtin: true, active: true, archivedAt: null },
  { id: '2', key: 'groceries', label: 'Groceries', builtin: true, active: false, archivedAt: `${TODAY}T00:00:00.000Z` },
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

/** Money periods read the live clock, so the finance reads here run on the fixture day. */
function onTheFixtureDay(): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
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
  beforeEach(() => {
    setOnline(true);
    onTheFixtureDay();
  });
  afterEach(() => vi.useRealTimers());

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

  it('should describe a metric entry’s logged time in the local zone, not raw UTC', async () =>
    withTimeZone('Europe/Oslo', async () => {
      const { engine } = await started();
      const health = await new SyncedQuickLogProvider(engine).health(TODAY);

      const steps = health.metrics.find(metric => metric.definition.key === 'steps');
      expect(steps?.meta).toBe('Logged 21:02');
      expect(steps?.meta).not.toContain('T19:02');
    }));

  it('should project the earned grants and the equipped cosmetic onto the hero deck', async () => {
    const { engine } = await started();
    const deck = await new SyncedHeroProvider(engine, new SyncedAccountProvider(engine)).getDeck();

    expect(deck.hero.title).toBe('Anchor Holder');
    expect(deck.achievements.find(item => item.id === 'first_quest_completed')?.earnedOn).toBe('2026-02-02T09:00:00.000Z');
    expect(deck.cosmetics.find(item => item.id === 'badge_bronze')?.state).toBe('equipped');
    expect(deck.cosmetics.find(item => item.id === 'badge_silver')?.state).toBe('affordable');
  });
});

describe('FE-5 optimistic apply', () => {
  beforeEach(() => {
    setOnline(true);
    onTheFixtureDay();
  });
  afterEach(() => vi.useRealTimers());

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
    expect(second).toMatchObject({ reward: { rewarded: false } });

    const fresh = new SyncedQuickLogProvider((await started({ ...fullPage(), domains: { account: [ACCOUNT_ROW] } })).engine);
    const first = await fresh.dispatchCommand({ type: 'journal.save', draft: { date: TODAY, text: 'The first entry.', mood: 4 } });
    expect(first).toMatchObject({ reward: { rewarded: true, xp: 5 } });
  });

  it('should hold a same-day weight back until the replacement is confirmed', async () => {
    const { engine, server } = await started();
    const quickLogs = new SyncedQuickLogProvider(engine);

    const held = await quickLogs.dispatchCommand({ type: 'weight.save', date: TODAY, kg: 78.1, confirmedReplacement: false });
    expect(held).toMatchObject({ needsConfirmation: { kind: 'weight-replace' } });
    expect(server.batches).toHaveLength(0);

    const confirmed = await quickLogs.dispatchCommand({ type: 'weight.save', date: TODAY, kg: 78.1, confirmedReplacement: true });
    expect(confirmed.message).toContain('Replaced 78.4 kg with 78.1 kg');

    await engine.sync();
    expect(server.batches.at(-1)?.types).toEqual(['weight.save']);
  });

  it('should spend the account coins on a purchase and refuse one the balance cannot reach', async () => {
    const { engine, server } = await started();
    const hero = new SyncedHeroProvider(engine, new SyncedAccountProvider(engine));

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

  it('should refuse a health save before applying it when the metric catalogue has not been pulled yet', async () => {
    const { engine, server } = await started({ ...fullPage(), domains: { account: [ACCOUNT_ROW] } });
    const quickLogs = new SyncedQuickLogProvider(engine);

    const result = await quickLogs.dispatchCommand({ type: 'health.save', key: 'steps', date: TODAY, value: 8200 });

    expect(result).toEqual({ status: 'rejected', message: 'Health metrics aren’t set up for this account yet, so this can’t be saved.' });
    expect((await quickLogs.health(TODAY)).metrics.find(metric => metric.definition.key === 'steps')?.entry).toBeNull();
    expect(await engine.outbox.pending()).toHaveLength(0);
    await engine.sync();
    expect(server.batches).toHaveLength(0);
  });

  it('should undo the optimistic apply when the engine cannot address a quick-log command', async () => {
    const { engine } = await started({ ...fullPage(), domains: { account: [ACCOUNT_ROW] } });
    const quickLogs = new SyncedQuickLogProvider(engine);
    vi.spyOn(engine, 'enqueue').mockResolvedValue({ status: 'unaddressed' });

    const result = await quickLogs.dispatchCommand({ type: 'sidequest.log', draft: { date: TODAY, name: 'Fixed the bike', statAffinity: 'body' } });

    expect(result).toMatchObject({ delivery: { status: 'unaddressed' } });
    expect((await quickLogs.sideQuests()).items).toEqual([]);
    expect(await engine.outbox.pending()).toEqual([]);
    vi.restoreAllMocks();
  });
});

describe('FE-5 replay convergence', () => {
  beforeEach(() => {
    setOnline(true);
    onTheFixtureDay();
  });
  afterEach(() => vi.useRealTimers());

  it('should replay a queued command over a fresh projection exactly once per domain', async () => {
    setOnline(false);
    const harness = createTestEngine({ pages: [fullPage()], today: TODAY });
    await harness.engine.start();

    const finance = new SyncedFinanceProvider(harness.engine);
    const quickLogs = new SyncedQuickLogProvider(harness.engine);
    const hero = new SyncedHeroProvider(harness.engine, new SyncedAccountProvider(harness.engine));

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

const QUEST_ROW = { id: '5', name: 'Move 8,000 steps', statAffinity: 'body', strictness: 'routine', durationMin: 40, active: true, recurrence: {}, syncSeq: '8' };

const LAST_WEEK = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20'];

const QUEST_LOG_ROWS = [
  ...LAST_WEEK.map((date, index) => ({
    id: String(100 + index),
    questId: '5',
    date,
    state: index === 3 ? 'missed' : 'completed',
    xpAwarded: index === 3 ? 0 : 30,
    coinsAwarded: 0,
    statAffinity: 'body',
    strictness: 'routine',
    reasonTag: index === 3 ? 'work_emergency' : null,
    performedAt: `${date}T19:02:00.000Z`,
    syncSeq: '9',
  })),
  {
    id: '200',
    questId: '5',
    date: TODAY,
    state: 'partial',
    xpAwarded: 15,
    coinsAwarded: 0,
    statAffinity: 'body',
    strictness: 'routine',
    reasonTag: 'too_tired',
    performedAt: `${TODAY}T19:02:00.000Z`,
    syncSeq: '10',
  },
];

const QUEST_STREAK_ROW = { questId: '5', currentRunDays: 3, bestRunDays: 22, shieldsAvailable: 1, syncSeq: '11' };

function reflectPage(): DeltaPage {
  const page = fullPage();
  page.domains['quests'] = [QUEST_ROW];
  page.domains['quest_logs'] = QUEST_LOG_ROWS;
  page.domains['quest_streaks'] = [QUEST_STREAK_ROW];
  return page;
}

describe('FE-7 reflection derivation', () => {
  beforeEach(() => setOnline(true));

  it('should build the history feed out of the mirrored rows rather than a fixture', async () => {
    const { engine } = await started(reflectPage());
    const history = await new SyncedReflectProvider(engine).getHistory('all', '');

    const today = history.groups.find(group => group.date === TODAY);
    expect(today?.rows.map(row => row.text)).toContain('Move 8,000 steps · partial · too tired');
    expect(today?.rows.map(row => row.text)).toContain('Food — Kaffebrenneriet');
    expect(history.totals[0]).toBe('5 quest records · 5 outcomes · 4 kept');
  });

  it('should filter the derived feed and search it without reaching the network', async () => {
    const { engine, server } = await started(reflectPage());
    const reflect = new SyncedReflectProvider(engine);
    const before = server.deltaRequests.length;

    expect((await reflect.getHistory('expense', '')).countLabel).toBe('1 matching record');
    expect((await reflect.getHistory('all', 'work emergency')).groups.flatMap(group => group.rows)).toHaveLength(1);
    expect(server.deltaRequests).toHaveLength(before);
  });

  it('should compute the insights from the same rows', async () => {
    const { engine } = await started(reflectPage());
    const insights = await new SyncedReflectProvider(engine).getInsights('30');

    expect(insights.adherenceByQuest).toEqual([{ id: '5', label: 'Move 8,000 steps', value: 70, caption: '70%', ariaLabel: 'Move 8,000 steps: 70% kept', hasEntries: true }]);
    expect(insights.reasons.map(bar => bar.id)).toEqual(['work_emergency', 'too_tired']);
    expect(insights.kpis.find(kpi => kpi.id === 'streak')?.value).toBe(22);
    expect(insights.kpis.find(kpi => kpi.id === 'spend')?.value).toBe(12.5);
  });

  it('should read the week that closed into the review', async () => {
    const { engine } = await started(reflectPage());
    const review = await new SyncedReflectProvider(engine).getReview();

    expect(review.quests).toEqual([{ id: '5', title: 'Move 8,000 steps', result: '3 of 4', days: ['kept', 'kept', 'kept', 'missed', 'none', 'none', 'none'] }]);
    expect(review.keptPattern).toContain('work emergency');
  });

  it('should keep the review answers local, since the server has no model to write them to', async () => {
    const { engine, server } = await started(reflectPage());
    const reflect = new SyncedReflectProvider(engine);

    await reflect.dispatchCommand({ type: 'review.answer', promptId: 'better', answer: 'The mornings held.' });
    await reflect.dispatchCommand({ type: 'review.complete' });

    const review = await reflect.getReview();
    expect(review.prompts.find(prompt => prompt.id === 'better')?.answer).toBe('The mornings held.');
    expect(review.completion).not.toBeNull();
    expect(await engine.outbox.size()).toBe(0);
    expect(server.batches).toHaveLength(0);

    expect((await new SyncedReflectProvider(engine).getReview()).completion).not.toBeNull();
  });
});

const ADHERENCE_QUEST_ROW = { id: '26', name: 'Plunge pool', statAffinity: 'body', strictness: 'routine', durationMin: 5, active: true, recurrence: {}, syncSeq: '80' };

const ADHERENCE_LOG_ROWS = [
  { id: '700', questId: '26', date: '2026-06-01', state: 'completed', xpAwarded: 999, coinsAwarded: 0, statAffinity: 'body', strictness: 'routine', syncSeq: '81' },
  { id: '701', questId: '26', date: '2026-08-17', state: 'completed', xpAwarded: 10, coinsAwarded: 1, statAffinity: 'body', strictness: 'routine', syncSeq: '82' },
  { id: '702', questId: '26', date: '2026-08-18', state: 'completed', xpAwarded: 10, coinsAwarded: 1, statAffinity: 'body', strictness: 'routine', syncSeq: '83' },
  { id: '703', questId: '26', date: '2026-08-19', state: 'missed', xpAwarded: 0, coinsAwarded: 0, statAffinity: 'body', strictness: 'routine', syncSeq: '84' },
  { id: '704', questId: '26', date: '2026-08-20', state: 'partial', xpAwarded: 5, coinsAwarded: 0, statAffinity: 'body', strictness: 'routine', syncSeq: '85' },
];

function adherencePage(): DeltaPage {
  const page = fullPage();
  page.domains['quests'] = [ADHERENCE_QUEST_ROW];
  page.domains['quest_logs'] = ADHERENCE_LOG_ROWS;
  return page;
}

const NO_STREAK_QUEST_ROW = { id: '27', name: 'Cold shower', statAffinity: 'body', strictness: 'recovery', durationMin: 5, active: true, recurrence: {}, syncSeq: '90' };

const NO_STREAK_LOG_ROWS = [
  { id: '800', questId: '27', date: '2026-08-20', state: 'completed', xpAwarded: 8, coinsAwarded: 1, statAffinity: 'body', strictness: 'recovery', syncSeq: '91' },
  { id: '801', questId: '27', date: '2026-08-21', state: 'completed', xpAwarded: 8, coinsAwarded: 1, statAffinity: 'body', strictness: 'recovery', syncSeq: '92' },
  { id: '802', questId: '27', date: '2026-08-22', state: 'missed', xpAwarded: 0, coinsAwarded: 0, statAffinity: 'body', strictness: 'recovery', syncSeq: '93' },
];

function noStreakPage(): DeltaPage {
  const page = fullPage();
  page.domains['quests'] = [NO_STREAK_QUEST_ROW];
  page.domains['quest_logs'] = NO_STREAK_LOG_ROWS;
  return page;
}

const RESCHEDULE_QUEST_ROW = {
  id: '21',
  name: 'Strength session',
  statAffinity: 'body',
  strictness: 'anchor',
  startTimeMin: 1080,
  durationMin: 50,
  active: true,
  recurrence: {},
  syncSeq: '40',
};

function rescheduleEvent(id: string, date: string): Record<string, unknown> {
  return { id, accountId: '1', questId: '21', date, fromMin: 1080, toMin: 1140, reasonTag: null, reasonNote: null, createdAt: `${date}T06:00:00.000Z`, syncSeq: id };
}

function rescheduleLog(id: string, date: string, state: string): Record<string, unknown> {
  return {
    id,
    questId: '21',
    date,
    state,
    xpAwarded: state === 'completed' ? 12 : 0,
    coinsAwarded: 0,
    statAffinity: 'body',
    strictness: 'anchor',
    rescheduledToMin: null,
    syncSeq: id,
  };
}

const RESCHEDULE_STREAK_ROW = { questId: '21', currentRunDays: 0, bestRunDays: 0, shieldsAvailable: 0, syncSeq: '39' };

function reschedulePage(events: Record<string, unknown>[], logs: Record<string, unknown>[] = []): DeltaPage {
  const page = fullPage();
  page.domains['quests'] = [RESCHEDULE_QUEST_ROW];
  page.domains['quest_logs'] = logs;
  page.domains['quest_streaks'] = [RESCHEDULE_STREAK_ROW];
  page.domains['reschedule_events'] = events;
  return page;
}

const LOCK_QUEST_ROW = { id: '28', name: 'Journal check-in', statAffinity: 'mind', strictness: 'anchor', durationMin: 10, active: true, recurrence: {}, syncSeq: '100' };
const LOCK_QUEST_ROW_TODAY = { id: '29', name: 'Evening review', statAffinity: 'mind', strictness: 'anchor', durationMin: 10, active: true, recurrence: {}, syncSeq: '101' };

function pastLockPage(): DeltaPage {
  const page = fullPage();
  page.domains['quests'] = [LOCK_QUEST_ROW, LOCK_QUEST_ROW_TODAY];
  page.domains['daily_states'] = [
    { date: '2026-08-17', committedAt: '2026-08-16T20:00:00.000Z', lockedQuestIds: ['28'] },
    { date: TODAY, committedAt: '2026-08-23T20:00:00.000Z', lockedQuestIds: ['29'] },
  ];
  return page;
}

const CARRIED_QUEST_ROW = { id: '30', name: 'Stretch break', statAffinity: 'body', strictness: 'goal', durationMin: 5, active: true, recurrence: {}, syncSeq: '110' };

const CARRIED_LOG_ROWS = [
  {
    id: '900',
    questId: '30',
    date: '2026-08-18',
    state: 'postponed',
    xpAwarded: 0,
    coinsAwarded: 0,
    statAffinity: 'body',
    strictness: 'goal',
    postponedToDate: '2026-08-19',
    syncSeq: '111',
  },
  {
    id: '901',
    questId: '30',
    date: '2026-08-20',
    state: 'rescheduled',
    xpAwarded: 0,
    coinsAwarded: 0,
    statAffinity: 'body',
    strictness: 'goal',
    rescheduledToMin: 900,
    syncSeq: '112',
  },
  {
    id: '902',
    questId: '30',
    date: '2026-08-22',
    state: 'rescheduled',
    xpAwarded: 0,
    coinsAwarded: 0,
    statAffinity: 'body',
    strictness: 'goal',
    rescheduledToMin: 1000,
    syncSeq: '113',
  },
];

function carriedOnlyPage(): DeltaPage {
  const page = fullPage();
  page.domains['quests'] = [CARRIED_QUEST_ROW];
  page.domains['quest_logs'] = CARRIED_LOG_ROWS;
  return page;
}

const MANY_ACTIVITY_QUESTS = Array.from({ length: 9 }, (_, index) => ({
  id: `q-many-${index + 1}`,
  name: `Quest ${index + 1}`,
  statAffinity: 'discipline',
  strictness: 'routine',
  durationMin: 5,
  active: true,
  recurrence: {},
  syncSeq: String(120 + index),
}));

const MANY_ACTIVITY_LOG_ROWS = MANY_ACTIVITY_QUESTS.map((quest, index) => ({
  id: `q-many-log-${index + 1}`,
  questId: quest.id,
  date: TODAY,
  state: 'completed',
  xpAwarded: 0,
  coinsAwarded: 0,
  statAffinity: 'discipline',
  strictness: 'routine',
  performedAt: `${TODAY}T${String(6 + index).padStart(2, '0')}:00:00.000Z`,
  syncSeq: String(130 + index),
}));

function manyActivityPage(): DeltaPage {
  const page = fullPage();
  page.domains['quests'] = MANY_ACTIVITY_QUESTS;
  page.domains['quest_logs'] = MANY_ACTIVITY_LOG_ROWS;
  return page;
}

const SHIELD_QUEST_ROW = { id: '22', name: 'Cold plunge', statAffinity: 'body', strictness: 'anchor', durationMin: 10, active: true, recurrence: {}, syncSeq: '50' };
const SHIELD_LOG_ROW = {
  id: '500',
  questId: '22',
  date: TODAY,
  state: 'missed',
  xpAwarded: 0,
  coinsAwarded: 0,
  statAffinity: 'body',
  strictness: 'anchor',
  shielded: true,
  syncSeq: '51',
};
const SHIELD_STREAK_ROW = { questId: '22', currentRunDays: 5, bestRunDays: 5, shieldsAvailable: 1, syncSeq: '52' };

function shieldPage(): DeltaPage {
  const page = fullPage();
  page.domains['quests'] = [SHIELD_QUEST_ROW];
  page.domains['quest_logs'] = [SHIELD_LOG_ROW];
  page.domains['quest_streaks'] = [SHIELD_STREAK_ROW];
  return page;
}

const ACTIVITY_QUEST_A = { id: '23', name: 'Morning pages', statAffinity: 'mind', strictness: 'routine', durationMin: 15, active: true, recurrence: {}, syncSeq: '60' };
const ACTIVITY_QUEST_B = { id: '24', name: 'Evening walk', statAffinity: 'body', strictness: 'routine', durationMin: 20, active: true, recurrence: {}, syncSeq: '61' };
const ACTIVITY_QUEST_C = { id: '25', name: 'Stretch', statAffinity: 'body', strictness: 'goal', durationMin: 10, active: true, recurrence: {}, syncSeq: '62' };

const ACTIVITY_LOG_ROWS = [
  {
    id: '600',
    questId: '23',
    date: TODAY,
    state: 'completed',
    xpAwarded: 10,
    coinsAwarded: 1,
    statAffinity: 'mind',
    strictness: 'routine',
    performedAt: `${TODAY}T07:00:00.000Z`,
    syncSeq: '63',
  },
  {
    id: '601',
    questId: '24',
    date: TODAY,
    state: 'skipped',
    xpAwarded: 0,
    coinsAwarded: 0,
    statAffinity: 'body',
    strictness: 'routine',
    reasonTag: 'forgot',
    performedAt: null,
    updatedAt: `${TODAY}T18:30:00.000Z`,
    syncSeq: '64',
  },
  {
    id: '602',
    questId: '24',
    date: '2026-08-23',
    state: 'completed',
    xpAwarded: 10,
    coinsAwarded: 1,
    statAffinity: 'body',
    strictness: 'routine',
    performedAt: '2026-08-23T09:00:00.000Z',
    syncSeq: '65',
  },
  { id: '603', questId: '25', date: TODAY, state: 'missed', xpAwarded: 0, coinsAwarded: 0, statAffinity: 'body', strictness: 'goal', syncSeq: '66' },
];

function activityPage(): DeltaPage {
  const page = fullPage();
  page.domains['quests'] = [ACTIVITY_QUEST_A, ACTIVITY_QUEST_B, ACTIVITY_QUEST_C];
  page.domains['quest_logs'] = ACTIVITY_LOG_ROWS;
  return page;
}

describe('FE-8 quest statistics', () => {
  beforeEach(() => setOnline(true));

  it('should compute 30-day adherence from quest logs', async () => {
    const { engine } = await started(adherencePage());
    const detail = await new SyncedDataProvider(engine).getQuest('26');

    expect(detail.progress.adherence30d).toBeCloseTo(0.625);
  });

  it('should sum xp earned per quest', async () => {
    const { engine } = await started(adherencePage());
    const detail = await new SyncedDataProvider(engine).getQuest('26');

    expect(detail.progress.xpEarned).toBe(1024);
  });

  it('should compute progress for a quest with logs and no streak row', async () => {
    const { engine } = await started(noStreakPage());
    const detail = await new SyncedDataProvider(engine).getQuest('27');

    expect(detail.progress.currentStreakDays).toBe(0);
    expect(detail.progress.xpEarned).toBe(16);
    expect(detail.progress.adherence30d).toBeCloseTo(2 / 3);
  });

  it('should keep counting a reschedule after the occurrence is completed', async () => {
    const { engine } = await started(
      reschedulePage([rescheduleEvent('41', '2026-08-19'), rescheduleEvent('42', TODAY)], [rescheduleLog('50', '2026-08-19', 'completed'), rescheduleLog('51', TODAY, 'late')]),
    );
    const detail = await new SyncedDataProvider(engine).getQuest('21');

    expect(detail.progress.reschedulesUsed).toBe(2);
  });

  it('should count reschedules of future occurrences in the window', async () => {
    const events = [rescheduleEvent('41', '2026-08-10'), rescheduleEvent('42', '2026-08-18'), rescheduleEvent('43', '2026-08-26'), rescheduleEvent('44', '2026-09-20')];
    const { engine } = await started(reschedulePage(events));
    const detail = await new SyncedDataProvider(engine).getQuest('21');

    expect(detail.progress.reschedulesUsed).toBe(3);
    expect(detail.progress.rescheduleCap).toBe(2);
  });

  it('should anchor the cap confirmation on the rescheduled occurrence', async () => {
    const { engine } = await started(reschedulePage([rescheduleEvent('41', '2026-08-19'), rescheduleEvent('42', '2026-08-20')]));
    const provider = new SyncedDataProvider(engine);

    const capped = await provider.dispatchCommand({ type: 'quest.reschedule', occurrenceId: '21:2026-08-25', toMin: 1140 });
    expect(capped).toMatchObject({ status: 'needs-confirmation', kind: 'reschedule-cap' });
    expect(capped.status === 'needs-confirmation' && capped.body).toContain(formatShortDate('2026-08-26'));

    const clear = await provider.dispatchCommand({ type: 'quest.reschedule', occurrenceId: '21:2026-08-26', toMin: 1140 });
    expect(clear.status).toBe('applied');
    expect((await provider.getQuest('21')).progress.reschedulesUsed).toBe(3);
  });

  it('should refuse to move the same occurrence twice', async () => {
    const { engine } = await started(reschedulePage([rescheduleEvent('41', TODAY)], [rescheduleLog('50', TODAY, 'rescheduled')]));
    const provider = new SyncedDataProvider(engine);

    const repeated = await provider.dispatchCommand({ type: 'quest.reschedule', occurrenceId: `21:${TODAY}`, toMin: 1200 });

    expect(repeated).toMatchObject({ status: 'rejected', message: 'This occurrence has already been moved.' });
    expect((await provider.getQuest('21')).progress.reschedulesUsed).toBe(1);
    expect(await engine.outbox.size()).toBe(0);
  });

  it('should count queued reschedules toward the cap confirmation', async () => {
    const { engine } = await started(reschedulePage([]));
    const provider = new SyncedDataProvider(engine);
    setOnline(false);

    expect((await provider.dispatchCommand({ type: 'quest.reschedule', occurrenceId: `21:${TODAY}`, toMin: 1140 })).status).toBe('applied');
    expect((await provider.dispatchCommand({ type: 'quest.reschedule', occurrenceId: '21:2026-08-25', toMin: 1140 })).status).toBe('applied');
    await provider.reproject();

    expect((await provider.getQuest('21')).progress.reschedulesUsed).toBe(2);
    expect(await provider.dispatchCommand({ type: 'quest.reschedule', occurrenceId: '21:2026-08-26', toMin: 1140 })).toMatchObject({
      status: 'needs-confirmation',
      kind: 'reschedule-cap',
    });
    expect(await engine.outbox.size()).toBe(2);
  });

  it('should mark shielded logs', async () => {
    const { engine } = await started(shieldPage());
    const plan = await new SyncedDataProvider(engine).getPlan({ scope: 'week', anchor: TODAY });

    const item = plan.days.find(day => day.date === TODAY)?.items.find(entry => entry.questId === '22');
    expect(item?.shielded).toBe(true);
    expect(item?.meta).toContain('missed');
  });

  it('should list recent activity newest first', async () => {
    const { engine } = await started(activityPage());
    const day = await new SyncedDataProvider(engine).getDay(TODAY);

    expect(day.activity.map(entry => entry.text)).toEqual(['Evening walk skipped', 'Morning pages completed · +10 XP']);
  });

  it('should not badge a quest locked on a past day only as locked today', async () => {
    const { engine } = await started(pastLockPage());
    const provider = new SyncedDataProvider(engine);

    expect((await provider.getQuest('28')).scheduleLocked).toBe(false);
    expect((await provider.getQuest('29')).scheduleLocked).toBe(true);
  });

  it('should not report adherence when only postponed or rescheduled logs are in the window', async () => {
    const { engine } = await started(carriedOnlyPage());
    const detail = await new SyncedDataProvider(engine).getQuest('30');

    expect(detail.progress.adherence30d).toBeNull();
  });

  it('should keep only the eight latest activity entries', async () => {
    const { engine } = await started(manyActivityPage());
    const day = await new SyncedDataProvider(engine).getDay(TODAY);

    expect(day.activity).toHaveLength(8);
    expect(day.activity[0]?.text).toBe('Quest 9 completed');
    expect(day.activity.at(-1)?.text).toBe('Quest 2 completed');
  });
});
