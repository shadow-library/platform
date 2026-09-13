import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EntryCapNote } from '@/components/EntryCapNote';
import { HealthMetricsScreen, MealsScreen, WeightScreen } from '@/features/quick-logs';
import { deriveCapAdvisory, FixtureQuickLogProvider, MONTHLY_ENTRY_CAP, setQuickLogProvider, todayISODate } from '@/lib/data';
import { type DeltaPage, SyncEngineProvider } from '@/lib/sync';

import { renderScreen, renderWithQuery } from './harness';
import { withTimeZone } from './setup';
import { createSyncedTestData, createTestEngine } from './sync-harness';

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
