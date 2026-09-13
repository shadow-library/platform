import { onlineManager } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ExpenseDetailScreen, ExpenseEntryPanel, ExpensesScreen, SubscriptionsScreen } from '@/features/finance';
import { type ExpenseDetail, todayISODate } from '@/lib/data';
import { type DeltaPage, SyncEngineProvider } from '@/lib/sync';

import { renderScreen, renderWithQuery } from './harness';
import { createSyncedTestData, createTestEngine } from './sync-harness';

const TODAY = '2026-08-23';

function foreignExpense(): ExpenseDetail {
  return {
    id: 'exp-1',
    amountMinor: 21400,
    amountText: '214.00',
    currency: 'NOK',
    fxRate: 0.086,
    homeAmountMinor: 1840,
    categoryId: 'groceries',
    occurredOnDate: TODAY,
    loggedAt: `${TODAY}T09:12:00`,
    source: 'ocr',
    syncState: 'synced',
    audit: [],
  };
}

function typeAmount(value: string): void {
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value } });
}

describe('expense entry', () => {
  it('should preview the amount it will store, in the currency it was typed in', () => {
    renderWithQuery(<ExpenseEntryPanel today={TODAY} onClose={() => undefined} />);
    typeAmount('18.40');
    expect(screen.getByTestId('expense-entry-preview').textContent).toContain('€18.40 will be saved.');
  });

  it('should read a comma decimal separator as the same amount', () => {
    renderWithQuery(<ExpenseEntryPanel today={TODAY} onClose={() => undefined} />);
    typeAmount('18,40');
    expect(screen.getByTestId('expense-entry-preview').textContent).toContain('€18.40');
  });

  it('should read a grouped amount without inflating it', () => {
    renderWithQuery(<ExpenseEntryPanel today={TODAY} onClose={() => undefined} />);
    typeAmount('1,284.60');
    expect(screen.getByTestId('expense-entry-preview').textContent).toContain('€1,284.60');
  });

  it('should refuse to save an amount it cannot read, without losing what was typed', () => {
    renderWithQuery(<ExpenseEntryPanel today={TODAY} onClose={() => undefined} />);
    typeAmount('abc');

    const amount = screen.getByLabelText('Amount') as HTMLInputElement;
    expect(amount.value).toBe('abc');
    expect((screen.getByRole('button', { name: 'Save expense' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Enter an amount, for example 18.40')).toBeDefined();
  });

  it('should tell the owner a foreign amount converts at the rate on the day of the expense', () => {
    renderWithQuery(<ExpenseEntryPanel today={TODAY} existing={foreignExpense()} onClose={() => undefined} />);
    expect(screen.getByTestId('expense-entry-preview').textContent).toContain(`rate on ${TODAY}`);
  });
});

describe('subscriptions screen', () => {
  it('should surface a due charge with a confirmation the owner has to press', async () => {
    renderWithQuery(<SubscriptionsScreen />);
    expect(await screen.findByRole('heading', { name: 'Subscriptions' })).toBeDefined();
    expect((await screen.findAllByRole('button', { name: 'Confirm charge' })).length).toBeGreaterThan(0);
  });

  it('should present an unconfirmed past charge as waiting, never as a failure', async () => {
    renderWithQuery(<SubscriptionsScreen />);
    expect(await screen.findByText('Waiting to be confirmed')).toBeDefined();
  });
});

function setOffline(offline: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: !offline });
  onlineManager.setOnline(!offline);
  window.dispatchEvent(new Event(offline ? 'offline' : 'online'));
}

describe('expenses screen', () => {
  afterEach(() => setOffline(false));

  it('should show a queued badge for unsynced rows', async () => {
    const { engine } = createTestEngine({ today: todayISODate() });
    const data = createSyncedTestData(engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <ExpensesScreen />
      </SyncEngineProvider>,
      { value: data },
    );
    await waitFor(() => expect(engine.getSnapshot().state).toBe('online'));

    setOffline(true);
    await data.finance.dispatchCommand({
      type: 'expense.create',
      draft: { amountText: '7.50', currency: 'EUR', categoryId: 'transport', occurredOnDate: todayISODate(), note: 'Offline taxi' },
    });
    await data.queryClient.invalidateQueries();

    expect(await screen.findByText('Queued')).toBeDefined();
    expect(screen.getByText('One expense is waiting to sync')).toBeDefined();
    expect(engine.getSnapshot()).toMatchObject({ state: 'offline', queuedCount: 1 });
  });

  it('should show the amount for a base-currency expense the server sent with no home amount', async () => {
    const page: DeltaPage = {
      cursor: '1',
      hasMore: false,
      tombstones: [],
      domains: {
        expenses: [
          {
            id: 'exp-home',
            amountMinor: 1840,
            currency: 'EUR',
            homeAmountMinor: null,
            fxRate: null,
            categoryId: 'groceries',
            note: 'Rema 1000',
            occurredOn: todayISODate(),
            loggedAt: `${todayISODate()}T09:12:00Z`,
          },
        ],
      },
    };
    const { engine } = createTestEngine({ today: todayISODate(), pages: [page] });
    const data = createSyncedTestData(engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <ExpensesScreen />
      </SyncEngineProvider>,
      { value: data },
    );

    const row = await screen.findByRole('link', { name: /Rema 1000/ });
    expect(row.textContent).toContain('€18.40');
    expect(row.textContent).not.toContain('—');
  });
});

describe('expense detail screen', () => {
  function renderDetail(expenseId: string, page: DeltaPage): ReturnType<typeof createTestEngine> {
    const test = createTestEngine({ today: todayISODate(), pages: [page] });
    const data = createSyncedTestData(test.engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <ExpenseDetailScreen expenseId={expenseId} />
      </SyncEngineProvider>,
      { value: data },
    );
    return test;
  }

  it('should show no rate warning for a base-currency expense', async () => {
    renderDetail('exp-home', {
      cursor: '1',
      hasMore: false,
      tombstones: [],
      domains: {
        expenses: [
          {
            id: 'exp-home',
            amountMinor: 6415,
            currency: 'EUR',
            homeAmountMinor: null,
            fxRate: null,
            categoryId: 'groceries',
            occurredOn: todayISODate(),
            loggedAt: `${todayISODate()}T09:12:00Z`,
          },
        ],
      },
    });

    expect(await screen.findByText('€64.15 · your base currency')).toBeDefined();
    expect(screen.queryByText('Waiting for a rate — the entry saved without one.')).toBeNull();
    expect(screen.queryByText('The rate does not move')).toBeNull();
  });

  it('should still warn about a missing rate for a foreign expense', async () => {
    renderDetail('exp-foreign', {
      cursor: '1',
      hasMore: false,
      tombstones: [],
      domains: {
        expenses: [
          {
            id: 'exp-foreign',
            amountMinor: 21400,
            currency: 'NOK',
            homeAmountMinor: null,
            fxRate: null,
            categoryId: 'groceries',
            occurredOn: todayISODate(),
            loggedAt: `${todayISODate()}T09:12:00Z`,
          },
        ],
      },
    });

    expect(await screen.findByText('Waiting for a rate — the entry saved without one.')).toBeDefined();
    expect(screen.getByText('The rate does not move')).toBeDefined();
  });
});
