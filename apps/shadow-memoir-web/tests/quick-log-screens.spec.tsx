import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { toast } from '@shadow-library/ui';
import { describe, expect, it, vi } from 'vitest';

import { EntryCapNote } from '@/components/EntryCapNote';
import { HealthMetricsScreen, JournalScreen, MealsScreen, SideQuestsScreen, WeightScreen } from '@/features/quick-logs';
import { deriveCapAdvisory, FixtureQuickLogProvider, MONTHLY_ENTRY_CAP, setQuickLogProvider, todayISODate } from '@/lib/data';
import { type DeltaPage, SYNC_META_KEYS, SyncEngineProvider } from '@/lib/sync';

import { renderScreen, renderWithQuery } from './harness';
import { withTimeZone } from './setup';
import { createSyncedTestData, createTestEngine, type FakeServer, rejected, sharedBacking, type TestEngineOptions } from './sync-harness';

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

describe('weight screen', () => {
  it('should ask before replacing a value already logged for today', async () => {
    renderWithQuery(<WeightScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Replace today’s weight?')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeDefined();
  });

  it('should say the replaced value is kept rather than lost', async () => {
    renderWithQuery(<WeightScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/stays visible in History/)).toBeDefined();
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

  it('should keep saving past 100% and say so', () => {
    renderWithQuery(<EntryCapNote advisory={deriveCapAdvisory('expenses', MONTHLY_ENTRY_CAP)} />);
    const note = screen.getByRole('note');
    expect(note.textContent).toContain('Everything still saves');
    expect(note.dataset.capLevel).toBe('reached');
  });
});
