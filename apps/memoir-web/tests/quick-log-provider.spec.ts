import { describe, expect, it } from 'bun:test';

import { type DeltaPage, type KeyValueBacking, SyncedQuickLogProvider } from '@/lib/sync';

import { withTimeZone } from './setup';
import { createSyncedTestData, createTestEngine, sharedBacking, sharedUnload } from './sync-harness';

const LOG_TODAY = '2026-08-22';
const JOURNAL_TODAY = '2026-08-22';

function deltaPage(domains: DeltaPage['domains']): DeltaPage {
  return { cursor: '1', hasMore: false, tombstones: [], domains };
}

describe('synced quick-log provider', () => {
  it('should format the Today expense tile in the account’s home currency', async () => {
    const domains: DeltaPage['domains'] = {
      account: [{ defaultCurrency: 'NOK', enabledCurrencies: ['NOK'] }],
      expenses: [
        { id: 'e1', amountMinor: 12_500, currency: 'NOK', homeAmountMinor: null, categoryId: 'food', occurredOn: LOG_TODAY, loggedAt: `${LOG_TODAY}T10:00:00.000Z`, syncSeq: '1' },
      ],
    };
    const { engine } = createTestEngine({ today: LOG_TODAY, pages: [deltaPage(domains)] });
    await engine.start();

    const tiles = await createSyncedTestData(engine).quickLogs.tiles(LOG_TODAY);
    expect(tiles.find(tile => tile.id === 'expense')?.value).toBe(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'NOK' }).format(125));
  });

  it('should surface an earlier year’s entry on this day and describe the month’s mood', async () => {
    const entry = (id: string, date: string, mood: number | null): Record<string, unknown> => ({
      id,
      date,
      text: `Written on ${date}`,
      mood,
      loggedAt: `${date}T21:00:00.000Z`,
      rewarded: true,
    });
    const journal = [entry('j1', '2025-08-22', 2), entry('j2', LOG_TODAY, 4), entry('j3', '2026-08-20', 4)];
    const { engine } = createTestEngine({ today: LOG_TODAY, pages: [deltaPage({ journal_entries: journal })] });
    await engine.start();
    const quickLogs = new SyncedQuickLogProvider(engine);
    await quickLogs.reproject();

    const view = await quickLogs.journal();
    expect(view.onThisDay).toEqual({ year: 2025, excerpt: 'Written on 2025-08-22' });
    expect(view.moodNote).toBe('Mostly Good across 2 days with a mood.');
  });

  it('should keep a newer unload backup written while another tab’s draft save is running', async () => {
    const backing = sharedBacking();
    const unload = sharedUnload();
    let release: () => void = () => undefined;
    const held = new Promise<void>(resolve => (release = resolve));
    let holding = false;
    const slowBacking: KeyValueBacking = { ...backing, put: (key, value) => (holding ? held.then(() => backing.put(key, value)) : backing.put(key, value)) };
    const slowTab = createTestEngine({ backing: slowBacking, unload, accountId: 'owner-1', today: JOURNAL_TODAY });
    const closingTab = createTestEngine({ backing, unload, accountId: 'owner-1', today: JOURNAL_TODAY });
    slowTab.store.open();
    closingTab.store.open();
    const slow = new SyncedQuickLogProvider(slowTab.engine);
    const closing = new SyncedQuickLogProvider(closingTab.engine);
    await slow.readJournalDraft();
    await closing.readJournalDraft();

    holding = true;
    const saving = slow.saveJournalDraft('Older text', null);
    await Promise.resolve();
    closing.backupJournalDraft('Last words before closing', null);
    release();
    await saving;

    const reopenedTab = createTestEngine({ backing, unload, accountId: 'owner-1', today: JOURNAL_TODAY });
    reopenedTab.store.open();
    const reopened = new SyncedQuickLogProvider(reopenedTab.engine);
    expect(await reopened.readJournalDraft()).toMatchObject({ text: 'Last words before closing' });
    expect(unload.keys()).toEqual([]);
  });

  it('should keep an unrelated journal draft when another journal line is saved', async () => {
    const { engine } = createTestEngine({ today: LOG_TODAY });
    await engine.start();
    const quickLogs = new SyncedQuickLogProvider(engine);

    await quickLogs.saveJournalDraft('Half a thought about the week', null);
    await quickLogs.dispatchCommand({ type: 'journal.save', draft: { date: LOG_TODAY, text: 'Captured on the go', mood: null } });
    expect(await quickLogs.readJournalDraft()).toMatchObject({ text: 'Half a thought about the week' });

    await quickLogs.dispatchCommand({ type: 'journal.save', draft: { date: LOG_TODAY, text: 'Half a thought about the week', mood: null } });
    expect(await quickLogs.readJournalDraft()).toBeNull();
  });

  it('should include today in the meal history west of UTC', async () => {
    await withTimeZone('America/Los_Angeles', async () => {
      const meals = [
        {
          id: 'm1',
          date: LOG_TODAY,
          name: 'Oats',
          calories: 410,
          mealType: 'cooked',
          note: null,
          presetId: null,
          rewarded: true,
          loggedAt: `${LOG_TODAY}T07:20:00.000Z`,
          syncSeq: '1',
        },
      ];
      const { engine } = createTestEngine({ today: LOG_TODAY, pages: [deltaPage({ meals })] });
      await engine.start();
      const quickLogs = new SyncedQuickLogProvider(engine);
      await quickLogs.reproject();

      const view = await quickLogs.meals(LOG_TODAY);
      expect(view.history[0]).toEqual({ date: LOG_TODAY, summary: '1 meal', calories: 410 });
      expect(view.last14Days.at(-1)).toEqual({ date: LOG_TODAY, value: 410 });
      expect(view.last14Days[0]?.date).toBe('2026-08-09');
    });
  });

  it('should measure weight windows by account day west of UTC', async () => {
    await withTimeZone('America/Los_Angeles', async () => {
      const weight = (date: string, kg: string): Record<string, unknown> => ({ date, kg, rewarded: true, loggedAt: `${date}T07:00:00.000Z`, syncSeq: date });
      const { engine } = createTestEngine({
        today: LOG_TODAY,
        pages: [deltaPage({ weights: [weight(LOG_TODAY, '78.50'), weight('2026-08-15', '90.00'), weight('2026-08-16', '79.50')] })],
      });
      await engine.start();
      const quickLogs = new SyncedQuickLogProvider(engine);
      await quickLogs.reproject();

      expect((await quickLogs.weight()).sevenDayAverageKg).toBe(79);
    });
  });

  it('should measure weight statistics over their own windows', async () => {
    const weight = (date: string, kg: string): Record<string, unknown> => ({ date, kg, rewarded: true, loggedAt: `${date}T07:00:00.000Z`, syncSeq: date });
    const weights = [weight('2026-01-10', '95.00'), weight('2026-06-01', '80.00'), weight('2026-08-18', '79.20'), weight('2026-08-22', '78.50')];
    const { engine } = createTestEngine({ today: LOG_TODAY, pages: [deltaPage({ weights })] });
    await engine.start();
    const quickLogs = new SyncedQuickLogProvider(engine);
    await quickLogs.reproject();

    const view = await quickLogs.weight();
    expect(view.trend.map(point => point.date)).toEqual(['2026-06-01', '2026-08-18', '2026-08-22']);
    expect(view.ninetyDayChangeKg).toBe(-1.5);
    expect(view.ninetyDayStartKg).toBe(80);
    expect(view.sevenDayAverageKg).toBeCloseTo(78.85);
    expect(view.trendNote).toBe('78.5–80.0 kg');
  });
});
