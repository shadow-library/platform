import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { type ReactNode } from 'react';
import { toast } from '@shadow-library/ui';

import {
  createMemoirData,
  type FinanceCommand,
  type FixtureProviderOptions,
  type MemoirData,
  MemoirDataProvider,
  notifyOutcome,
  outcomeToast,
  type QuestDraft,
  useAccountCommand,
  useCommand,
  useDay,
  useFinanceCommand,
  useQuickLogCommand,
} from '@/lib/data';
import { type SyncedMemoirData } from '@/lib/sync';

import { act, renderHook } from './render-hook';
import { applied, createSyncedTestData, createTestEngine, type FakeServer, rejected, type TestEngineOptions, waitFor } from './sync-harness';

const TODAY = '2026-08-24';
const EXPENSE: FinanceCommand = { type: 'expense.create', draft: { amountText: '4.20', currency: 'EUR', categoryId: 'food', occurredOnDate: TODAY, note: 'coffee' } };

const THRESHOLD_DRAFT: QuestDraft = {
  name: 'Walk',
  notes: null,
  startTimeMinutes: null,
  durationMinutes: 20,
  statAffinity: 'body',
  strictness: 'goal',
  optionalStreakOptIn: false,
  recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: ['mon'], dayOfMonth: null, startDate: TODAY, end: { kind: 'never' }, exceptions: [] },
  consequences: [],
  moduleLink: null,
  notification: { enabled: false, leadMinutes: 0 },
  healthThreshold: { metricKey: 'steps', value: 8000, comparison: 'gte' },
  active: true,
};

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
}

function testQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function testData(options: FixtureProviderOptions = {}): MemoirData {
  return { ...createMemoirData(options), queryClient: testQueryClient() };
}

interface Gate {
  open: () => void;
  options: Pick<TestEngineOptions, 'fetchImpl'>;
}

/** Holds every command POST until `open`, so a test can look at a run while its outcome is still on the wire. */
function commandGate(): Gate {
  let open: () => void = () => undefined;
  const held = new Promise<void>(resolve => (open = resolve));
  const fetchImpl = (server: FakeServer) => async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/sync/commands')) await held;
    return server.fetchImpl(input, init);
  };
  return { open, options: { fetchImpl } };
}

function renderFinanceCommand(data: SyncedMemoirData) {
  return renderHook(() => useFinanceCommand(), { wrapper: ({ children }: { children: ReactNode }) => <MemoirDataProvider value={data}>{children}</MemoirDataProvider> });
}

describe('useDomainCommand run', () => {
  beforeEach(() => setOnline(true));
  afterEach(() => {
    setOnline(true);
    mock.restore();
  });

  it('should ignore a second run while pending', async () => {
    const gate = commandGate();
    const { engine, server } = createTestEngine({ today: TODAY, ...gate.options });
    const { result } = renderFinanceCommand(createSyncedTestData(engine));

    let first: Promise<unknown> = Promise.resolve();
    let second: Promise<unknown> = Promise.resolve();
    act(() => {
      first = result.current.run(EXPENSE);
      second = result.current.run(EXPENSE);
    });

    expect(second).toBe(first);
    expect(result.current.isPending).toBe(true);

    gate.open();
    await act(async () => void (await first));

    expect(server.batches.flatMap(batch => batch.types)).toEqual(['expense.create']);
    expect(result.current.isPending).toBe(false);
  });

  it('should resolve once the server applies the command', async () => {
    const { engine } = createTestEngine({ today: TODAY, outcomes: batch => batch.commandIds.map(id => applied(id)) });
    const { result } = renderFinanceCommand(createSyncedTestData(engine));

    const outcome = await act(() => result.current.run(EXPENSE));

    expect(outcome).toMatchObject({ status: 'applied', local: { message: expect.any(String) } });
    expect(engine.getSnapshot().notices).toEqual([]);
  });

  it('should hand an outcome without a confirmation step straight to notifyOutcome', async () => {
    const success = spyOn(toast, 'success');
    const { engine } = createTestEngine({ today: TODAY });
    const { result } = renderFinanceCommand(createSyncedTestData(engine));

    await act(async () => notifyOutcome(await result.current.run(EXPENSE), { success: 'Expense saved.', action: 'save', subject: 'coffee' }));

    expect(success).toHaveBeenCalledWith('Expense saved.', undefined);
  });

  it('should run a repeatable action again when dedupe is off', async () => {
    const gate = commandGate();
    const { engine, server } = createTestEngine({ today: TODAY, ...gate.options });
    const { result } = renderFinanceCommand(createSyncedTestData(engine));

    let first: Promise<unknown> = Promise.resolve();
    let second: Promise<unknown> = Promise.resolve();
    act(() => {
      first = result.current.run(EXPENSE, { dedupe: false });
      second = result.current.run(EXPENSE, { dedupe: false });
    });

    expect(second).not.toBe(first);
    gate.open();
    await act(async () => void (await Promise.all([first, second])));

    expect(server.batches.flatMap(batch => batch.types)).toEqual(['expense.create', 'expense.create']);
  });

  it('should report pending per command', async () => {
    const gate = commandGate();
    const { engine } = createTestEngine({ today: TODAY, ...gate.options });
    const { result } = renderFinanceCommand(createSyncedTestData(engine));
    const other: FinanceCommand = { type: 'expense.delete', id: 'e-2' };

    let running: Promise<unknown> = Promise.resolve();
    act(() => void (running = result.current.run(EXPENSE)));

    expect(result.current.isPendingFor(EXPENSE)).toBe(true);
    expect(result.current.isPendingFor(other)).toBe(false);
    expect(result.current.isPendingFor(command => command.type === 'expense.create')).toBe(true);

    gate.open();
    await act(async () => void (await running));
    expect(result.current.isPendingFor(EXPENSE)).toBe(false);
  });

  it('should resolve a server rejection in owner copy and revert the optimistic apply', async () => {
    const { engine } = createTestEngine({ today: TODAY, outcomes: batch => batch.commandIds.map(id => rejected(id, 'Expense not found', 'FIN_003')) });
    const data = createSyncedTestData(engine);
    const { result } = renderFinanceCommand(data);

    const outcome = await act(() => result.current.run(EXPENSE));

    expect(outcome).toEqual({ status: 'rejected', message: 'That expense no longer exists.', code: 'FIN_003', undone: true });
    expect((await data.finance.expenses({ range: 'month', search: '', limit: 8 })).items).toEqual([]);
    expect(engine.getSnapshot().notices).toEqual([]);
  });

  it('should not claim a request/response rejection was undone', async () => {
    const warning = spyOn(toast, 'warning');
    const data = testData({ today: TODAY });
    spyOn(data.account, 'dispatchCommand').mockResolvedValue({ status: 'rejected', message: 'That setting can’t be changed.', error: { code: 'ACC_004', kind: 'refusal' } });
    const { result } = renderHook(() => useAccountCommand(), {
      wrapper: ({ children }: { children: ReactNode }) => <MemoirDataProvider value={data}>{children}</MemoirDataProvider>,
    });

    const outcome = await act(() => result.current.run({ type: 'day.set', patch: { intensity: 'gentle' } }));
    notifyOutcome(outcome, { success: '', action: 'change intensity' });

    expect(outcome).toEqual({ status: 'rejected', message: 'That setting can’t be changed.', code: 'ACC_004', undone: false });
    expect(warning).toHaveBeenCalledWith('Couldn’t change intensity: That setting can’t be changed.', undefined);
  });

  it('should not claim a quest refused on this device before its apply was undone', async () => {
    const { engine } = createTestEngine({ today: TODAY });
    await engine.start();
    const { result } = renderHook(() => useCommand(), {
      wrapper: ({ children }: { children: ReactNode }) => <MemoirDataProvider value={createSyncedTestData(engine)}>{children}</MemoirDataProvider>,
    });

    const outcome = await act(() => result.current.run({ type: 'quest.create', draft: THRESHOLD_DRAFT }));
    if (outcome.status !== 'rejected') throw new TypeError(`expected a local refusal, got ${outcome.status}`);

    expect(outcome.undone).toBe(false);
    expect(outcomeToast(outcome, { success: '', action: 'save', subject: 'Walk' })?.title).toBe(`Couldn’t save ‘Walk’: ${outcome.message}`);
  });

  it('should report a local-only enqueue of a server-backed command as not saved', async () => {
    const { engine, server } = createTestEngine({ today: TODAY });
    await engine.start();
    const data = createSyncedTestData(engine);
    spyOn(data.quickLogs, 'dispatchCommand').mockImplementation(async (command, options) => ({
      id: 'water',
      message: 'Saved.',
      delivery: await engine.enqueue(command, TODAY, options),
    }));
    const { result } = renderHook(() => useQuickLogCommand(), {
      wrapper: ({ children }: { children: ReactNode }) => <MemoirDataProvider value={data}>{children}</MemoirDataProvider>,
    });

    const outcome = await act(() => result.current.run({ type: 'health.save', key: 'water', date: TODAY, value: 1600 }));

    expect(outcome).toEqual({ status: 'rejected', message: 'Health metrics aren’t set up for this account yet, so this can’t be saved.', code: null, undone: false });
    expect(await engine.outbox.pending()).toEqual([]);
    expect(server.batches).toEqual([]);
  });

  it('should not keep a first fetch that read the state before a local apply', async () => {
    const data = testData({ today: TODAY });
    const readDay = data.provider.getDay.bind(data.provider);
    let release: () => void = () => undefined;
    const held = new Promise<void>(resolve => (release = resolve));
    let reads = 0;
    spyOn(data.provider, 'getDay').mockImplementation(async date => {
      reads += 1;
      const view = await readDay(date);
      if (reads === 1) await held;
      return view;
    });
    const { result } = renderHook(() => ({ day: useDay(TODAY), command: useCommand() }), {
      wrapper: ({ children }: { children: ReactNode }) => <MemoirDataProvider value={data}>{children}</MemoirDataProvider>,
    });
    await waitFor(() => reads === 1);
    const occurrence = (await readDay(TODAY)).occurrences.find(item => item.state === 'upcoming');
    if (!occurrence) throw new TypeError('expected an upcoming occurrence');

    const running = act(() => result.current.command.run({ type: 'quest.complete', occurrenceId: occurrence.id }));
    release();
    await running;

    await waitFor(() => result.current.day.data?.occurrences.find(item => item.id === occurrence.id)?.state === 'completed');
  });

  it('should resolve as queued-offline straight away while offline', async () => {
    setOnline(false);
    const { engine, server } = createTestEngine({ today: TODAY });
    const { result } = renderFinanceCommand(createSyncedTestData(engine));

    const outcome = await act(() => result.current.run(EXPENSE));

    expect(outcome).toMatchObject({ status: 'queued-offline', reason: 'offline' });
    expect(server.batches).toHaveLength(0);
  });

  it('should resolve as queued-offline when the server is slower than the outcome wait', async () => {
    const gate = commandGate();
    const { engine } = createTestEngine({ today: TODAY, outcomeTimeoutMs: 1, ...gate.options });
    const { result } = renderFinanceCommand(createSyncedTestData(engine));

    const outcome = await act(() => result.current.run(EXPENSE));

    expect(outcome).toMatchObject({ status: 'queued-offline', reason: 'slow' });
    gate.open();
  });

  it('should never settle after unmount and leave the outcome to the notices', async () => {
    const gate = commandGate();
    const { engine } = createTestEngine({ today: TODAY, outcomes: batch => batch.commandIds.map(id => rejected(id, 'no', 'FIN_003')), ...gate.options });
    const { result, unmount } = renderFinanceCommand(createSyncedTestData(engine));

    let settled = false;
    act(() => void result.current.run(EXPENSE).then(() => (settled = true)));
    await waitFor(() => engine.getSnapshot().queuedCount === 1);
    unmount();
    gate.open();

    await waitFor(() => engine.getSnapshot().notices.length > 0);
    expect(engine.getSnapshot().notices).toEqual([expect.objectContaining({ commandType: 'expense.create', outcome: 'rejected', code: 'FIN_003' })]);
    expect(settled).toBe(false);
  });
});
