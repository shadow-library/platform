import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { toast } from '@shadow-library/ui';
import { ApiError } from '@shadow-library/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NetStrip, SystemOverlayProvider } from '@/features/shell';
import {
  commandErrorCopy,
  commandRefusal,
  type FinanceCommand,
  isDeadLetterCode,
  MemoirDataProvider,
  noticeToast,
  notifyOutcome,
  outcomeToast,
  type QuestDraft,
  refusedCopy,
  rejectionCopy,
  toCommandError,
  useAccountCommand,
  useCommand,
  useDay,
  useFinanceCommand,
  useQuickLogCommand,
} from '@/lib/data';
import { type SyncedMemoirData, SyncEngineProvider } from '@/lib/sync';

import { createMemoirTestData, renderScreen } from './harness';
import { applied, createSyncedTestData, createTestEngine, type FakeServer, rejected, type TestEngineOptions } from './sync-harness';

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

function renderFinanceCommand(data: SyncedMemoirData) {
  return renderHook(() => useFinanceCommand(), { wrapper: ({ children }: { children: ReactNode }) => <MemoirDataProvider value={data}>{children}</MemoirDataProvider> });
}

describe('command feedback copy', () => {
  it('should map known error codes to owner copy', () => {
    expect(commandErrorCopy('QST_006', 'fallback')).toBe('Entries older than 7 days can’t be changed.');
    expect(rejectionCopy('FIN_003')).toBe('That expense no longer exists.');
    expect(rejectionCopy(null, { kind: 'reschedule-cap' })).toBe('It has already been moved twice this week.');
  });

  it('should never surface the server’s own message', () => {
    const raw = new ApiError(500, { code: 'S999', type: 'Internal', message: 'Unknown Error' });

    expect(rejectionCopy('WHAT_001')).toBe('The server didn’t accept this change.');
    expect(commandRefusal(raw, 'That could not be started.')).toEqual({ status: 'rejected', message: 'That could not be started.', error: { code: 'S999', kind: 'unavailable' } });
    expect(commandRefusal(new TypeError('Failed to fetch'), 'That could not be started.')).toMatchObject({
      message: 'Couldn’t reach Shadow Memoir.',
      error: { kind: 'unavailable' },
    });
  });

  it('should dead-letter every failure except the transient codes', () => {
    expect(isDeadLetterCode('QST_003')).toBe(true);
    expect(isDeadLetterCode('VALIDATION_ERROR')).toBe(true);
    expect(isDeadLetterCode('SYN_409')).toBe(true);
    expect(isDeadLetterCode(null)).toBe(true);
    expect(isDeadLetterCode('S007')).toBe(false);
    expect(isDeadLetterCode('OCR_002')).toBe(false);
    expect(isDeadLetterCode('ACC_002')).toBe(false);
  });

  it('should take a listed code’s kind from the catalogue rather than the HTTP status', () => {
    expect(toCommandError(new ApiError(403, { code: 'ACC_002', type: 'Forbidden', message: 'deleting' }))).toEqual({ code: 'ACC_002', kind: 'unavailable' });
    expect(toCommandError(new ApiError(409, { code: 'NEW_001', type: 'Conflict', message: 'new' }))).toEqual({ code: 'NEW_001', kind: 'refusal' });
  });

  it('should use neutral copy for a closed store rather than blaming another account', () => {
    expect(refusedCopy('closed')).toBe('The app was reloading its data. Try again.');
    expect(refusedCopy('owner-changed')).toContain('different account');
    expect(outcomeToast({ status: 'refused', message: refusedCopy('closed'), boundary: 'closed' }, { success: '', action: 'save' })?.title).toBe(
      'Couldn’t save — undone: The app was reloading its data. Try again.',
    );
  });

  it('should name the subject and pick the tone for every outcome', () => {
    const feedback = { success: 'Evening stretch completed. +8 XP.', action: 'complete', subject: 'Evening stretch' };

    expect(outcomeToast({ status: 'applied', local: null, xpAwarded: 8, coinsAwarded: 0 }, feedback)).toEqual({ intent: 'success', title: 'Evening stretch completed. +8 XP.' });
    expect(outcomeToast({ status: 'rejected', message: 'Entries older than 7 days can’t be changed.', code: 'QST_006', undone: true }, feedback)).toEqual({
      intent: 'warning',
      title: 'Couldn’t complete ‘Evening stretch’ — undone: Entries older than 7 days can’t be changed.',
    });
    expect(outcomeToast({ status: 'rejected', message: 'That setting can’t be changed.', code: 'ACC_004', undone: false }, feedback)).toEqual({
      intent: 'warning',
      title: 'Couldn’t complete ‘Evening stretch’: That setting can’t be changed.',
    });
    expect(outcomeToast({ status: 'failed', message: 'Something went wrong on our side.', code: null, undone: true }, feedback)).toEqual({
      intent: 'danger',
      title: 'Couldn’t complete ‘Evening stretch’ — undone: Something went wrong on our side.',
    });
    expect(outcomeToast({ status: 'failed', message: 'Couldn’t reach Shadow Memoir.', code: 'NETWORK', undone: false }, feedback)?.title).toBe(
      'Couldn’t complete ‘Evening stretch’: Couldn’t reach Shadow Memoir.',
    );
    expect(outcomeToast({ status: 'queued-offline', local: null, reason: 'deletion' }, feedback)).toMatchObject({
      intent: 'neutral',
      title: 'Saved on this device — this account is being deleted.',
    });
    expect(outcomeToast({ status: 'superseded', message: 'Another device already recorded it as skipped.' }, feedback)).toEqual({
      intent: 'warning',
      title: '‘Evening stretch’ changed on another device: Another device already recorded it as skipped.',
    });
    expect(outcomeToast({ status: 'queued-offline', local: null, reason: 'offline' }, feedback)).toMatchObject({ intent: 'neutral', title: 'Saved on this device — will sync.' });
    expect(outcomeToast({ status: 'queued-offline', local: null, reason: 'held' }, feedback)).toMatchObject({ intent: 'neutral', title: 'Saved on this device — will sync.' });
    expect(outcomeToast({ status: 'queued-offline', local: null, reason: 'slow' }, feedback)).toMatchObject({ intent: 'neutral', title: 'Saved — syncing.' });
  });

  it('should label a notice by the kind of change it was', () => {
    expect(noticeToast({ commandType: 'expense.create', outcome: 'rejected', code: 'FIN_003' })).toEqual({
      intent: 'warning',
      title: 'Expense — not saved: That expense no longer exists.',
    });
  });
});

describe('useDomainCommand run', () => {
  beforeEach(() => setOnline(true));
  afterEach(() => setOnline(true));

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
    const success = vi.spyOn(toast, 'success');
    const { engine } = createTestEngine({ today: TODAY });
    const { result } = renderFinanceCommand(createSyncedTestData(engine));

    await act(async () => notifyOutcome(await result.current.run(EXPENSE), { success: 'Expense saved.', action: 'save', subject: 'coffee' }));

    expect(success).toHaveBeenCalledWith('Expense saved.', undefined);
    vi.restoreAllMocks();
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
    const warning = vi.spyOn(toast, 'warning');
    const data = createMemoirTestData({ today: TODAY });
    vi.spyOn(data.account, 'dispatchCommand').mockResolvedValue({ status: 'rejected', message: 'That setting can’t be changed.', error: { code: 'ACC_004', kind: 'refusal' } });
    const { result } = renderHook(() => useAccountCommand(), {
      wrapper: ({ children }: { children: ReactNode }) => <MemoirDataProvider value={data}>{children}</MemoirDataProvider>,
    });

    const outcome = await act(() => result.current.run({ type: 'day.set', patch: { intensity: 'gentle' } }));
    notifyOutcome(outcome, { success: '', action: 'change intensity' });

    expect(outcome).toEqual({ status: 'rejected', message: 'That setting can’t be changed.', code: 'ACC_004', undone: false });
    expect(warning).toHaveBeenCalledWith('Couldn’t change intensity: That setting can’t be changed.', undefined);
    vi.restoreAllMocks();
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
    vi.spyOn(data.quickLogs, 'dispatchCommand').mockImplementation(async (command, options) => ({
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
    vi.restoreAllMocks();
  });

  it('should not keep a first fetch that read the state before a local apply', async () => {
    const data = createMemoirTestData({ today: TODAY });
    const readDay = data.provider.getDay.bind(data.provider);
    let release: () => void = () => undefined;
    const held = new Promise<void>(resolve => (release = resolve));
    let reads = 0;
    vi.spyOn(data.provider, 'getDay').mockImplementation(async date => {
      reads += 1;
      const view = await readDay(date);
      if (reads === 1) await held;
      return view;
    });
    const { result } = renderHook(() => ({ day: useDay(TODAY), command: useCommand() }), {
      wrapper: ({ children }: { children: ReactNode }) => <MemoirDataProvider value={data}>{children}</MemoirDataProvider>,
    });
    await waitFor(() => expect(reads).toBe(1));
    const occurrence = (await readDay(TODAY)).occurrences.find(item => item.state === 'upcoming');
    if (!occurrence) throw new TypeError('expected an upcoming occurrence');

    const running = act(() => result.current.command.run({ type: 'quest.complete', occurrenceId: occurrence.id }));
    release();
    await running;

    await waitFor(() => expect(result.current.day.data?.occurrences.find(item => item.id === occurrence.id)?.state).toBe('completed'));
    vi.restoreAllMocks();
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
    const { engine } = createTestEngine({ today: TODAY, outcomeTimeoutMs: 5, ...gate.options });
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
    await waitFor(() => expect(engine.getSnapshot().queuedCount).toBe(1));
    unmount();
    gate.open();

    await waitFor(() => expect(engine.getSnapshot().notices).toEqual([expect.objectContaining({ commandType: 'expense.create', outcome: 'rejected', code: 'FIN_003' })]));
    expect(settled).toBe(false);
  });
});

describe('NetStrip notices', () => {
  beforeEach(() => setOnline(true));
  afterEach(() => vi.restoreAllMocks());

  it('should toast a command nobody waited for once, in owner copy', async () => {
    const warning = vi.spyOn(toast, 'warning');
    const { engine } = createTestEngine({
      today: TODAY,
      outcomes: batch => batch.commandIds.map(id => rejected(id, 'This quest log is outside its 7-day edit window', 'QST_006')),
    });
    setOnline(false);
    await engine.enqueue({ type: 'quest.complete', occurrenceId: `q1:${TODAY}` }, TODAY);
    setOnline(true);
    const data = createSyncedTestData(engine);

    renderScreen(
      <StrictMode>
        <SyncEngineProvider data={data}>
          <SystemOverlayProvider>
            <NetStrip />
          </SystemOverlayProvider>
        </SyncEngineProvider>
      </StrictMode>,
      { value: data },
    );

    await waitFor(() => expect(warning).toHaveBeenCalledWith('Quest completed — not saved: Entries older than 7 days can’t be changed.', undefined));
    await waitFor(() => expect(engine.getSnapshot().notices).toEqual([]));
    expect(warning).toHaveBeenCalledTimes(1);
  });
});
