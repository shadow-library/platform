import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@shadow-library/ui';

import { CategoriesScreen, ExpenseDetailScreen, ExpenseEntryPanel, ExpensesScreen, SubscriptionsScreen } from '@/features/finance';
import { receiptApi } from '@/lib/apis';
import { type ExpenseCategory, type ExpenseDetail, type FinanceSettings, todayISODate, UNCATEGORISED } from '@/lib/data';
import { type DeltaPage, type SyncedMemoirData, SyncEngineProvider } from '@/lib/sync';

import { createMemoirTestData, renderScreen, renderWithQuery } from './harness';
import { withTimeZone } from './setup';
import { createSyncedTestData, createTestEngine, deltaResponse, rejected, type TestEngine, type TestEngineOptions } from './sync-harness';

const TODAY = '2026-08-23';

const EUR_SETTINGS: FinanceSettings = { homeCurrency: 'EUR', currencies: ['EUR', 'NOK', 'USD'], weekStartsOn: 1, monthlyBudgetMinor: null };

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

function page(domains: DeltaPage['domains'], tombstones: DeltaPage['tombstones'] = [], cursor = '1'): DeltaPage {
  return { cursor, hasMore: false, tombstones, domains };
}

interface PostedCommand {
  commandId: string;
  type: string;
  payload: Record<string, unknown>;
}

function postedCommands(init: RequestInit | undefined): PostedCommand[] {
  return (JSON.parse(String(init?.body)) as { commands: PostedCommand[] }).commands;
}

function expenseRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '0192f1a2-7b3c-7d4e-8f50-1a2b3c4d5e6f',
    amountMinor: '520',
    amountText: '5.20',
    currency: 'EUR',
    homeAmountMinor: null,
    fxRate: null,
    categoryId: 'health',
    occurredOn: todayISODate(),
    loggedAt: `${todayISODate()}T09:12:00Z`,
    note: null,
    merchant: 'Apotek 1',
    source: 'ocr',
    ...overrides,
  };
}

function subscriptionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sub-1',
    name: 'Kindle Unlimited',
    amountMinor: 999,
    amountText: '9.99',
    currency: 'EUR',
    frequency: 'monthly',
    billingDay: 25,
    nextDueDate: '2026-09-25',
    lastConfirmedDate: '2026-08-25',
    categoryId: 'subs',
    reminderEnabled: true,
    reminderLead: 'on_day',
    monthlyEquivalentMinor: 999,
    active: true,
    createdAt: '2023-01-01',
    ...overrides,
  };
}

function categoryRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'cat-home', key: 'home', label: 'Home', builtin: true, active: true, archivedAt: null, ...overrides };
}

function chooseFile(container: HTMLElement, file: File): void {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new TypeError('The receipt picker has no file input');
  fireEvent.change(input, { target: { files: [file] } });
}

function saveButton(name = 'Save expense'): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

describe('expense entry', () => {
  it('should preview the amount it will store, in the currency it was typed in', () => {
    renderWithQuery(<ExpenseEntryPanel today={TODAY} settings={EUR_SETTINGS} rates={[]} onClose={() => undefined} />);
    typeAmount('18.40');
    expect(screen.getByTestId('expense-entry-preview').textContent).toContain('€18.40 will be saved.');
  });

  it('should read a comma decimal separator as the same amount', () => {
    renderWithQuery(<ExpenseEntryPanel today={TODAY} settings={EUR_SETTINGS} rates={[]} onClose={() => undefined} />);
    typeAmount('18,40');
    expect(screen.getByTestId('expense-entry-preview').textContent).toContain('€18.40');
  });

  it('should read a grouped amount without inflating it', () => {
    renderWithQuery(<ExpenseEntryPanel today={TODAY} settings={EUR_SETTINGS} rates={[]} onClose={() => undefined} />);
    typeAmount('1,284.60');
    expect(screen.getByTestId('expense-entry-preview').textContent).toContain('€1,284.60');
  });

  it('should refuse to save an amount it cannot read, without losing what was typed', () => {
    renderWithQuery(<ExpenseEntryPanel today={TODAY} settings={EUR_SETTINGS} rates={[]} onClose={() => undefined} />);
    typeAmount('abc');

    const amount = screen.getByLabelText('Amount') as HTMLInputElement;
    expect(amount.value).toBe('abc');
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByText('Enter an amount, for example 18.40')).toBeDefined();
  });

  it('should move focus to the amount when the panel opens', () => {
    renderWithQuery(<ExpenseEntryPanel today={TODAY} settings={EUR_SETTINGS} rates={[]} onClose={() => undefined} />);
    expect(document.activeElement).toBe(screen.getByLabelText('Amount'));
  });

  it('should preview the converted value of a foreign amount at the last known rate', () => {
    renderWithQuery(<ExpenseEntryPanel today={TODAY} settings={EUR_SETTINGS} rates={[{ from: 'USD', to: 'EUR', rate: 0.921, date: TODAY }]} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Currency' }));
    fireEvent.click(screen.getByRole('option', { name: /USD/ }));
    typeAmount('18.40');

    expect(screen.getByTestId('expense-entry-preview').textContent).toBe('$18.40 ≈ €16.95 at 0.9210, the rate on 23 Aug.');
  });

  it('should hide archived categories from the entry form', () => {
    const categories: ExpenseCategory[] = [
      { id: 'food', name: 'Food', glyph: '◍', hint: 'Coffee, eating out, takeaway', tone: 'warning', swatch: 'var(--sh-warning-solid)', archived: false },
      { id: 'shopping', name: 'Shopping', glyph: '✦', hint: 'Clothes, books, gifts', tone: 'accent', swatch: 'var(--sh-accent)', archived: true },
      UNCATEGORISED,
    ];
    renderWithQuery(<ExpenseEntryPanel today={TODAY} settings={EUR_SETTINGS} rates={[]} categories={categories} onClose={() => undefined} />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Category' }));
    expect(screen.getByRole('option', { name: /Food/ })).toBeDefined();
    expect(screen.queryByRole('option', { name: /Shopping/ })).toBeNull();
  });

  it('should lock currency when editing an expense', () => {
    renderWithQuery(<ExpenseEntryPanel today={TODAY} settings={EUR_SETTINGS} rates={[]} existing={foreignExpense()} onClose={() => undefined} />);

    expect((screen.getByRole('combobox', { name: 'Currency' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('A saved expense keeps its currency. To use another, delete it and add it again.')).toBeDefined();
    expect(screen.getByTestId('expense-entry-preview').textContent).toContain('the rate this expense is locked to');
  });

  it('should save one expense on double click', async () => {
    const data = createMemoirTestData();
    const settings = (await data.finance.summary()).settings;
    renderScreen(<ExpenseEntryPanel today={todayISODate()} settings={settings} rates={[]} onClose={() => undefined} />, { value: data });

    await screen.findByLabelText('Amount');
    typeAmount('18.40');
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Double click test' } });
    const save = saveButton();
    fireEvent.click(save);
    fireEvent.click(save);

    await waitFor(async () => expect((await data.finance.expenses({ range: 'year', search: 'Double click test' })).total).toBe(1));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect((await data.finance.expenses({ range: 'year', search: 'Double click test' })).total).toBe(1);
  });

  it('should block saving with an invalid receipt file', async () => {
    const { container } = renderWithQuery(<ExpenseEntryPanel today={TODAY} settings={EUR_SETTINGS} rates={[]} onClose={() => undefined} />);
    typeAmount('18.40');

    chooseFile(container, new File(['notes'], 'receipt.txt', { type: 'text/plain' }));

    expect(await screen.findByText('That file isn’t a photo Shadow Memoir can keep. Use a JPEG, PNG, WebP or HEIC image.')).toBeDefined();
    expect(saveButton().disabled).toBe(true);
  });

  it('should attach an uploaded receipt to the expense', async () => {
    const ref = 'r/1/0192f1a2-7b3c-7d4e-8f50-1a2b3c4d5e6f.jpg';
    const posted: PostedCommand[] = [];
    const confirmedBeforePost: number[] = [];
    const create = vi.spyOn(receiptApi, 'create').mockResolvedValue({ ref, uploadUrl: 'https://storage.test/upload', expiresAt: '2026-08-23T10:00:00.000Z' });
    const put = vi.spyOn(receiptApi, 'putObject').mockImplementation(async (_url, _file, _type, progress) => progress.onProgress(100));
    const confirm = vi.spyOn(receiptApi, 'confirm').mockResolvedValue({ ref, status: 'stored' });

    const { engine } = createTestEngine({
      today: todayISODate(),
      pages: [page({ account: [{ defaultCurrency: 'EUR', enabledCurrencies: ['EUR'], weekStart: 1 }] })],
      fetchImpl: server => async (input, init) => {
        if (String(input).includes('/sync/commands')) {
          confirmedBeforePost.push(confirm.mock.calls.length);
          posted.push(...postedCommands(init));
        }
        return server.fetchImpl(input, init);
      },
    });
    const data = createSyncedTestData(engine);
    const { container } = renderScreen(
      <SyncEngineProvider data={data}>
        <ExpenseEntryPanel today={todayISODate()} settings={EUR_SETTINGS} rates={[]} onClose={() => undefined} />
      </SyncEngineProvider>,
      { value: data },
    );
    await waitFor(() => expect(engine.getSnapshot().state).toBe('online'));

    typeAmount('18.40');
    chooseFile(container, new File(['jpeg'], 'rema.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    expect(create).toHaveBeenCalledWith({ contentType: 'image/jpeg', sizeBytes: 4 });
    expect(put).toHaveBeenCalledWith('https://storage.test/upload', expect.any(File), 'image/jpeg', expect.anything());
    expect(confirm).not.toHaveBeenCalled();

    fireEvent.click(saveButton());

    await waitFor(() => expect(posted.map(command => command.type)).toEqual(['expense.create']));
    expect(posted[0]?.payload).toMatchObject({ amountMinor: 1840, receiptRef: ref });
    expect(confirm).toHaveBeenCalledWith(ref);
    expect(confirmedBeforePost).toEqual([1]);
    vi.restoreAllMocks();
  });

  it('should not save an expense with a receipt while offline', async () => {
    const ref = 'r/1/offline.jpg';
    vi.spyOn(receiptApi, 'create').mockResolvedValue({ ref, uploadUrl: 'https://storage.test/upload', expiresAt: '2026-08-23T10:00:00.000Z' });
    vi.spyOn(receiptApi, 'putObject').mockResolvedValue();
    const confirm = vi.spyOn(receiptApi, 'confirm').mockResolvedValue({ ref, status: 'stored' });
    const { engine } = createTestEngine({ today: todayISODate() });
    const data = createSyncedTestData(engine);
    const dispatch = vi.spyOn(data.finance, 'dispatchCommand');
    const { container } = renderScreen(<ExpenseEntryPanel today={todayISODate()} settings={EUR_SETTINGS} rates={[]} onClose={() => undefined} />, { value: data });

    await screen.findByLabelText('Amount');
    typeAmount('18.40');
    chooseFile(container, new File(['jpeg'], 'rema.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    fireEvent.click(saveButton());

    expect(await screen.findByText(/You’re offline, so the receipt can’t be attached right now/)).toBeDefined();
    expect(confirm).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.restoreAllMocks();
  });

  it('should abort an unfinished receipt upload when the panel closes', async () => {
    const aborted = vi.fn();
    vi.spyOn(receiptApi, 'create').mockResolvedValue({ ref: 'r/1/slow.jpg', uploadUrl: 'https://storage.test/upload', expiresAt: '2026-08-23T10:00:00.000Z' });
    const put = vi
      .spyOn(receiptApi, 'putObject')
      .mockImplementation((_url, _file, _type, progress) => new Promise((_resolve, reject) => progress.signal.addEventListener('abort', () => reject(aborted()))));
    const { engine } = createTestEngine({ today: todayISODate() });
    const data = createSyncedTestData(engine);
    const { container, unmount } = renderScreen(<ExpenseEntryPanel today={todayISODate()} settings={EUR_SETTINGS} rates={[]} onClose={() => undefined} />, { value: data });

    await screen.findByLabelText('Amount');
    chooseFile(container, new File(['jpeg'], 'rema.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    unmount();

    await waitFor(() => expect(aborted).toHaveBeenCalledTimes(1));
    vi.restoreAllMocks();
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

  it('should describe paused subscriptions', async () => {
    const { engine } = createTestEngine({ today: todayISODate(), pages: [page({ subscriptions: [subscriptionRow({ active: false })] })] });
    const data = createSyncedTestData(engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <SubscriptionsScreen />
      </SyncEngineProvider>,
      { value: data },
    );

    expect(await screen.findByText(/Paused — no renewals/)).toBeDefined();
    expect(screen.queryByText(/^Renews/)).toBeNull();
  });

  it('should render the unconverted-subscriptions warning as its own line, separate from the totals', async () => {
    const { engine } = createTestEngine({ today: todayISODate(), pages: [page({ subscriptions: [subscriptionRow({ currency: 'NOK', monthlyEquivalentMinor: 11633 })] })] });
    const data = createSyncedTestData(engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <SubscriptionsScreen />
      </SyncEngineProvider>,
      { value: data },
    );

    const totals = await screen.findByText(/active ·/);
    const warning = await screen.findByText(/not converted — no NOK rate yet/);
    expect(warning).not.toBe(totals);
    expect(totals.textContent).not.toContain('not converted');
  });

  it('should tag each subscription with the current name of the expense category it is filed under', async () => {
    const { engine } = createTestEngine({
      today: todayISODate(),
      pages: [
        page({
          subscriptions: [
            subscriptionRow({ id: 'sub-power', name: 'Electricity', categoryId: 'bills', nextDueDate: '2027-06-01' }),
            subscriptionRow({ id: 'sub-box', name: 'Meal box', categoryId: 'food', nextDueDate: '2027-06-02' }),
            subscriptionRow({ id: 'sub-books', name: 'Book club', categoryId: 'shopping', nextDueDate: '2027-06-03' }),
          ],
          expense_categories: [
            categoryRow({ id: 'cat-bills', key: 'bills', label: 'Utilities' }),
            categoryRow({ id: 'cat-food', key: 'food', label: 'Food' }),
            categoryRow({ id: 'cat-shopping', key: 'shopping', label: 'Shopping', archivedAt: '2026-08-01T00:00:00.000Z' }),
          ],
        }),
      ],
    });
    const data = createSyncedTestData(engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <SubscriptionsScreen />
      </SyncEngineProvider>,
      { value: data },
    );

    const titleLine = async (name: string): Promise<HTMLElement> => (await screen.findByText(name)).parentElement as HTMLElement;
    expect(within(await titleLine('Electricity')).getByText('Utilities')).toBeDefined();
    expect(within(await titleLine('Meal box')).getByText('Food')).toBeDefined();
    expect(within(await titleLine('Book club')).getByText('Shopping')).toBeDefined();
    expect(within(await titleLine('Electricity')).queryByText('Subscriptions')).toBeNull();
  });

  it('should send a pause the server accepts', async () => {
    const posted: PostedCommand[] = [];
    const success = vi.spyOn(toast, 'success');
    const warning = vi.spyOn(toast, 'warning');
    const { engine } = createTestEngine({
      today: todayISODate(),
      pages: [page({ subscriptions: [subscriptionRow()] })],
      fetchImpl: server => async (input, init) => {
        if (String(input).includes('/sync/commands')) posted.push(...postedCommands(init));
        return server.fetchImpl(input, init);
      },
    });
    const data = createSyncedTestData(engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <SubscriptionsScreen />
      </SyncEngineProvider>,
      { value: data },
    );
    await waitFor(() => expect(engine.getSnapshot().state).toBe('online'));

    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));

    await waitFor(() => expect(posted.map(command => command.type)).toEqual(['subscription.update']));
    expect(posted[0]?.payload).toMatchObject({ id: 'sub-1', active: false });
    await waitFor(() => expect(success).toHaveBeenCalledWith('Subscription paused.', undefined));
    expect(warning).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('should describe an overdue subscription as "Was due <date>"', async () => {
    await withTimeZone('Europe/Oslo', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-14T06:00:00.000Z'));
      try {
        const { engine } = createTestEngine({
          today: '2026-09-14',
          pages: [page({ subscriptions: [subscriptionRow({ nextDueDate: '2026-09-01', lastConfirmedDate: '2026-07-01' })] })],
        });
        const data = createSyncedTestData(engine);
        renderScreen(
          <SyncEngineProvider data={data}>
            <SubscriptionsScreen />
          </SyncEngineProvider>,
          { value: data },
        );

        expect(await screen.findByText(/Was due 1 Sep 2026/)).toBeDefined();
        expect(screen.queryByText(/^Renews/)).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('should name the subscription when the server rejects a pause', async () => {
    const warning = vi.spyOn(toast, 'warning');
    const { engine } = createTestEngine({
      today: todayISODate(),
      pages: [page({ subscriptions: [subscriptionRow({ name: 'Kindle Unlimited' })] })],
      outcomes: batch => batch.commandIds.map(commandId => rejected(commandId, 'This billing cycle has already been confirmed', 'FIN_004')),
    });
    const data = createSyncedTestData(engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <SubscriptionsScreen />
      </SyncEngineProvider>,
      { value: data },
    );
    await waitFor(() => expect(engine.getSnapshot().state).toBe('online'));

    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));

    await waitFor(() => expect(warning).toHaveBeenCalledTimes(1));
    expect(String(warning.mock.calls[0]?.[0])).toContain('Couldn’t pause ‘Kindle Unlimited’');
    vi.restoreAllMocks();
  });

  it('should create a subscription', async () => {
    const posted: PostedCommand[] = [];
    const success = vi.spyOn(toast, 'success');
    const { engine } = createTestEngine({
      today: todayISODate(),
      fetchImpl: server => async (input, init) => {
        if (String(input).includes('/sync/commands')) posted.push(...postedCommands(init));
        return server.fetchImpl(input, init);
      },
    });
    const data = createSyncedTestData(engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <SubscriptionsScreen />
      </SyncEngineProvider>,
      { value: data },
    );
    await waitFor(() => expect(engine.getSnapshot().state).toBe('online'));

    fireEvent.click(await screen.findByRole('button', { name: 'Add subscription' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Disney+' } });
    typeAmount('8.99');
    fireEvent.click(screen.getByRole('button', { name: 'Save subscription' }));

    await waitFor(() => expect(posted.map(command => command.type)).toEqual(['subscription.create']));
    expect(posted[0]?.payload).toMatchObject({ name: 'Disney+', amountMinor: 899, currency: 'EUR', frequency: 'monthly' });
    await waitFor(() => expect(success).toHaveBeenCalled());
    vi.restoreAllMocks();
  });
});

describe('categories screen', () => {
  it('should not offer archiving the system categories', async () => {
    renderScreen(<CategoriesScreen />);

    expect(await screen.findByRole('button', { name: 'Actions for Food' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Actions for Uncategorised' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Actions for Subscriptions' })).toBeNull();
  });

  it('should keep an archived category after resync', async () => {
    const posted: PostedCommand[] = [];
    let archived = false;
    const row = categoryRow();
    const { engine } = createTestEngine({
      today: todayISODate(),
      fetchImpl: server => async (input, init) => {
        const url = String(input);
        if (url.includes('/sync/commands')) {
          posted.push(...postedCommands(init));
          archived = true;
          return server.fetchImpl(input, init);
        }
        if (url.includes('/sync/delta'))
          return deltaResponse(input, page({ expense_categories: [{ ...row, archivedAt: archived ? '2026-08-23T00:00:00.000Z' : null }] }, [], archived ? '2' : '1'));
        return server.fetchImpl(input, init);
      },
    });
    const data = createSyncedTestData(engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <CategoriesScreen />
      </SyncEngineProvider>,
      { value: data },
    );
    await waitFor(() => expect(engine.getSnapshot().state).toBe('online'));

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Actions for Home' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));

    await waitFor(() => expect(posted.map(command => command.type)).toEqual(['category.setArchived']));

    await engine.sync();

    expect(await screen.findByText('Archived')).toBeDefined();
    expect((await data.finance.categories()).items.find(item => item.category.id === 'home')?.category.archived).toBe(true);
  });

  it('should archive a category and toast owner copy', async () => {
    const user = userEvent.setup();
    const posted: PostedCommand[] = [];
    const success = vi.spyOn(toast, 'success');
    const { engine } = createTestEngine({
      today: todayISODate(),
      pages: [page({ expense_categories: [categoryRow()] })],
      fetchImpl: server => async (input, init) => {
        if (String(input).includes('/sync/commands')) posted.push(...postedCommands(init));
        return server.fetchImpl(input, init);
      },
    });
    const data = createSyncedTestData(engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <CategoriesScreen />
      </SyncEngineProvider>,
      { value: data },
    );
    await waitFor(() => expect(engine.getSnapshot().state).toBe('online'));

    await user.click(await screen.findByRole('button', { name: 'Actions for Home' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));

    await waitFor(() => expect(posted.map(command => command.type)).toEqual(['category.setArchived']));
    expect(posted[0]?.payload).toMatchObject({ categoryId: 'home', archived: true });
    await waitFor(() => expect(success).toHaveBeenCalled());
    vi.restoreAllMocks();
  });
});

function setOffline(offline: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: !offline });
  onlineManager.setOnline(!offline);
  window.dispatchEvent(new Event(offline ? 'offline' : 'online'));
}

describe('expenses screen', () => {
  afterEach(() => {
    setOffline(false);
    vi.restoreAllMocks();
  });

  function renderMoney(domains: DeltaPage['domains']): void {
    const { engine } = createTestEngine({ today: todayISODate(), pages: [page(domains)] });
    const data = createSyncedTestData(engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <ExpensesScreen />
      </SyncEngineProvider>,
      { value: data },
    );
  }

  it('should say the budget is monthly on the week and year ranges', async () => {
    renderMoney({ account: [{ defaultCurrency: 'EUR', enabledCurrencies: ['EUR'], weekStart: 1, monthlyBudgetMinor: 160000 }], expenses: [expenseRow({ amountMinor: 1840 })] });

    expect(await screen.findByText('Left of budget')).toBeDefined();
    fireEvent.click(screen.getByRole('radio', { name: 'Week' }));

    expect(await screen.findByText('Left of this month’s budget')).toBeDefined();
    expect(screen.getByText(/^Budget is monthly · \d+ days? left in the month$/)).toBeDefined();
  });

  it('should mark the receipt scan quota once it is used up', async () => {
    vi.spyOn(receiptApi, 'scanQuota').mockResolvedValue({ cap: 5, used: 6, remaining: 0, resetAt: '2026-09-15T00:00:00.000Z' });
    renderMoney({ account: [{ defaultCurrency: 'EUR', enabledCurrencies: ['EUR'], weekStart: 1 }] });

    expect(await screen.findByText('Limit reached')).toBeDefined();
    expect(screen.getByText('6 / 5')).toBeDefined();
    expect(screen.getByText(/^Today’s scans are used up/)).toBeDefined();
  });

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
    const { engine } = createTestEngine({ today: todayISODate(), pages: [page({ expenses: [expenseRow({ amountMinor: 1840, note: 'Rema 1000', merchant: null })] })] });
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

  it('should total a non-euro account in its own currency and offer to set a budget', async () => {
    const { engine } = createTestEngine({
      today: todayISODate(),
      pages: [
        page({
          account: [{ defaultCurrency: 'JPY', enabledCurrencies: ['JPY', 'EUR'], weekStart: 1, monthlyBudgetMinor: null }],
          expenses: [expenseRow({ amountMinor: '1200', amountText: '1200', currency: 'JPY', note: 'Ramen', merchant: null })],
        }),
      ],
    });
    const data = createSyncedTestData(engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <ExpensesScreen />
      </SyncEngineProvider>,
      { value: data },
    );

    const row = await screen.findByRole('link', { name: /Ramen/ });
    expect(row.textContent).toContain('¥1,200');
    expect(screen.getByText('This month · ¥1,200')).toBeDefined();
    expect(screen.getByText('No monthly budget')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Set a budget' }).getAttribute('href')).toBe('/settings#day-and-money');
  });

  it('should open the expense list filtered to uncategorised', async () => {
    const { engine } = createTestEngine({
      today: todayISODate(),
      pages: [
        page({
          expenses: [expenseRow({ id: 'exp-uncat', note: 'Card payment', categoryId: 'uncat' }), expenseRow({ id: 'exp-coffee', note: 'Coffee', categoryId: 'food' })],
        }),
      ],
    });
    const data = createSyncedTestData(engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <ExpensesScreen />
      </SyncEngineProvider>,
      { value: data, initialPath: '/finance?category=uncat' },
    );

    expect(await screen.findByRole('link', { name: /Card payment/ })).toBeDefined();
    expect(screen.queryByRole('link', { name: /Coffee/ })).toBeNull();
    expect(await screen.findByRole('button', { name: 'Remove Uncategorised' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Uncategorised' }));

    expect(await screen.findByRole('link', { name: /Coffee/ })).toBeDefined();
  });

  it('should show a skeleton rather than an empty account before the first sync', async () => {
    const release = { open: (): void => undefined };
    const opened = new Promise<void>(resolve => (release.open = resolve));
    const { engine } = createTestEngine({
      today: todayISODate(),
      pages: [page({ expenses: [expenseRow({ note: 'Rema 1000' })] })],
      fetchImpl: server => async (input, init) => {
        if (String(input).includes('/sync/delta')) await opened;
        return server.fetchImpl(input, init);
      },
    });
    const data = createSyncedTestData(engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <ExpensesScreen />
      </SyncEngineProvider>,
      { value: data },
    );

    expect(await screen.findByRole('status', { name: 'Loading' })).toBeDefined();
    expect(screen.queryByText('No expenses in this range')).toBeNull();

    release.open();
    expect(await screen.findByRole('link', { name: /Rema 1000/ })).toBeDefined();
  });
});

describe('expense detail screen', () => {
  function renderDetail(expenseId: string, pages: DeltaPage[], options: Omit<TestEngineOptions, 'today' | 'pages'> = {}): TestEngine & { data: SyncedMemoirData } {
    const test = createTestEngine({ ...options, today: todayISODate(), pages });
    const data = createSyncedTestData(test.engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <ExpenseDetailScreen expenseId={expenseId} />
      </SyncEngineProvider>,
      { value: data },
    );
    return { ...test, data };
  }

  async function confirmDelete(): Promise<void> {
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete expense' }));
  }

  it('should show no rate warning for a base-currency expense', async () => {
    renderDetail('exp-home', [page({ expenses: [expenseRow({ id: 'exp-home', amountMinor: 6415 })] })]);

    expect(await screen.findByText('€64.15 · your base currency')).toBeDefined();
    expect(screen.queryByText('Waiting for a rate — the entry saved without one.')).toBeNull();
    expect(screen.queryByText('The rate does not move')).toBeNull();
  });

  it('should still warn about a missing rate for a foreign expense', async () => {
    renderDetail('exp-foreign', [page({ expenses: [expenseRow({ id: 'exp-foreign', amountMinor: 21400, currency: 'NOK' })] })]);

    expect(await screen.findByText('Waiting for a rate — the entry saved without one.')).toBeDefined();
    expect(screen.getByText('The rate does not move')).toBeDefined();
  });

  it('should show a skeleton for an expense deep link before the first sync', async () => {
    const release = { open: (): void => undefined };
    const opened = new Promise<void>(resolve => (release.open = resolve));
    const row = expenseRow();
    renderDetail(String(row['id']), [page({ expenses: [row] })], {
      fetchImpl: server => async (input, init) => {
        if (String(input).includes('/sync/delta')) await opened;
        return server.fetchImpl(input, init);
      },
    });

    expect(await screen.findByRole('status', { name: 'Loading' })).toBeDefined();
    expect(screen.queryByText('That expense is no longer here')).toBeNull();

    release.open();
    expect(await screen.findByText('€5.20 · your base currency')).toBeDefined();
    expect(screen.queryByText('That expense is no longer here')).toBeNull();
  });

  it('should list expense edit history', async () => {
    const row = expenseRow();
    const audit = (id: string, action: string, createdAt: string, changes: Record<string, unknown>[] = []): Record<string, unknown> => ({
      id,
      accountId: '1',
      expenseId: row['id'],
      action,
      changes,
      deviceId: null,
      createdAt,
      syncSeq: id,
    });
    renderDetail(String(row['id']), [
      page({
        expenses: [row],
        expense_audits: [
          audit('10', 'created', '2026-08-20T09:00:00.000Z'),
          audit('11', 'updated', '2026-08-21T11:02:00.000Z', [{ field: 'amountMinor', from: '420', to: '520' }]),
          audit('12', 'updated', '2026-08-22T08:30:00.000Z', [
            { field: 'categoryId', from: 'shopping', to: 'health' },
            { field: 'note', from: null, to: 'Knee support' },
          ]),
        ],
      }),
    ]);

    const history = (await screen.findByRole('heading', { name: 'Edit history' })).parentElement as HTMLElement;
    const items = await within(history).findAllByRole('listitem');
    const newestFirst = ['Category Shopping → Health', 'Note added: “Knee support”', 'Amount €4.20 → €5.20', 'Created'];
    expect(items.map(item => item.textContent?.split(' · ')[0])).toEqual(newestFirst);
    expect(items[2]?.textContent).toMatch(/^Amount €4\.20 → €5\.20 · 21 Aug, \d{2}:\d{2}$/);
    expect(within(history).queryByText(/null/)).toBeNull();
  });

  it('should say so when an expense has no recorded history', async () => {
    const row = expenseRow();
    renderDetail(String(row['id']), [page({ expenses: [row] })]);

    expect(await screen.findByText('No changes recorded yet. An expense saved before edit history began shows its changes from the next edit.')).toBeDefined();
  });

  it('should keep a null note null after editing', async () => {
    const posted: { type: string; payload: Record<string, unknown> }[] = [];
    const row = expenseRow();
    renderDetail(String(row['id']), [page({ expenses: [row] })], {
      fetchImpl: server => async (input, init) => {
        if (String(input).includes('/sync/commands')) posted.push(...postedCommands(init));
        return server.fetchImpl(input, init);
      },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    typeAmount('6.10');
    fireEvent.click(saveButton('Save changes'));

    await waitFor(() => expect(posted.map(command => command.type)).toEqual(['expense.update']));
    expect(posted[0]?.payload).not.toHaveProperty('note');
    expect(posted[0]?.payload['merchant']).toBe('Apotek 1');
    expect(await screen.findByText(/· Apotek 1$/)).toBeDefined();
    expect(screen.getByText('Receipt scanned')).toBeDefined();
  });

  it('should confirm before deleting an expense', async () => {
    const row = expenseRow({ source: 'manual' });
    const { server } = renderDetail(String(row['id']), [page({ expenses: [row] })]);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete this expense?')).toBeDefined();
    expect(server.batches).toEqual([]);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete expense' }));
    await waitFor(() => expect(server.batches.flatMap(batch => batch.types)).toEqual(['expense.delete']));
  });

  it('should show only a warning when the server rejects a delete', async () => {
    const success = vi.spyOn(toast, 'success');
    const warning = vi.spyOn(toast, 'warning');
    const row = expenseRow({ source: 'manual' });
    renderDetail(String(row['id']), [page({ expenses: [row] })], {
      outcomes: batch => batch.commandIds.map(commandId => rejected(commandId, 'Expense not found', 'FIN_003')),
    });

    await confirmDelete();

    await waitFor(() => expect(warning).toHaveBeenCalledTimes(1));
    expect(String(warning.mock.calls[0]?.[0])).toContain('Couldn’t delete ‘Apotek 1’');
    expect(success).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('should keep an expense restored by undo after the next pull', async () => {
    const row = expenseRow({ source: 'manual' });
    const oldId = String(row['id']);
    const posted: PostedCommand[] = [];
    const success = vi.spyOn(toast, 'success');
    const test = renderDetail(oldId, [], {
      fetchImpl: server => async (input, init) => {
        const url = String(input);
        if (url.includes('/sync/commands')) posted.push(...postedCommands(init));
        if (!url.includes('/sync/delta')) return server.fetchImpl(input, init);

        const restored = posted.find(command => command.type === 'expense.create');
        const deleted = posted.some(command => command.type === 'expense.delete');
        const tombstone = { domain: 'expenses', recordId: oldId, syncSeq: '2' };
        if (restored) return deltaResponse(input, page({ expenses: [{ ...row, id: restored.payload['id'] }] }, [tombstone], '3'));
        return deltaResponse(input, deleted ? page({ expenses: [] }, [tombstone], '2') : page({ expenses: [row] }));
      },
    });

    await confirmDelete();
    await waitFor(() => expect(success).toHaveBeenCalledWith('Expense deleted.', expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) })));

    const options = success.mock.calls[0]?.[1] as { action: { onClick: () => void } };
    act(() => options.action.onClick());
    await waitFor(() => expect(posted.map(command => command.type)).toEqual(['expense.delete', 'expense.create']));

    const restoredId = String(posted[1]?.payload['id']);
    expect(restoredId).not.toBe(oldId);
    await test.engine.sync();
    await test.engine.sync();
    expect((test.engine.domains().expenses ?? []).map(expense => expense['id'])).toEqual([restoredId]);
    vi.restoreAllMocks();
  });

  it('should not offer undo for an expense linked to a quest', async () => {
    const success = vi.spyOn(toast, 'success');
    const row = expenseRow({ source: 'manual', linkedQuestId: '104' });
    renderDetail(String(row['id']), [page({ expenses: [row] })]);

    await confirmDelete();

    await waitFor(() => expect(success).toHaveBeenCalledWith('Expense deleted.', expect.objectContaining({ action: undefined })));
    vi.restoreAllMocks();
  });
});

describe('synced finance cap advisory', () => {
  const nearlyAllowance = Array.from({ length: 85 }, (_, index) => expenseRow({ id: `exp-${index}` }));

  async function advisoryAfterSaving(domains: DeltaPage['domains']): Promise<string | null | undefined> {
    const { engine } = createTestEngine({ today: todayISODate(), pages: [page(domains)] });
    await engine.start();
    try {
      const result = await createSyncedTestData(engine).finance.dispatchCommand({
        type: 'expense.create',
        draft: { amountText: '4.20', currency: 'EUR', categoryId: 'food', occurredOnDate: todayISODate() },
      });
      return result.advisory === undefined ? undefined : result.advisory.message;
    } finally {
      engine.stop();
    }
  }

  it('should advise a free owner nearing the monthly allowance', async () => {
    expect(await advisoryAfterSaving({ expenses: nearlyAllowance, entitlement: [{ tier: 'free', state: 'free', trialUsed: false }] })).toContain('86 of 100 expenses');
  });

  it('should not advise a paid owner about the free allowance', async () => {
    expect(await advisoryAfterSaving({ expenses: nearlyAllowance, entitlement: [{ tier: 'paid', state: 'active', trialUsed: true }] })).toBeUndefined();
  });

  it('should not advise before the plan has reached this device', async () => {
    expect(await advisoryAfterSaving({ expenses: nearlyAllowance })).toBeUndefined();
  });
});
