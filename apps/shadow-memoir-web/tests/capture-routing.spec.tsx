import { fireEvent, screen, waitFor } from '@testing-library/react';
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

  it('should keep the line and report a rejected capture instead of announcing it', async () => {
    const success = vi.spyOn(toast, 'success');
    const warning = vi.spyOn(toast, 'warning');
    renderSynced(
      { defaultCurrency: 'EUR', enabledCurrencies: ['EUR'], weekStart: 1 },
      { outcomes: batch => batch.commandIds.map(commandId => rejected(commandId, 'Expense not found', 'FIN_003')) },
    );

    const field = await type('coffee 4.20');
    await screen.findByText('Food');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(warning).toHaveBeenCalledWith(expect.stringContaining('Couldn’t save ‘coffee 4.20’'), undefined));
    expect(success).not.toHaveBeenCalled();
    expect((field as HTMLInputElement).value).toBe('coffee 4.20');
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

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
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
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(dispatch).not.toHaveBeenCalled();
      expect(screen.getByText(NEW_DAY_NOTICE)).toBeDefined();

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
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
