import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { type ReactElement, useState } from 'react';
import { toast } from '@shadow-library/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { JournalScreen } from '@/features/quick-logs';
import { QuickCapture } from '@/features/shell';
import { FixtureQuickLogProvider, type MemoirData, setQuickLogProvider, todayISODate } from '@/lib/data';
import { type DeltaPage, SYNC_META_KEYS, SyncEngineProvider } from '@/lib/sync';

import { createMemoirTestData, renderScreen } from './harness';
import { createSyncedTestData, createTestEngine, rejected, sharedBacking, type TestEngineOptions } from './sync-harness';

const NEW_DAY_NOTICE = 'It’s a new day, so this line now saves to today. Check it and save again.';

interface PostedCommand {
  commandId: string;
  type: string;
  payload: Record<string, unknown>;
}

function OpenCapture({ onClose = () => undefined, initiallyOpen = true }: { onClose?: () => void; initiallyOpen?: boolean }): ReactElement {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen capture
      </button>
      <QuickCapture
        open={open}
        onOpenChange={next => {
          setOpen(next);
          if (!next) onClose();
        }}
      />
    </>
  );
}

function captureField(): Promise<HTMLElement> {
  return screen.findByRole('textbox', { name: /Log something/ });
}

async function type(text: string): Promise<HTMLElement> {
  const field = await captureField();
  fireEvent.change(field, { target: { value: text } });
  return field;
}

function page(domains: DeltaPage['domains']): DeltaPage {
  return { cursor: '1', hasMore: false, tombstones: [], domains };
}

function renderSynced(account: Record<string, unknown>, options: TestEngineOptions & { held?: Promise<void> } = {}): { posted: PostedCommand[] } {
  const posted: PostedCommand[] = [];
  const { engine } = createTestEngine({
    ...options,
    pages: [page({ account: [account] })],
    fetchImpl: server => async (input, init) => {
      if (String(input).includes('/sync/commands')) {
        posted.push(...(JSON.parse(String(init?.body)) as { commands: PostedCommand[] }).commands);
        await options.held;
      }
      return server.fetchImpl(input, init);
    },
  });
  const data = createSyncedTestData(engine);
  renderScreen(
    <SyncEngineProvider data={data}>
      <OpenCapture />
    </SyncEngineProvider>,
    { value: data },
  );
  return { posted };
}

async function expensesNoted(data: MemoirData, note: string): Promise<number> {
  return (await data.finance.expenses({ range: 'year', search: note })).total;
}

describe('quick capture routing', () => {
  afterEach(() => vi.restoreAllMocks());

  it('should send the previewed category with the expense', async () => {
    const { posted } = renderSynced({ defaultCurrency: 'EUR', enabledCurrencies: ['EUR'], weekStart: 1 });

    await type('coffee 4.20');
    expect(await screen.findByText('Food')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(posted.map(command => command.type)).toEqual(['expense.create']));
    expect(posted[0]?.payload).toMatchObject({ amountMinor: 420, amountText: '4.20', currency: 'EUR', categoryId: 'food', note: 'coffee', source: 'manual' });
  });

  it('should log an expense in the currency of a non-euro account', async () => {
    const { posted } = renderSynced({ defaultCurrency: 'JPY', enabledCurrencies: ['JPY'], weekStart: 1 });

    await type('ramen 1200');
    expect(await screen.findByText('¥1,200')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(posted.map(command => command.type)).toEqual(['expense.create']));
    expect(posted[0]?.payload).toMatchObject({ amountMinor: 1200, currency: 'JPY', categoryId: 'uncat', note: 'ramen' });
  });

  it('should keep the line and report a rejected capture inside the palette rather than over its field', async () => {
    const success = vi.spyOn(toast, 'success');
    const warning = vi.spyOn(toast, 'warning');
    renderSynced(
      { defaultCurrency: 'EUR', enabledCurrencies: ['EUR'], weekStart: 1 },
      { outcomes: batch => batch.commandIds.map(commandId => rejected(commandId, 'Expense not found', 'FIN_003')) },
    );

    const field = await type('coffee 4.20');
    await screen.findByText('Food');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Couldn’t save ‘coffee 4.20’');
    expect(warning).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect((field as HTMLInputElement).value).toBe('coffee 4.20');

    fireEvent.change(field, { target: { value: 'coffee 4.30' } });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('should report a rejection with a toast once the palette no longer shows the line', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>(resolve => (release = resolve));
    const warning = vi.spyOn(toast, 'warning');
    const { posted } = renderSynced(
      { defaultCurrency: 'EUR', enabledCurrencies: ['EUR'], weekStart: 1 },
      { held, outcomes: batch => batch.commandIds.map(commandId => rejected(commandId, 'Expense not found', 'FIN_003')) },
    );

    const field = await type('coffee 4.20');
    await screen.findByText('Food');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    fireEvent.keyDown(field, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('textbox', { name: /Log something/ })).toBeNull());

    release();
    await waitFor(() => expect(warning).toHaveBeenCalledWith(expect.stringContaining('Couldn’t save ‘coffee 4.20’'), undefined));
  });

  it('should not silently replace today’s water from quick capture', async () => {
    const data = createMemoirTestData();
    const dispatch = vi.spyOn(data.quickLogs, 'dispatchCommand');
    const success = vi.spyOn(toast, 'success');
    renderScreen(<OpenCapture />, { value: data });

    await type('2 l');
    expect(await screen.findByText('Today already has 1.4 l of water. Add 2 l to it, or set it to 2 l? Nothing is saved until you pick.')).toBeDefined();
    expect(screen.queryByText(/adds to today/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Set today to 2 l \(replaces 1\.4 l\)/ }));

    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'health.save', key: 'water', value: 2000 }), expect.anything()));
    await waitFor(() => expect(success).toHaveBeenCalledWith('Replaced 1.4 l with 2.0 l.', undefined));
  });

  it('should add a glass to today’s water when Add is picked', async () => {
    const data = createMemoirTestData();
    const dispatch = vi.spyOn(data.quickLogs, 'dispatchCommand');
    renderScreen(<OpenCapture />, { value: data });

    await type('250 ml');
    fireEvent.click(await screen.findByRole('button', { name: /Add 250 ml → 1\.65 l/ }));

    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'health.save', key: 'water', value: 1650 }), expect.anything()));
    const view = await data.quickLogs.health(todayISODate());
    expect(view.metrics.find(item => item.definition.key === 'water')?.entry?.value).toBe(1650);
  });

  it('should say water was added when quick capture adds to today’s value', async () => {
    const success = vi.spyOn(toast, 'success');
    renderScreen(<OpenCapture />, { value: createMemoirTestData() });

    await type('250 ml');
    fireEvent.click(await screen.findByRole('button', { name: /Add 250 ml → 1\.65 l/ }));

    await waitFor(() => expect(success).toHaveBeenCalledWith('Added 250 ml — 1.65 l today.', undefined));
    expect(success).not.toHaveBeenCalledWith(expect.stringContaining('Replaced'), undefined);
  });

  it('should say water was replaced when quick capture sets today’s value', async () => {
    const success = vi.spyOn(toast, 'success');
    renderScreen(<OpenCapture />, { value: createMemoirTestData() });

    await type('250 ml');
    fireEvent.click(await screen.findByRole('button', { name: /Set today to 250 ml \(replaces 1\.4 l\)/ }));

    await waitFor(() => expect(success).toHaveBeenCalledWith('Replaced 1.4 l with 250 ml.', undefined));
  });

  it('should name the metric and its value when a health save is the day’s first', async () => {
    const data = createMemoirTestData();
    const yesterday = new Date(`${todayISODate()}T12:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    const result = await data.quickLogs.dispatchCommand({ type: 'health.save', key: 'water', date: yesterday.toISOString().slice(0, 10), value: 250 });

    expect(result.message).toBe('Water logged: 250 ml.');
  });

  it('should not save water on Enter before a choice is made', async () => {
    const data = createMemoirTestData();
    const dispatch = vi.spyOn(data.quickLogs, 'dispatchCommand');
    renderScreen(<OpenCapture />, { value: data });

    const field = await type('250 ml');
    await screen.findByRole('button', { name: /Add 250 ml/ });
    fireEvent.keyDown(field, { key: 'Enter' });

    await new Promise(resolve => setTimeout(resolve, 20));
    expect(dispatch).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent).toContain('Add 250 ml → 1.65 l');
    expect(screen.getByRole('group', { name: /Today already has 1\.4 l of water/ })).toBeDefined();
  });

  it('should not save water on Enter when adding would pass the daily limit', async () => {
    const data = createMemoirTestData();
    await data.quickLogs.dispatchCommand({ type: 'health.save', key: 'water', date: todayISODate(), value: 9900 });
    const dispatch = vi.spyOn(data.quickLogs, 'dispatchCommand');
    renderScreen(<OpenCapture />, { value: data });

    const field = await type('250 ml');
    const add = await screen.findByRole('button', { name: /Add 250 ml would pass 10 l/ });
    expect(add.getAttribute('aria-disabled')).toBe('true');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(document.activeElement).toBe(add);
    fireEvent.click(add);
    fireEvent.keyDown(add, { key: 'Enter' });

    await new Promise(resolve => setTimeout(resolve, 20));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('should offer Try again instead of checking forever when today’s health log cannot be read', async () => {
    const data = createMemoirTestData();
    const read = data.quickLogs.health.bind(data.quickLogs);
    vi.spyOn(data.quickLogs, 'health').mockRejectedValueOnce(new Error('mirror unreadable')).mockImplementation(read);
    renderScreen(<OpenCapture />, { value: data });

    await type('8000 steps');
    expect(await screen.findByText('Today’s health log couldn’t be read on this device, so this line isn’t saved.')).toBeDefined();
    expect(screen.queryByText('Checking what’s already logged today…')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'Save' })).toBeDefined();
  });

  it('should keep a metric line instead of saving it before the first sync has pulled today’s health log', async () => {
    let release: () => void = () => undefined;
    const pulled = new Promise<void>(resolve => (release = resolve));
    const today = '2026-08-24';
    const water: DeltaPage = page({
      account: [{ defaultCurrency: 'EUR', enabledCurrencies: ['EUR'], weekStart: 1 }],
      metrics: [{ id: '504', name: 'Water', isHealth: true }],
      metric_entries: [{ id: '1', metricId: '504', date: today, value: '1400', source: 'manual', createdAt: `${today}T17:30:00.000Z` }],
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${today}T12:00:00.000Z`));
    try {
      const { engine } = createTestEngine({
        today,
        pages: [water],
        fetchImpl: server => async (input, init) => {
          if (String(input).includes('/sync/delta')) await pulled;
          return server.fetchImpl(input, init);
        },
      });
      const data = createSyncedTestData(engine);
      renderScreen(
        <SyncEngineProvider data={data}>
          <OpenCapture />
        </SyncEngineProvider>,
        { value: data },
      );

      const field = await type('2 l');
      expect(await screen.findByText(/Today’s health log hasn’t loaded on this device yet, so this line can’t be saved/)).toBeDefined();
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
      fireEvent.keyDown(field, { key: 'Enter' });
      expect(await engine.outbox.pending()).toEqual([]);
      expect((field as HTMLInputElement).value).toBe('2 l');

      await act(async () => release());
      expect(await screen.findByText(/Today already has 1\.4 l of water/, undefined, { timeout: 3_000 })).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should keep Save available after midnight while the new day’s health read is still loading', { timeout: 10_000 }, async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 22, 23, 59, 59, 900));
    let release: () => void = () => undefined;
    const newDayRead = new Promise<void>(resolve => (release = resolve));
    try {
      const data = createMemoirTestData({ today: '2026-08-22' });
      const read = data.quickLogs.health.bind(data.quickLogs);
      vi.spyOn(data.quickLogs, 'health').mockImplementation(async date => {
        if (date === '2026-08-23') await newDayRead;
        return read(date);
      });
      renderScreen(<OpenCapture />, { value: data });

      await type('j a thought just before midnight');
      await screen.findByRole('button', { name: 'Save' });
      vi.setSystemTime(new Date(2026, 7, 23, 0, 0, 5));

      expect(await screen.findByText(NEW_DAY_NOTICE, undefined, { timeout: 3_000 })).toBeDefined();
      expect(screen.getByRole('button', { name: 'Save' })).toBeDefined();

      await type('8000 steps');
      expect(await screen.findByText('Checking what’s already logged today…')).toBeDefined();
      release();
      expect(await screen.findByRole('button', { name: 'Save' })).toBeDefined();
    } finally {
      release();
      vi.useRealTimers();
    }
  });

  it('should say a quest already completed today is done and save nothing', async () => {
    const data = createMemoirTestData();
    await data.provider.dispatchCommand({ type: 'quest.complete', occurrenceId: `journal-line:${todayISODate()}` });
    const dispatch = vi.spyOn(data.provider, 'dispatchCommand');
    renderScreen(<OpenCapture />, { value: data });

    const field = await type('done journal a line');
    expect(await screen.findByText(/“Journal a line” is already completed today, so nothing is saved/)).toBeDefined();
    expect(screen.queryByText('Quest completion')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    fireEvent.keyDown(field, { key: 'Enter' });

    await new Promise(resolve => setTimeout(resolve, 20));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('should refuse a quick-capture metric line when the metric catalogue is missing', async () => {
    const success = vi.spyOn(toast, 'success');
    const warning = vi.spyOn(toast, 'warning');
    const { posted } = renderSynced({ defaultCurrency: 'EUR', enabledCurrencies: ['EUR'], weekStart: 1 });

    const field = await type('8000 steps');
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Couldn’t save ‘8000 steps’: Health metrics aren’t set up for this account yet, so this can’t be saved.');
    expect(warning).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect((field as HTMLInputElement).value).toBe('8000 steps');
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(posted).toEqual([]);
  });

  it('should not send a second command when the palette is closed and reopened mid-save', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>(resolve => (release = resolve));
    const { posted } = renderSynced({ defaultCurrency: 'EUR', enabledCurrencies: ['EUR'], weekStart: 1 }, { held });

    const field = await type('coffee 4.20');
    await screen.findByText('Food');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(posted).toHaveLength(1));

    fireEvent.keyDown(field, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('textbox', { name: /Log something/ })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Reopen capture' }));
    const reopened = await type('coffee 4.20');
    const saving = (await screen.findByRole('button', { name: 'Saving…' })) as HTMLButtonElement;
    expect(saving.disabled).toBe(true);
    fireEvent.click(saving);
    fireEvent.keyDown(reopened, { key: 'Enter' });

    release();
    await waitFor(() => expect(screen.queryByRole('textbox', { name: /Log something/ })).toBeNull());
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(posted.map(command => command.type)).toEqual(['expense.create']);
  });

  it('should show the replace warning when the save finds a weight the palette had not read yet', async () => {
    const data = createMemoirTestData();
    await data.quickLogs.dispatchCommand({ type: 'weight.save', date: todayISODate(), kg: 80, confirmedReplacement: true });
    const view = await data.quickLogs.weight();
    vi.spyOn(data.quickLogs, 'weight').mockResolvedValue({ ...view, today: null });
    const dispatch = vi.spyOn(data.quickLogs, 'dispatchCommand');
    renderScreen(<OpenCapture />, { value: data });

    await type('78.4 kg');
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/Today already has 80 kg/)).toBeDefined();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'weight.save', kg: 78.4, confirmedReplacement: false }), expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'weight.save', kg: 78.4, confirmedReplacement: true }), expect.anything()));
  });

  it('should date a line saved after midnight to the new day when the palette was opened the day before', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 22, 23, 59, 50));
    try {
      const data = createMemoirTestData({ today: '2026-08-22' });
      const dispatch = vi.spyOn(data.quickLogs, 'dispatchCommand');
      renderScreen(<OpenCapture />, { value: data });

      await type('8000 steps');
      const save = await screen.findByRole('button', { name: 'Save' });
      vi.setSystemTime(new Date(2026, 7, 23, 0, 0, 5));
      fireEvent.click(save);

      expect(await screen.findByText(NEW_DAY_NOTICE)).toBeDefined();
      expect(dispatch).not.toHaveBeenCalled();

      fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
      await waitFor(() => expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'health.save', key: 'steps', date: '2026-08-23' }), expect.anything()));
    } finally {
      vi.useRealTimers();
    }
  });

  it('should refuse once when the day changes while a line is typed and the device stays awake', { timeout: 10_000 }, async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 22, 23, 59, 59, 900));
    try {
      const data = createMemoirTestData({ today: '2026-08-22' });
      const dispatch = vi.spyOn(data.quickLogs, 'dispatchCommand');
      renderScreen(<OpenCapture />, { value: data });

      await type('8000 steps');
      await screen.findByRole('button', { name: 'Save' });
      vi.setSystemTime(new Date(2026, 7, 23, 0, 0, 5));

      expect(await screen.findByText(NEW_DAY_NOTICE, undefined, { timeout: 3_000 })).toBeDefined();
      fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(dispatch).not.toHaveBeenCalled();
      expect(screen.getByText(NEW_DAY_NOTICE)).toBeDefined();

      fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
      await waitFor(() => expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'health.save', key: 'steps', date: '2026-08-23' }), expect.anything()));
      expect(dispatch).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should re-arm the midnight timer when it fires before the date changes', { timeout: 10_000 }, async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 22, 23, 59, 59, 900));
    try {
      const data = createMemoirTestData({ today: '2026-08-22' });
      const dispatch = vi.spyOn(data.quickLogs, 'dispatchCommand');
      renderScreen(<OpenCapture />, { value: data });

      await type('8000 steps');
      await screen.findByRole('button', { name: 'Save' });
      await new Promise(resolve => setTimeout(resolve, 1_500));
      expect(screen.queryByText(NEW_DAY_NOTICE)).toBeNull();

      vi.setSystemTime(new Date(2026, 7, 23, 0, 0, 5));
      expect(await screen.findByText(NEW_DAY_NOTICE, undefined, { timeout: 3_000 })).toBeDefined();
      expect(dispatch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should move focus to the first reading on Enter when the line could be two things', async () => {
    renderScreen(<OpenCapture />);

    const field = await type('stretch 10');
    await screen.findByText('Side quest');
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(document.activeElement?.textContent).toContain('Quest completion');
  });

  it('should not act on Enter while an input method is composing', async () => {
    const data = createMemoirTestData();
    renderScreen(<OpenCapture />, { value: data });

    const field = await type('lunch 9.50 composing');
    await screen.findByText('Expense');
    fireEvent.keyDown(field, { key: 'Enter', keyCode: 229 });

    await new Promise(resolve => setTimeout(resolve, 20));
    expect(await expensesNoted(data, 'lunch composing')).toBe(0);
  });

  it('should say it is still checking today’s quests instead of ignoring Enter', async () => {
    const data = createMemoirTestData();
    vi.spyOn(data.provider, 'findOccurrences').mockReturnValue(new Promise(() => undefined));
    renderScreen(<OpenCapture />, { value: data });

    const field = await type('lunch 9.50 searching');
    await screen.findByText('Expense');
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(await screen.findByText('Still checking today’s quests. Try again in a moment.')).toBeDefined();
    expect(await expensesNoted(data, 'lunch searching')).toBe(0);
  });

  it('should keep an unrelated journal draft when quick capture saves a journal line', async () => {
    const today = '2026-08-22';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${today}T12:00:00.000Z`));
    const backing = sharedBacking();
    const posted: PostedCommand[] = [];
    try {
      const first = createTestEngine({
        backing,
        today,
        fetchImpl: server => async (input, init) => {
          if (String(input).includes('/sync/commands')) posted.push(...(JSON.parse(String(init?.body)) as { commands: PostedCommand[] }).commands);
          return server.fetchImpl(input, init);
        },
      });
      const firstData = createSyncedTestData(first.engine);
      setQuickLogProvider(firstData.quickLogs);
      const draft = { date: today, text: 'Draft A about the week', mood: null };
      const { unmount } = renderScreen(
        <SyncEngineProvider data={firstData}>
          <JournalScreen />
          <OpenCapture initiallyOpen={false} />
        </SyncEngineProvider>,
        { value: firstData },
      );

      fireEvent.change(await screen.findByLabelText('Journal entry'), { target: { value: draft.text } });
      await waitFor(async () => expect(await first.store.readMeta(SYNC_META_KEYS.journalDraft)).toEqual(draft));

      fireEvent.click(screen.getByRole('button', { name: 'Reopen capture' }));
      await type('j Captured line B');
      fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

      await waitFor(() => expect(posted.map(command => command.type)).toEqual(['journal.save']));
      expect(posted[0]?.payload).toMatchObject({ draft: { text: 'Captured line B' } });
      await waitFor(() => expect(screen.queryByRole('textbox', { name: /Log something/ })).toBeNull());
      expect(await first.store.readMeta(SYNC_META_KEYS.journalDraft)).toEqual(draft);
      unmount();

      const second = createTestEngine({ backing, today });
      const secondData = createSyncedTestData(second.engine);
      setQuickLogProvider(secondData.quickLogs);
      renderScreen(
        <SyncEngineProvider data={secondData}>
          <JournalScreen />
        </SyncEngineProvider>,
        { value: secondData },
      );

      const restored = (await screen.findByLabelText('Journal entry')) as HTMLTextAreaElement;
      await waitFor(() => expect(restored.value).toBe(draft.text));
    } finally {
      setQuickLogProvider(new FixtureQuickLogProvider());
      vi.useRealTimers();
    }
  });

  it('should save once on double click', async () => {
    const data = createMemoirTestData();
    const success = vi.spyOn(toast, 'success');
    renderScreen(<OpenCapture />, { value: data });

    await type('coffee 4.20 double click');
    const save = await screen.findByRole('button', { name: 'Save' });
    fireEvent.click(save);
    fireEvent.click(save);

    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(await expensesNoted(data, 'coffee double click')).toBe(1);
    expect(success).toHaveBeenCalledTimes(1);
  });

  it('should save on Enter', async () => {
    const data = createMemoirTestData();
    const onClose = vi.fn();
    renderScreen(<OpenCapture onClose={onClose} />, { value: data });

    const field = await type('lunch 12.50 on enter');
    await screen.findByText('Expense');
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await expensesNoted(data, 'lunch on enter')).toBe(1);
  });

  it('should open the first destination on Enter when the line only names a screen', async () => {
    const data = createMemoirTestData();
    const { router } = renderScreen(<OpenCapture />, { value: data });

    const field = await type('money');
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() => expect(router.state.location.pathname).toBe('/finance'));
    expect(await expensesNoted(data, 'money')).toBe(0);
  });

  it('should move through the destinations with the arrow keys', async () => {
    renderScreen(<OpenCapture />);

    const field = await captureField();
    field.focus();
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Today' }));

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Planning Board' }));

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(field);
  });

  it('should complete today’s occurrence named after done', async () => {
    renderScreen(<OpenCapture />);

    await type('done Evening stretch');

    expect(await screen.findByText('Quest completion')).toBeDefined();
    expect(screen.getByText('Evening stretch')).toBeDefined();
  });

  it('should explain an unmatched done command with links instead of an empty screen list', async () => {
    renderScreen(<OpenCapture />);

    await type('done xyz');

    expect(await screen.findByText(/Nothing scheduled today is called “xyz”/)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Quests' }).getAttribute('href')).toBe('/quests');
  });
});
