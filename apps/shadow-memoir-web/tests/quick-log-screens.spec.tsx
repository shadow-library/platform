import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { toast } from '@shadow-library/ui';
import { describe, expect, it, vi } from 'vitest';

import { EntryCapNote } from '@/components/EntryCapNote';
import { LinkageOfferNote } from '@/components/LinkageOfferNote';
import { HealthMetricsScreen, JournalScreen, MealsScreen, SideQuestsScreen, WeightScreen } from '@/features/quick-logs';
import { deriveCapAdvisory, FixtureQuickLogProvider, MONTHLY_ENTRY_CAP, setQuickLogProvider, todayISODate } from '@/lib/data';
import { type DeltaPage, type KeyValueBacking, SYNC_META_KEYS, type SyncedMemoirData, SyncedQuickLogProvider, SyncEngineProvider } from '@/lib/sync';

import { createMemoirTestData, renderScreen, renderWithQuery } from './harness';
import { withTimeZone } from './setup';
import { createSyncedTestData, createTestEngine, type FakeServer, rejected, sharedBacking, sharedUnload, type TestEngine, type TestEngineOptions } from './sync-harness';

interface Gate {
  open: () => void;
  options: Pick<TestEngineOptions, 'fetchImpl'>;
}

/** Holds every command POST until `open`, so a test can look at a run while its outcome is still on the wire. */
function commandGate(): Gate {
  let open: () => void = () => undefined;
  const held = new Promise<void>(resolve => (open = resolve));
  const fetchImpl = (server: FakeServer): typeof fetch =>
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/sync/commands')) await held;
      return server.fetchImpl(input, init);
    }) as typeof fetch;
  return { open, options: { fetchImpl } };
}

const LOG_TODAY = '2026-08-22';

function deltaPage(domains: DeltaPage['domains']): DeltaPage {
  return { cursor: '1', hasMore: false, tombstones: [], domains };
}

/** Renders `node` over a synced engine whose day — and the browser clock the screens read — is {@link LOG_TODAY}. */
async function withSyncedScreen(node: ReactElement, options: TestEngineOptions, body: (test: TestEngine, data: SyncedMemoirData) => Promise<void>): Promise<void> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${LOG_TODAY}T12:00:00.000Z`));
  const test = createTestEngine({ today: LOG_TODAY, ...options });
  const data = createSyncedTestData(test.engine);
  setQuickLogProvider(data.quickLogs);
  try {
    renderScreen(<SyncEngineProvider data={data}>{node}</SyncEngineProvider>, { value: data });
    await body(test, data);
  } finally {
    setQuickLogProvider(new FixtureQuickLogProvider());
    vi.useRealTimers();
  }
}

function rowOf(text: string): HTMLElement {
  const row = screen.getByText(text).closest('div');
  if (!row) throw new TypeError(`no row holds "${text}"`);
  return row;
}

function expectStaticRow(row: HTMLElement): void {
  expect(within(row).queryAllByRole('button')).toEqual([]);
  expect(within(row).queryAllByRole('link')).toEqual([]);
  expect(row.getAttribute('role')).toBeNull();
  expect(row.hasAttribute('tabindex')).toBe(false);
}

const WATER_CATALOGUE = [{ id: '504', name: 'Water', isHealth: true }];

describe('weight screen', () => {
  it('should ask before replacing a value already logged for today', async () => {
    renderWithQuery(<WeightScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Replace today’s weight?')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeDefined();
  });

  it('should name the value a replacement overwrites without promising a history the server does not keep', async () => {
    renderWithQuery(<WeightScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Today already carries 78.4 kg. Saving 78.4 kg replaces it.')).toBeDefined();
    expect(screen.queryByText(/History/)).toBeNull();
  });

  it('should show the replaced weight', async () => {
    const weights = [{ date: LOG_TODAY, kg: '78.50', rewarded: true, loggedAt: `${LOG_TODAY}T07:05:00.000Z`, syncSeq: '1' }];
    await withSyncedScreen(<WeightScreen />, { pages: [deltaPage({ weights })] }, async test => {
      const field = await screen.findByRole('spinbutton', { name: 'Weight in kilograms' });
      fireEvent.change(field, { target: { value: '79.2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Replace' }));

      expect(await screen.findByText(/replaced 78\.5 kg/)).toBeDefined();
      await waitFor(() => expect(test.server.batches.flatMap(batch => batch.types)).toEqual(['weight.save']));
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(screen.getByText(/replaced 78\.5 kg/)).toBeDefined();
      expect(screen.getByText('Replaced 78.5 kg')).toBeDefined();
    });
  });

  it('should refuse a weight outside the allowed range with an inline error', async () => {
    renderScreen(<WeightScreen />);
    const field = await screen.findByRole('spinbutton', { name: 'Weight in kilograms' });
    fireEvent.change(field, { target: { value: '300' } });
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.submit(field.closest('form') as HTMLFormElement);

    expect((await screen.findByRole('alert')).textContent).toBe('Weight is between 30 and 250 kg.');
    expect(field.getAttribute('aria-describedby')).toBe('weight-error');
    expect(screen.queryByText('Replace today’s weight?')).toBeNull();
  });

  it('should refuse a typed weight outside the range when Save is clicked', async () => {
    const user = userEvent.setup();
    await withSyncedScreen(<WeightScreen />, { pages: [deltaPage({})] }, async test => {
      const field = (await screen.findByRole('spinbutton', { name: 'Weight in kilograms' })) as HTMLInputElement;
      await user.click(field);
      await user.keyboard('10');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect((await screen.findByRole('alert')).textContent).toBe('Weight is between 30 and 250 kg.');
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(field.value).toBe('10');
      expect(test.server.batches).toEqual([]);
      expect(await test.engine.outbox.pending()).toEqual([]);
    });
  });

  it('should start stepping an empty weight from the last logged value', async () => {
    const weights = [{ date: '2026-08-19', kg: '78.40', rewarded: true, loggedAt: '2026-08-19T07:05:00.000Z', syncSeq: '1' }];
    await withSyncedScreen(<WeightScreen />, { pages: [deltaPage({ weights })] }, async () => {
      await screen.findByText('Nothing logged today');
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Increase' }));
      fireEvent.pointerUp(screen.getByRole('button', { name: 'Increase' }));

      expect((screen.getByRole('spinbutton', { name: 'Weight in kilograms' }) as HTMLInputElement).value).toBe('78.4');
    });
  });

  it('should show blanks instead of zero statistics and an empty trend', async () => {
    await withSyncedScreen(<WeightScreen />, { pages: [deltaPage({})] }, async () => {
      expect(await screen.findByText('No trend yet')).toBeDefined();
      expect(screen.queryByText('7-day average')).toBeNull();
      expect(screen.queryByText('90 days')).toBeNull();
      expect(screen.queryByText('Alongside the trend')).toBeNull();
    });
  });

  it('should show an error instead of an empty weight log when sync fails', async () => {
    await withSyncedScreen(<WeightScreen />, { status: () => 500 }, async () => {
      expect(await screen.findByText("Couldn't load this right now")).toBeDefined();
      expect(screen.queryByText('No entries yet')).toBeNull();
      expect(screen.queryByText('Nothing logged today')).toBeNull();
    });
  });

  it('should render logged rows as static content', async () => {
    renderScreen(<WeightScreen />);
    await screen.findByText('Corrected from 89.1 — typo');
    expectStaticRow(rowOf('Corrected from 89.1 — typo'));
  });

  it('should state that weight is context and never a target', async () => {
    renderWithQuery(<WeightScreen />);
    expect(await screen.findByText(/never sets a goal weight/)).toBeDefined();
  });

  it('should show today’s logged time in the local zone, not raw UTC', async () => {
    try {
      await withTimeZone('Europe/Oslo', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-08-22T12:00:00.000Z'));
        try {
          const today = todayISODate();
          const page: DeltaPage = {
            cursor: '1',
            hasMore: false,
            tombstones: [],
            domains: { weights: [{ date: today, kg: '78.40', rewarded: true, loggedAt: `${today}T07:05:00.000Z`, syncSeq: '1' }] },
          };
          const test = createTestEngine({ today, pages: [page] });
          const data = createSyncedTestData(test.engine);
          setQuickLogProvider(data.quickLogs);

          renderScreen(
            <SyncEngineProvider data={data}>
              <WeightScreen />
            </SyncEngineProvider>,
            { value: data },
          );

          expect(await screen.findByText(/^Logged 09:05/)).toBeDefined();
          expect(screen.queryByText(/T07:05/)).toBeNull();
        } finally {
          vi.useRealTimers();
        }
      });
    } finally {
      setQuickLogProvider(new FixtureQuickLogProvider());
    }
  });
});

const JOURNAL_TODAY = '2026-08-22';

describe('journal screen', () => {
  it('should not preselect a mood', async () => {
    renderWithQuery(<JournalScreen />);
    const group = await screen.findByRole('group', { name: 'Mood' });

    expect(within(group).queryByRole('button', { pressed: true })).toBeNull();
    expect(await screen.findByText('Mood is optional')).toBeDefined();
  });

  it('should draw the Low mood as a solid outline rather than a dotted ring', async () => {
    renderWithQuery(<JournalScreen />);
    const glyphs = within(await screen.findByRole('group', { name: 'Mood' }))
      .getAllByRole('button')
      .map(button => button.querySelector('[aria-hidden]')?.textContent);

    expect(glyphs).toEqual(['○', '◍', '◉', '◈', '✦']);
  });

  it('should restore the journal draft after reload', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${JOURNAL_TODAY}T12:00:00.000Z`));
    try {
      const backing = sharedBacking();
      const first = createTestEngine({ backing, today: JOURNAL_TODAY });
      const firstData = createSyncedTestData(first.engine);
      setQuickLogProvider(firstData.quickLogs);

      const { unmount } = renderScreen(
        <SyncEngineProvider data={firstData}>
          <JournalScreen />
        </SyncEngineProvider>,
        { value: firstData },
      );

      fireEvent.change(await screen.findByLabelText('Journal entry'), { target: { value: 'Draft in progress' } });
      await waitFor(async () => expect(await first.store.readMeta(SYNC_META_KEYS.journalDraft)).toEqual({ date: JOURNAL_TODAY, text: 'Draft in progress', mood: null }));
      unmount();

      const second = createTestEngine({ backing, today: JOURNAL_TODAY });
      const secondData = createSyncedTestData(second.engine);
      setQuickLogProvider(secondData.quickLogs);

      try {
        renderScreen(
          <SyncEngineProvider data={secondData}>
            <JournalScreen />
          </SyncEngineProvider>,
          { value: secondData },
        );

        const restored = (await screen.findByLabelText('Journal entry')) as HTMLTextAreaElement;
        await waitFor(() => expect(restored.value).toBe('Draft in progress'));
      } finally {
        setQuickLogProvider(new FixtureQuickLogProvider());
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('should restore journal edits typed just before a hard unload', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${JOURNAL_TODAY}T12:00:00.000Z`));
    const backing = sharedBacking();
    const unload = sharedUnload();
    let unloaded = false;
    const tab: KeyValueBacking = { ...backing, put: (key, value) => (unloaded ? new Promise<void>(() => undefined) : backing.put(key, value)) };

    try {
      const first = createTestEngine({ backing: tab, unload, accountId: 'owner-1', today: JOURNAL_TODAY });
      const firstData = createSyncedTestData(first.engine);
      setQuickLogProvider(firstData.quickLogs);
      const { unmount } = renderScreen(
        <SyncEngineProvider data={firstData}>
          <JournalScreen />
        </SyncEngineProvider>,
        { value: firstData },
      );

      const editor = await screen.findByLabelText('Journal entry');
      fireEvent.change(editor, { target: { value: 'Morning pages' } });
      await waitFor(async () => expect(await first.store.readMeta(SYNC_META_KEYS.journalDraft)).toMatchObject({ text: 'Morning pages' }));

      fireEvent.change(editor, { target: { value: 'Morning pages, and the last line' } });
      unloaded = true;
      window.dispatchEvent(new Event('pagehide'));
      unmount();

      const second = createTestEngine({ backing, unload, accountId: 'owner-1', today: JOURNAL_TODAY });
      const secondData = createSyncedTestData(second.engine);
      setQuickLogProvider(secondData.quickLogs);
      renderScreen(
        <SyncEngineProvider data={secondData}>
          <JournalScreen />
        </SyncEngineProvider>,
        { value: secondData },
      );

      const restored = (await screen.findByLabelText('Journal entry')) as HTMLTextAreaElement;
      await waitFor(() => expect(restored.value).toBe('Morning pages, and the last line'));
      await waitFor(async () => expect(await second.store.readMeta(SYNC_META_KEYS.journalDraft)).toMatchObject({ text: 'Morning pages, and the last line' }));
      expect(unload.keys()).toEqual([]);
    } finally {
      setQuickLogProvider(new FixtureQuickLogProvider());
      vi.useRealTimers();
    }
  });

  it('should keep journal text when the save is rejected', async () => {
    const test = createTestEngine({ today: JOURNAL_TODAY, outcomes: batch => batch.commandIds.map(id => rejected(id, 'no', 'CMD_002')) });
    const data = createSyncedTestData(test.engine);
    setQuickLogProvider(data.quickLogs);
    const warning = vi.spyOn(toast, 'warning');

    try {
      renderScreen(
        <SyncEngineProvider data={data}>
          <JournalScreen />
        </SyncEngineProvider>,
        { value: data },
      );

      const editor = (await screen.findByLabelText('Journal entry')) as HTMLTextAreaElement;
      fireEvent.change(editor, { target: { value: 'Written under a rejected save' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));

      await waitFor(() => expect(warning).toHaveBeenCalled());
      expect(editor.value).toBe('Written under a rejected save');
      expect(await data.quickLogs.readJournalDraft()).toMatchObject({ text: 'Written under a rejected save' });
    } finally {
      warning.mockRestore();
      setQuickLogProvider(new FixtureQuickLogProvider());
    }
  });

  it('should not recreate the draft when leaving during a pending save', async () => {
    const gate = commandGate();
    const test = createTestEngine({ today: JOURNAL_TODAY, ...gate.options });
    const data = createSyncedTestData(test.engine);
    setQuickLogProvider(data.quickLogs);

    try {
      renderScreen(
        <SyncEngineProvider data={data}>
          <JournalScreen />
        </SyncEngineProvider>,
        { value: data },
      );

      fireEvent.change(await screen.findByLabelText('Journal entry'), { target: { value: 'Leaving mid-save' } });
      await waitFor(async () => expect(await data.quickLogs.readJournalDraft()).toMatchObject({ text: 'Leaving mid-save' }));

      fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
      await waitFor(async () => expect(await data.quickLogs.readJournalDraft()).toBeNull());

      window.dispatchEvent(new Event('pagehide'));
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(await data.quickLogs.readJournalDraft()).toBeNull();
    } finally {
      gate.open();
      setQuickLogProvider(new FixtureQuickLogProvider());
    }
  });

  it('should restore a draft written on an earlier day', async () => {
    const test = createTestEngine({ today: JOURNAL_TODAY });
    await test.store.writeMeta(SYNC_META_KEYS.journalDraft, { date: '2026-08-01', text: 'Left over from last week', mood: null });
    const data = createSyncedTestData(test.engine);
    setQuickLogProvider(data.quickLogs);

    try {
      renderScreen(
        <SyncEngineProvider data={data}>
          <JournalScreen />
        </SyncEngineProvider>,
        { value: data },
      );

      const restored = (await screen.findByLabelText('Journal entry')) as HTMLTextAreaElement;
      await waitFor(() => expect(restored.value).toBe('Left over from last week'));
      expect(await screen.findByText(/Draft from/)).toBeDefined();
    } finally {
      setQuickLogProvider(new FixtureQuickLogProvider());
    }
  });

  it('should not restore a draft the owner cleared', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${JOURNAL_TODAY}T12:00:00.000Z`));
    try {
      const backing = sharedBacking();
      const first = createTestEngine({ backing, today: JOURNAL_TODAY });
      const firstData = createSyncedTestData(first.engine);
      setQuickLogProvider(firstData.quickLogs);

      const { unmount } = renderScreen(
        <SyncEngineProvider data={firstData}>
          <JournalScreen />
        </SyncEngineProvider>,
        { value: firstData },
      );

      const editor = (await screen.findByLabelText('Journal entry')) as HTMLTextAreaElement;
      fireEvent.change(editor, { target: { value: 'Second thoughts' } });
      await waitFor(async () => expect(await first.store.readMeta(SYNC_META_KEYS.journalDraft)).toEqual({ date: JOURNAL_TODAY, text: 'Second thoughts', mood: null }));

      fireEvent.change(editor, { target: { value: '' } });
      await waitFor(async () => expect(await first.store.readMeta(SYNC_META_KEYS.journalDraft)).toBeNull());
      unmount();

      const second = createTestEngine({ backing, today: JOURNAL_TODAY });
      const secondData = createSyncedTestData(second.engine);
      setQuickLogProvider(secondData.quickLogs);

      try {
        renderScreen(
          <SyncEngineProvider data={secondData}>
            <JournalScreen />
          </SyncEngineProvider>,
          { value: secondData },
        );

        const reopened = (await screen.findByLabelText('Journal entry')) as HTMLTextAreaElement;
        expect(await secondData.quickLogs.readJournalDraft()).toBeNull();
        expect(reopened.value).toBe('');
      } finally {
        setQuickLogProvider(new FixtureQuickLogProvider());
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('should show an error instead of empty journal entries when sync fails', async () => {
    const test = createTestEngine({ today: JOURNAL_TODAY, status: () => 500 });
    const data = createSyncedTestData(test.engine);
    setQuickLogProvider(data.quickLogs);

    try {
      renderScreen(
        <SyncEngineProvider data={data}>
          <JournalScreen />
        </SyncEngineProvider>,
        { value: data },
      );

      expect(await screen.findByText("Couldn't load this right now")).toBeDefined();
      expect(screen.queryByText('No entries yet')).toBeNull();
    } finally {
      setQuickLogProvider(new FixtureQuickLogProvider());
    }
  });

  it('should clear the journal draft when saving within the autosave delay', async () => {
    const backing = sharedBacking();
    const test = createTestEngine({ backing, today: JOURNAL_TODAY });
    const data = createSyncedTestData(test.engine);
    setQuickLogProvider(data.quickLogs);

    try {
      const { unmount } = renderScreen(
        <SyncEngineProvider data={data}>
          <JournalScreen />
        </SyncEngineProvider>,
        { value: data },
      );

      const editor = (await screen.findByLabelText('Journal entry')) as HTMLTextAreaElement;
      fireEvent.change(editor, { target: { value: 'Hello' } });
      await waitFor(async () => expect(await data.quickLogs.readJournalDraft()).toMatchObject({ text: 'Hello' }));
      fireEvent.change(editor, { target: { value: 'Hello world' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));

      await waitFor(() => expect(editor.value).toBe(''));
      await waitFor(() => expect(test.server.batches.flatMap(batch => batch.types)).toEqual(['journal.save']));
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(await data.quickLogs.readJournalDraft()).toBeNull();
      unmount();

      renderScreen(
        <SyncEngineProvider data={data}>
          <JournalScreen />
        </SyncEngineProvider>,
        { value: data },
      );
      const reopened = (await screen.findByLabelText('Journal entry')) as HTMLTextAreaElement;
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(reopened.value).toBe('');
    } finally {
      setQuickLogProvider(new FixtureQuickLogProvider());
    }
  });

  it('should persist a dismissed prompt', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${JOURNAL_TODAY}T12:00:00.000Z`));
    try {
      const test = createTestEngine({ today: JOURNAL_TODAY });
      const data = createSyncedTestData(test.engine);
      setQuickLogProvider(data.quickLogs);

      try {
        renderScreen(
          <SyncEngineProvider data={data}>
            <JournalScreen />
          </SyncEngineProvider>,
          { value: data },
        );

        fireEvent.click(await screen.findByRole('button', { name: 'Not today' }));

        await waitFor(async () => expect(await test.store.readMeta(SYNC_META_KEYS.journalPromptDismissedOn)).toBe(JOURNAL_TODAY));
        await waitFor(() => expect(screen.queryByText('Today’s prompt · optional')).toBeNull());
        expect((await data.quickLogs.journal()).prompt).toBeNull();
      } finally {
        setQuickLogProvider(new FixtureQuickLogProvider());
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('should move focus to today’s entry after dismissing the prompt', async () => {
    await withSyncedScreen(<JournalScreen />, {}, async () => {
      const dismiss = await screen.findByRole('button', { name: 'Not today' });
      dismiss.focus();
      fireEvent.click(dismiss);

      await waitFor(() => expect(screen.queryByRole('button', { name: 'Not today' })).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: '22 Aug 2026' })));
    });
  });
});

describe('side quests screen', () => {
  it('should not render an edit control for side quests', async () => {
    renderScreen(<SideQuestsScreen />);
    expect(await screen.findByText('Called Mum')).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
  });

  it('should show a no-match state for side quest search', async () => {
    renderScreen(<SideQuestsScreen />);
    fireEvent.change(await screen.findByLabelText('Search side quests'), { target: { value: 'xyzzynomatch' } });

    expect(await screen.findByText('Nothing matches “xyzzynomatch”')).toBeDefined();
    expect(screen.getByText('Try a different search.')).toBeDefined();
  });
});

describe('meals screen', () => {
  it('should offer one-tap re-logging from the presets', async () => {
    renderWithQuery(<MealsScreen />);
    expect(await screen.findAllByRole('button', { name: /Breakfast oats/ })).toBeDefined();
  });

  it('should log a preset and keep the calories it was logged with', async () => {
    renderWithQuery(<MealsScreen />);
    const before = (await screen.findByRole('heading', { name: /kcal/ })).textContent ?? '';

    fireEvent.click((await screen.findAllByRole('button', { name: /^Breakfast oats$/ }))[0]!);

    await waitFor(async () => expect((await screen.findByRole('heading', { name: /kcal/ })).textContent).not.toBe(before));
    expect(screen.getAllByText('Oats, berries, skyr').length + screen.getAllByText('Breakfast oats').length).toBeGreaterThan(0);
  });

  it('should not render macro totals', async () => {
    renderScreen(<MealsScreen />);
    expect(await screen.findByRole('heading', { name: /^Today/ })).toBeDefined();

    for (const macro of ['Protein', 'Carbs', 'Fat']) expect(screen.queryByText(macro)).toBeNull();
  });

  it('should render logged rows as static content', async () => {
    renderScreen(<MealsScreen />);
    await screen.findByText('Oats, berries, skyr');
    expectStaticRow(rowOf('Oats, berries, skyr'));
  });

  it('should log a preset once on double tap', async () => {
    const gate = commandGate();
    const presets = [{ id: '7', name: 'Office canteen lunch', calories: 720, mealType: 'ate_out', note: null }];
    try {
      await withSyncedScreen(<MealsScreen />, { pages: [deltaPage({ meal_presets: presets })], ...gate.options }, async test => {
        const chip = await screen.findByRole('button', { name: 'Office canteen lunch' });
        fireEvent.click(chip);
        fireEvent.click(chip);
        gate.open();

        await waitFor(() => expect(test.server.batches.flatMap(batch => batch.types)).toEqual(['meal.logPreset']));
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(test.server.batches.flatMap(batch => batch.types)).toEqual(['meal.logPreset']);
        expect((await test.engine.outbox.pending()).length).toBe(0);
      });
    } finally {
      gate.open();
    }
  });

  it('should ask before logging a preset again right after logging it', async () => {
    const presets = [{ id: '7', name: 'Office canteen lunch', calories: 720, mealType: 'ate_out', note: null }];
    await withSyncedScreen(<MealsScreen />, { pages: [deltaPage({ meal_presets: presets })] }, async test => {
      const logged = (): string[] => test.server.batches.flatMap(batch => batch.types);
      fireEvent.click(await screen.findByRole('button', { name: 'Office canteen lunch' }));
      await waitFor(() => expect(logged()).toEqual(['meal.logPreset']));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Office canteen lunch' })).toHaveProperty('disabled', false));

      const chip = screen.getByRole('button', { name: 'Office canteen lunch' });
      fireEvent.click(chip);
      await waitFor(() => expect(chip.getAttribute('aria-describedby')).not.toBeNull());
      expect(chip).toHaveProperty('textContent', 'Office canteen lunch');
      expect(document.getElementById(chip.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Just logged. Select Office canteen lunch again to log a second one.');
      await new Promise(resolve => setTimeout(resolve, 450));
      expect(logged()).toEqual(['meal.logPreset']);

      fireEvent.click(chip);
      await waitFor(() => expect(logged()).toEqual(['meal.logPreset', 'meal.logPreset']));
      expect(chip.getAttribute('aria-describedby')).toBeNull();
    });
  });

  it('should explain the repeat confirmation inside the Add meal panel', async () => {
    const presets = [{ id: '7', name: 'Office canteen lunch', calories: 720, mealType: 'ate_out', note: null }];
    await withSyncedScreen(<MealsScreen />, { pages: [deltaPage({ meal_presets: presets })] }, async test => {
      const panelChip = (): HTMLElement => screen.getByRole('button', { name: 'Office canteen lunch · 720 kcal' });
      fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }));
      fireEvent.click(panelChip());
      await waitFor(() => expect(test.server.batches.flatMap(batch => batch.types)).toEqual(['meal.logPreset']));
      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Add meal' })).toBeNull());

      fireEvent.click(screen.getByRole('button', { name: 'Add meal' }));
      fireEvent.click(panelChip());

      const form = screen.getByRole('heading', { name: 'Add meal' }).closest('form') as HTMLFormElement;
      await waitFor(() => expect(panelChip().getAttribute('aria-describedby')).not.toBeNull());
      const hint = document.getElementById(panelChip().getAttribute('aria-describedby') ?? '');
      expect(form.contains(hint)).toBe(true);
      expect(hint?.textContent).toBe('Just logged. Select Office canteen lunch again to log a second one.');
      expect(hint?.getAttribute('role')).toBeNull();
      expect(screen.getAllByRole('status').filter(status => status.textContent?.includes('Just logged'))).toHaveLength(1);
    });
  });

  it('should not log a preset again when the confirming tap follows the asking tap too quickly', async () => {
    const presets = [{ id: '7', name: 'Office canteen lunch', calories: 720, mealType: 'ate_out', note: null }];
    await withSyncedScreen(<MealsScreen />, { pages: [deltaPage({ meal_presets: presets })] }, async test => {
      const logged = (): string[] => test.server.batches.flatMap(batch => batch.types);
      fireEvent.click(await screen.findByRole('button', { name: 'Office canteen lunch' }));
      await waitFor(() => expect(logged()).toEqual(['meal.logPreset']));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Office canteen lunch' })).toHaveProperty('disabled', false));

      const chip = screen.getByRole('button', { name: 'Office canteen lunch' });
      fireEvent.click(chip);
      fireEvent.click(chip);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(logged()).toEqual(['meal.logPreset']);
      expect(chip.getAttribute('aria-describedby')).not.toBeNull();
    });
  });

  it('should keep preset chips in place after logging one', async () => {
    const presets = [
      { id: '7', name: 'Apple bowl', calories: 300, mealType: 'cooked', note: null },
      { id: '8', name: 'Banana shake', calories: 250, mealType: 'cooked', note: null },
    ];
    const chipNames = (): string[] => screen.getAllByRole('button').flatMap(chip => presets.filter(preset => chip.textContent?.includes(preset.name)).map(preset => preset.name));

    const gate = commandGate();

    try {
      await withSyncedScreen(<MealsScreen />, { pages: [deltaPage({ meal_presets: presets })], ...gate.options }, async () => {
        await screen.findByRole('button', { name: 'Banana shake' });
        expect(chipNames()).toEqual(['Apple bowl', 'Banana shake']);

        fireEvent.click(screen.getByRole('button', { name: 'Banana shake' }));

        expect(await screen.findByText('· used 1 time')).toBeDefined();
        expect(screen.getAllByRole('listitem')[0]?.textContent).toContain('Banana shake');
        expect(chipNames()).toEqual(['Apple bowl', 'Banana shake']);
      });
    } finally {
      gate.open();
    }
  });

  it('should count preset usage from logged meals', async () => {
    const meal = (id: string, presetId: string | null, date: string): Record<string, unknown> => ({
      id,
      date,
      name: 'Logged',
      calories: 500,
      mealType: 'cooked',
      note: null,
      presetId,
      rewarded: false,
      loggedAt: `${date}T12:00:00.000Z`,
      syncSeq: id,
    });
    const presets = [
      { id: '7', name: 'Office canteen lunch', calories: 720, mealType: 'ate_out', note: null },
      { id: '8', name: 'Chicken & rice bowl', calories: 640, mealType: 'cooked', note: null },
    ];
    const meals = [meal('1', '7', '2026-08-20'), meal('2', '7', '2026-08-21'), meal('3', '8', '2026-08-21'), meal('4', null, '2026-08-21')];

    await withSyncedScreen(<MealsScreen />, { pages: [deltaPage({ meal_presets: presets, meals })] }, async () => {
      expect(await screen.findByText('· used 2 times')).toBeDefined();
      expect(screen.getByText('· used 1 time')).toBeDefined();
    });
  });

  it('should reset the meal panel after an advisory', async () => {
    renderScreen(<MealsScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }));

    const form = screen.getByRole('heading', { name: 'Add meal' }).closest('form') as HTMLFormElement;
    const name = within(form).getByRole('textbox') as HTMLInputElement;
    expect(document.activeElement).toBe(name);

    fireEvent.change(name, { target: { value: 'Cap meal' } });
    fireEvent.change(within(form).getByRole('spinbutton', { name: 'Calories' }), { target: { value: '300' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save meal' }));

    await waitFor(() => expect(within(form).getByRole('note').textContent).toMatch(/meals (logged )?this month/));
    expect(name.value).toBe('');
    expect((within(form).getByRole('spinbutton', { name: 'Calories' }) as HTMLInputElement).value).toBe('0');
    expect(within(form).getByRole('button', { name: 'Save meal' })).toHaveProperty('disabled', true);
  });

  it('should refuse negative calories when Save meal is clicked', async () => {
    const user = userEvent.setup();
    await withSyncedScreen(<MealsScreen />, { pages: [deltaPage({})] }, async test => {
      await user.click(await screen.findByRole('button', { name: 'Add meal' }));
      const form = screen.getByRole('heading', { name: 'Add meal' }).closest('form') as HTMLFormElement;
      await user.type(within(form).getByRole('textbox'), 'Negative');
      const calories = within(form).getByRole('spinbutton', { name: 'Calories' }) as HTMLInputElement;
      await user.clear(calories);
      await user.type(calories, '-50');
      await user.click(within(form).getByRole('button', { name: 'Save meal' }));

      expect(within(form).getByRole('alert').textContent).toContain('Calories are a whole number, zero or more.');
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(calories.value).toBe('-50');
      expect(test.server.batches).toEqual([]);
      expect(await test.engine.outbox.pending()).toEqual([]);
    });
  });

  it('should refuse negative calories with an inline error', async () => {
    renderScreen(<MealsScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add meal' }));
    const form = screen.getByRole('heading', { name: 'Add meal' }).closest('form') as HTMLFormElement;

    fireEvent.change(within(form).getByRole('textbox'), { target: { value: 'Negative' } });
    fireEvent.change(within(form).getByRole('spinbutton', { name: 'Calories' }), { target: { value: '-50' } });

    expect(within(form).getByRole('alert').textContent).toContain('Calories are a whole number, zero or more.');
    expect(within(form).getByRole('button', { name: 'Save meal' })).toHaveProperty('disabled', true);
  });

  it('should list today in a pluralised meal history', async () => {
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
    await withSyncedScreen(<MealsScreen />, { pages: [deltaPage({ meals })] }, async () => {
      expect(await screen.findByText('1 meal')).toBeDefined();
      expect(within(rowOf('1 meal')).getByText('Today')).toBeDefined();
      expect(screen.queryByText(/1 meals/)).toBeNull();
    });
  });

  it('should show one Add meal and no zero totals on an empty day', async () => {
    await withSyncedScreen(<MealsScreen />, { pages: [deltaPage({})] }, async () => {
      expect(await screen.findByText('Nothing logged today')).toBeDefined();
      expect(screen.getAllByRole('button', { name: 'Add meal' })).toHaveLength(1);
      expect(screen.queryByText(/0 kcal/)).toBeNull();
      expect(screen.getByText(/No presets on this account yet/)).toBeDefined();
    });
  });

  it('should show an error instead of an empty meal log when sync fails', async () => {
    await withSyncedScreen(<MealsScreen />, { status: () => 500 }, async () => {
      expect(await screen.findByText("Couldn't load this right now")).toBeDefined();
      expect(screen.queryByText('Nothing logged today')).toBeNull();
    });
  });

  it('should say a blank day is blank rather than zero', async () => {
    renderWithQuery(<MealsScreen />);
    expect(await screen.findByText(/blank, not zero/)).toBeDefined();
  });

  it('should show a meal’s logged time in the local zone, not raw UTC', async () => {
    try {
      await withTimeZone('Europe/Oslo', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-08-22T12:00:00.000Z'));
        try {
          const today = todayISODate();
          const page: DeltaPage = {
            cursor: '1',
            hasMore: false,
            tombstones: [],
            domains: {
              meals: [
                {
                  id: 'm1',
                  date: today,
                  name: 'Oats',
                  calories: 410,
                  mealType: 'cooked',
                  note: null,
                  presetId: null,
                  rewarded: true,
                  loggedAt: `${today}T07:20:00.000Z`,
                  syncSeq: '1',
                },
              ],
            },
          };
          const test = createTestEngine({ today, pages: [page] });
          const data = createSyncedTestData(test.engine);
          setQuickLogProvider(data.quickLogs);

          renderScreen(
            <SyncEngineProvider data={data}>
              <MealsScreen />
            </SyncEngineProvider>,
            { value: data },
          );

          expect(await screen.findByText('09:20')).toBeDefined();
          expect(screen.queryByText(/T07:20/)).toBeNull();
        } finally {
          vi.useRealTimers();
        }
      });
    } finally {
      setQuickLogProvider(new FixtureQuickLogProvider());
    }
  });
});

describe('health metrics screen', () => {
  it('should offer the quest when a threshold is met and leave completing it to the owner', async () => {
    renderWithQuery(<HealthMetricsScreen />);
    expect(await screen.findByText(/never completes a quest for you/)).toBeDefined();
    expect(screen.getByRole('button', { name: /Complete the quest/ })).toBeDefined();
  });

  it('should show progress towards a threshold that is not met without offering anything', async () => {
    renderWithQuery(<HealthMetricsScreen />);
    expect(await screen.findByText(/70% of 2.0 l/)).toBeDefined();
  });

  it('should give every metric a manual entry field', async () => {
    renderWithQuery(<HealthMetricsScreen />);
    for (const name of ['Steps', 'Calories burned', 'Sleep', 'Water']) expect(await screen.findByLabelText(`${name} for today`)).toBeDefined();
  });

  it('should state that a blank metric day costs nothing', async () => {
    renderWithQuery(<HealthMetricsScreen />);
    expect(await screen.findByText(/they never cost HP/)).toBeDefined();
  });

  it('should refuse a blank or non-numeric metric with an inline error', async () => {
    const dispatch = vi.spyOn(FixtureQuickLogProvider.prototype, 'dispatchCommand');
    try {
      renderScreen(<HealthMetricsScreen />);
      const input = await screen.findByLabelText('Calories burned for today');
      const save = within(input.closest('form') as HTMLFormElement).getByRole('button', { name: 'Save' });

      fireEvent.change(input, { target: { value: '' } });
      fireEvent.click(save);
      expect((await screen.findByRole('alert')).textContent).toBe('Type a value to save — a blank day stays blank.');

      fireEvent.change(input, { target: { value: 'abc' } });
      fireEvent.click(save);
      expect((await screen.findByRole('alert')).textContent).toBe('Use digits only, like 7.5.');

      fireEvent.change(input, { target: { value: '-500' } });
      fireEvent.click(save);
      expect((await screen.findByRole('alert')).textContent).toBe('Calories burned can’t be negative.');
      expect(dispatch).not.toHaveBeenCalled();
    } finally {
      dispatch.mockRestore();
    }
  });

  it('should render logged rows as static content', async () => {
    renderScreen(<HealthMetricsScreen />);
    await screen.findByText('Calories burned 620 kcal');
    expectStaticRow(rowOf('Calories burned 620 kcal'));
  });

  it('should save water typed in litres as millilitres', async () => {
    const gate = commandGate();
    const entries = [{ id: '1', metricId: '504', date: LOG_TODAY, value: '1400', source: 'manual', createdAt: `${LOG_TODAY}T17:30:00.000Z` }];
    try {
      await withSyncedScreen(<HealthMetricsScreen />, { pages: [deltaPage({ metrics: WATER_CATALOGUE, metric_entries: entries })], ...gate.options }, async test => {
        const input = (await screen.findByLabelText('Water for today')) as HTMLInputElement;
        expect(input.value).toBe('1.4');

        fireEvent.change(input, { target: { value: '1.6' } });
        fireEvent.click(within(input.closest('form') as HTMLFormElement).getByRole('button', { name: 'Save' }));

        await waitFor(async () =>
          expect((await test.engine.outbox.pending()).map(entry => entry.command)).toEqual([expect.objectContaining({ type: 'health.save', value: 1600 })]),
        );
        expect(await screen.findByText('1.6')).toBeDefined();
      });
    } finally {
      gate.open();
    }
  });

  it('should warn once and keep the typed value when a metric save is rejected', async () => {
    const entries = [{ id: '1', metricId: '504', date: LOG_TODAY, value: '1400', source: 'manual', createdAt: `${LOG_TODAY}T17:30:00.000Z` }];
    const warning = vi.spyOn(toast, 'warning');
    const success = vi.spyOn(toast, 'success');
    try {
      await withSyncedScreen(
        <HealthMetricsScreen />,
        { pages: [deltaPage({ metrics: WATER_CATALOGUE, metric_entries: entries })], outcomes: batch => batch.commandIds.map(id => rejected(id, 'Metric not found', 'MET_002')) },
        async () => {
          const input = (await screen.findByLabelText('Water for today')) as HTMLInputElement;
          fireEvent.change(input, { target: { value: '2' } });
          fireEvent.click(within(input.closest('form') as HTMLFormElement).getByRole('button', { name: 'Save' }));

          await waitFor(() => expect(warning).toHaveBeenCalledTimes(1));
          expect(String(warning.mock.calls[0]?.[0])).not.toContain('Metric not found');
          expect(success).not.toHaveBeenCalled();
          expect(input.value).toBe('2');
        },
      );
    } finally {
      warning.mockRestore();
      success.mockRestore();
    }
  });

  it('should keep a completed threshold quest visible after its offer is gone', async () => {
    const quest = (id: string, name: string, metricId: string, value: number): Record<string, unknown> => ({
      id,
      name,
      durationMin: 20,
      startTimeMin: 420,
      strictness: 'routine',
      recurrence: { frequency: 'daily' },
      active: true,
      healthThreshold: { metricId, value, comparison: 'gte' },
    });
    const domains: DeltaPage['domains'] = {
      metrics: [{ id: '501', name: 'Steps', isHealth: true }, ...WATER_CATALOGUE],
      metric_entries: [{ id: '1', metricId: '501', date: LOG_TODAY, value: '8310', source: 'manual', createdAt: `${LOG_TODAY}T19:02:00.000Z` }],
      quests: [quest('q-steps', 'Move 8,000 steps', '501', 8000), quest('q-water', 'Drink 2 litres', '504', 2000)],
      quest_logs: [{ id: 'q-steps-log', questId: 'q-steps', date: LOG_TODAY, state: 'completed', xpAwarded: 30, coinsAwarded: 0, createdAt: `${LOG_TODAY}T19:05:00.000Z` }],
    };

    await withSyncedScreen(<HealthMetricsScreen />, { pages: [deltaPage(domains)] }, async () => {
      expect(await screen.findByText('Quest completed')).toBeDefined();
      expect(screen.getByText('“Move 8,000 steps” is completed for today.')).toBeDefined();
      expect(screen.getByText('Steps ≥ 8,000 → Move 8,000 steps')).toBeDefined();
      expect(screen.getByText('Water ≥ 2.0 l → Drink 2 litres')).toBeDefined();
    });
  });

  it('should not offer a quest from another day’s offer for the same value', async () => {
    const offer = (date: string): Record<string, unknown> => ({
      questId: 'q-steps',
      questName: 'Move 8,000 steps',
      metricId: '501',
      date,
      thresholdValue: 8000,
      currentValue: 8310,
      comparison: 'gte',
    });
    const domains = (offerDate: string): DeltaPage['domains'] => ({
      metrics: [{ id: '501', name: 'Steps', isHealth: true }],
      metric_entries: [{ id: '1', metricId: '501', date: LOG_TODAY, value: '8310', source: 'manual', createdAt: `${LOG_TODAY}T19:02:00.000Z` }],
      health_offers: [offer(offerDate)],
    });

    await withSyncedScreen(<HealthMetricsScreen />, { pages: [deltaPage(domains('2026-08-21'))] }, async () => {
      expect(await screen.findByText(/^Logged \d/)).toBeDefined();
      expect(screen.queryByRole('button', { name: /Complete the quest/ })).toBeNull();
      expect(screen.queryByRole('progressbar', { name: 'Steps against its quest threshold' })).toBeNull();
    });
    cleanup();

    await withSyncedScreen(<HealthMetricsScreen />, { pages: [deltaPage(domains(LOG_TODAY))] }, async () => {
      expect(await screen.findByRole('button', { name: /Complete the quest/ })).toBeDefined();
      expect(screen.getByRole('progressbar', { name: 'Steps against its quest threshold' })).toBeDefined();
    });
  });

  it('should show empty states instead of blank health cards', async () => {
    await withSyncedScreen(<HealthMetricsScreen />, { pages: [deltaPage({})] }, async () => {
      expect(await screen.findByText('Nothing logged yet')).toBeDefined();
      expect(screen.getByText(/No quest reads these metrics yet/)).toBeDefined();
      expect(screen.getAllByText('—')).toHaveLength(4);
    });
  });

  it('should show an error instead of empty health metrics when sync fails', async () => {
    await withSyncedScreen(<HealthMetricsScreen />, { status: () => 500 }, async () => {
      expect(await screen.findByText("Couldn't load this right now")).toBeDefined();
      expect(screen.queryByText('Nothing logged yet')).toBeNull();
    });
  });
});

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

describe('linkage offer note', () => {
  const TODAY = '2026-08-22';

  it('should complete the offered quest only when asked and report the outcome', async () => {
    const success = vi.spyOn(toast, 'success');
    const data = createMemoirTestData({ today: TODAY });
    renderScreen(<LinkageOfferNote offer={{ status: 'offered', questId: 'read-pages', questName: 'Read 20 pages', date: TODAY }} />, { value: data });

    expect((await data.provider.getDay(TODAY)).occurrences.find(item => item.questId === 'read-pages')?.state).toBe('upcoming');
    fireEvent.click(await screen.findByRole('button', { name: 'Complete Read 20 pages' }));

    await waitFor(() => expect(success).toHaveBeenCalledWith(expect.stringContaining('Read 20 pages'), undefined));
    expect((await data.provider.getDay(TODAY)).occurrences.find(item => item.questId === 'read-pages')?.state).toBe('completed');
    vi.restoreAllMocks();
  });

  it('should name the quest without claiming an undo when the completion is refused', async () => {
    const warning = vi.spyOn(toast, 'warning');
    renderScreen(<LinkageOfferNote offer={{ status: 'offered', questId: 'gone', questName: 'Old habit', date: TODAY }} />, { today: TODAY });

    fireEvent.click(await screen.findByRole('button', { name: 'Complete Old habit' }));

    await waitFor(() => expect(warning).toHaveBeenCalledWith('Couldn’t complete ‘Old habit’: That quest is no longer in your plan.', undefined));
    vi.restoreAllMocks();
  });
});

describe('entry cap advisory', () => {
  it('should render nothing while the allowance is comfortable', () => {
    const { container } = renderWithQuery(<EntryCapNote advisory={deriveCapAdvisory('journal', 10)} />);
    expect(container.textContent).toBe('');
  });

  it('should advise at 80% of the allowance without any blocking language', () => {
    renderWithQuery(<EntryCapNote advisory={deriveCapAdvisory('meals', MONTHLY_ENTRY_CAP * 0.8)} />);
    const note = screen.getByRole('note');
    expect(note.textContent).toContain('entries keep saving');
    expect(note.dataset.capLevel).toBe('approaching');
  });

  it('should say the allowance is reached at exactly the limit', () => {
    renderWithQuery(<EntryCapNote advisory={deriveCapAdvisory('meals', MONTHLY_ENTRY_CAP)} />);
    expect(screen.getByRole('note').textContent).toContain('reached the free monthly allowance');
  });

  it('should keep saving past 100% and say so', () => {
    renderWithQuery(<EntryCapNote advisory={deriveCapAdvisory('expenses', MONTHLY_ENTRY_CAP)} />);
    const note = screen.getByRole('note');
    expect(note.textContent).toContain('Everything still saves');
    expect(note.dataset.capLevel).toBe('reached');
  });
});
