import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { toast } from '@shadow-library/ui';

import { DeleteAccountScreen, ErasureStartedScreen, SettingsScreen, toErasureDeviceState } from '@/features/settings';
import { DELETION_PROGRESS_COPY, DELETION_TERMS, DELETION_UNEXPECTED, DELETION_WRONG_ACCOUNT } from '@/lib/data';
import { type AccountMarker, type KeyValueBacking, type MemoirStore, SyncedAccountProvider } from '@/lib/sync';

import { renderScreen } from './harness';
import { type HttpFake, httpFake, type HttpReply } from './http-fake';
import { createSyncedTestData, createTestEngine, sharedBacking, sharedMarker } from './sync-harness';

const TODAY = '2026-08-22';
const ACCOUNT = 'account-a';
const DELETION = '/api/v1/account/deletion';
const STEP_UP: HttpReply = { status: 403, body: { code: 'IAM_003', type: 'Forbidden', message: 'Step-up authentication required' } };
const SIGNED_OUT: HttpReply = { status: 401, body: { code: 'IAM_001', type: 'Unauthorized', message: 'no session' } };

interface DeletionServer {
  fake: HttpFake;
  state: { elevated: boolean; deletionState: string };
}

interface ServerOptions {
  elevated?: boolean;
  start?: () => Promise<HttpReply>;
  email?: string;
}

function deletionServer(options: ServerOptions = {}): DeletionServer {
  const state = { elevated: options.elevated ?? true, deletionState: 'none' };
  const fake = httpFake({
    'GET /api/auth/userinfo': () => (options.email ? { body: { sub: ACCOUNT, email: options.email } } : { status: 404, body: {} }),
    [`GET ${DELETION}`]: () => (state.deletionState === 'none' && !state.elevated ? STEP_UP : { body: { deletionState: state.deletionState } }),
    [`POST ${DELETION}`]: async () => {
      if (!state.elevated) return STEP_UP;
      if (options.start) return options.start();
      state.deletionState = 'pending';
      return { status: 202, body: { deletionState: 'pending' } };
    },
  });
  return { fake, state };
}

interface RenderOptions {
  backing?: KeyValueBacking;
  marker?: AccountMarker;
  accountId?: string;
  principal?: (() => Promise<string>) | null;
}

interface RenderedDelete {
  store: MemoirStore;
  backing: KeyValueBacking;
  unmount: () => void;
}

function renderDelete(options: RenderOptions = {}): RenderedDelete {
  const backing = options.backing ?? sharedBacking();
  const accountId = options.accountId ?? ACCOUNT;
  const { engine, store } = createTestEngine({ today: TODAY, backing, marker: options.marker ?? sharedMarker(), accountId });
  store.open();
  const principal = options.principal === null ? undefined : (options.principal ?? (() => Promise.resolve(accountId)));
  const { unmount } = renderScreen(<DeleteAccountScreen />, { value: createSyncedTestData(engine, principal), initialPath: '/settings/delete' });
  return { store, backing, unmount };
}

async function continueToConfirmation(): Promise<void> {
  for (const box of await screen.findAllByRole('checkbox')) fireEvent.click(box);
  const button = screen.getByRole('button', { name: 'Continue to confirmation' }) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
}

async function confirmInDialog(): Promise<void> {
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.change(within(dialog).getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete everything' }));
}

function stubLocationReplace(): ReturnType<typeof vi.fn> {
  const original = window.location;
  const replace = vi.fn();
  Object.defineProperty(window, 'location', { configurable: true, writable: true, value: { ...original, pathname: '/settings/delete', replace } });
  onTestFinished(() => void Object.defineProperty(window, 'location', { configurable: true, writable: true, value: original }));
  return replace;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Account deletion flow', () => {
  it('should not schedule deletion before the owner confirms', async () => {
    const { fake } = deletionServer({ email: 'owner@memoir.test' });
    const replace = stubLocationReplace();
    const { store, backing } = renderDelete();
    await continueToConfirmation();

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete all your data now?' });
    await waitFor(() => expect(within(dialog).getByText(/for owner@memoir\.test, then asks Shadow to close that Shadow account/)).toBeDefined());
    expect(within(dialog).getByText(/erases quests and history, hero and progression, money, journal, body and health, and coaching results/)).toBeDefined();
    expect(within(dialog).getByText(/signing in to any Shadow app with it stops working/)).toBeDefined();
    expect(within(dialog).getByText(/starts today, 22 Aug 2026, the moment you confirm, and it cannot be stopped or undone/)).toBeDefined();
    expect((within(dialog).getByRole('button', { name: 'Delete everything' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep my data' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(await screen.findByRole('heading', { name: 'Confirm the erasure' })).toBeDefined();
    expect(fake.count('POST', DELETION)).toBe(0);
    expect((await backing.keys()).some(key => key.includes('deletion-flow'))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Delete everything…' }));
    await confirmInDialog();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/erasure?device=removed'));
    expect(fake.count('POST', DELETION)).toBe(1);
    expect((await backing.keys()).filter(key => key.startsWith(`acct:${ACCOUNT}:`) && !key.endsWith(':meta:device-id'))).toEqual([]);
    await expect(store.readMeta('cursor')).rejects.toThrow('closed');
  });

  it('should restore the acknowledged step after step-up', async () => {
    const backing = sharedBacking();
    const marker = sharedMarker();
    const { fake, state } = deletionServer({ elevated: false });
    renderDelete({ backing, marker });
    await continueToConfirmation();

    expect(await screen.findByRole('heading', { name: 'Confirm it is you, on your Shadow account' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Continue on your Shadow account' }).getAttribute('href')).toBe('/api/auth/step-up?return_to=%2Fsettings%2Fdelete');
    cleanup();

    renderDelete({ backing, marker });
    expect(await screen.findByRole('heading', { name: 'Confirm it is you, on your Shadow account' })).toBeDefined();
    cleanup();

    state.elevated = true;
    renderDelete({ backing, marker });
    expect(await screen.findByRole('heading', { name: 'Confirm the erasure' })).toBeDefined();
    expect(fake.count('POST', DELETION)).toBe(0);
  });

  it('should send one deletion request per confirmation', async () => {
    let answer: (reply: HttpReply) => void = () => undefined;
    const { fake } = deletionServer({ start: () => new Promise(resolve => (answer = resolve)) });
    renderDelete();
    await continueToConfirmation();

    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });
    const confirm = within(dialog).getByRole('button', { name: 'Delete everything' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    const pending = (await screen.findByRole('button', { name: 'Starting the erasure…' })) as HTMLButtonElement;
    expect(pending.getAttribute('aria-busy')).toBe('true');
    expect(pending.disabled).toBe(true);
    fireEvent.click(pending);
    expect(fake.count('POST', DELETION)).toBe(1);

    answer({ status: 500, body: { code: 'S999', type: 'InternalServerError', message: 'Unknown Error' } });
    expect(await screen.findByText('The erasure did not start')).toBeDefined();
    expect(screen.getByText('The erasure could not be started.')).toBeDefined();
    expect(screen.queryByText('Unknown Error')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    const retry = await screen.findByRole('alertdialog');
    expect((within(retry).getByLabelText('Type DELETE to confirm') as HTMLInputElement).value).toBe('');
    expect(fake.count('POST', DELETION)).toBe(1);
  });

  it('should show a start answered by a sign-out as possibly under way', async () => {
    let sent = false;
    httpFake({
      [`GET ${DELETION}`]: () => (sent ? SIGNED_OUT : { body: { deletionState: 'none' } }),
      [`POST ${DELETION}`]: () => ((sent = true), SIGNED_OUT),
    });
    renderDelete();
    await continueToConfirmation();
    await confirmInDialog();

    expect(await screen.findByRole('heading', { name: 'We couldn’t confirm whether the erasure started' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeDefined();
    expect(screen.queryByText('The erasure did not start')).toBeNull();
  });

  it('should tell the owner the tab changed account even after the screen is rebuilt for it', async () => {
    const warning = vi.spyOn(toast, 'warning');
    const { fake } = deletionServer();
    const rendered = { unmount: (): void => undefined };
    const probe = async (): Promise<string> => {
      rendered.unmount();
      return 'account-b';
    };
    rendered.unmount = renderDelete({ principal: probe }).unmount;
    await continueToConfirmation();
    await confirmInDialog();

    await waitFor(() => expect(warning).toHaveBeenCalledWith(DELETION_WRONG_ACCOUNT));
    expect(screen.queryByRole('heading', { name: 'Confirm the erasure' })).toBeNull();
    expect(fake.count('POST', DELETION)).toBe(0);
  });

  it('should explain a device failure with a retry instead of failing silently', async () => {
    const { fake } = deletionServer();
    renderDelete({ principal: null });
    await continueToConfirmation();
    await confirmInDialog();

    expect(await screen.findByText(DELETION_UNEXPECTED)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
    expect(fake.count('POST', DELETION)).toBe(0);
  });

  it('should explain the started erasure on a page that needs no session', async () => {
    const fake = httpFake({});
    renderScreen(<ErasureStartedScreen device="removed" />, { today: TODAY });

    expect(await screen.findByRole('heading', { name: 'Your data is being erased' })).toBeDefined();
    expect(screen.getByText(/Shadow is asked to close your Shadow account/)).toBeDefined();
    expect(screen.getByText(/The copy on this device has already been removed/)).toBeDefined();
    expect(fake.calls).toHaveLength(0);
  });

  it('should tell the owner to sign out when this device’s copy could not be removed', async () => {
    renderScreen(<ErasureStartedScreen device="kept" />, { today: TODAY });

    expect(await screen.findByText(/couldn’t be removed — sign out on this device to clear it/)).toBeDefined();
    expect(screen.queryByText(/already been removed/)).toBeNull();
    cleanup();

    renderScreen(<ErasureStartedScreen device={toErasureDeviceState('anything')} />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Your data is being erased' })).toBeDefined();
    expect(document.body.textContent).not.toMatch(/already been removed|couldn’t be removed/);
  });

  it('should describe deletion states in words', async () => {
    for (const deletionState of ['pending', 'blobs_deleted', 'data_deleted', 'identity_closed', 'done'] as const) {
      const { state } = deletionServer();
      state.deletionState = deletionState;
      renderDelete();

      expect(await screen.findByRole('heading', { name: DELETION_PROGRESS_COPY[deletionState].title })).toBeDefined();
      expect(screen.getByText(DELETION_PROGRESS_COPY[deletionState].body)).toBeDefined();
      expect(document.body.textContent).not.toMatch(/blobs[ _]deleted|data[ _]deleted|identity[ _]closed|grace period|you can stop it/i);
      expect(screen.queryByText('Lighter options')).toBeNull();
      expect(screen.queryByRole('checkbox')).toBeNull();
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  it('should confirm before stopping and report it', async () => {
    const success = vi.spyOn(toast, 'success');
    deletionServer({ elevated: false });
    renderDelete();
    await continueToConfirmation();

    fireEvent.click(await screen.findByRole('button', { name: 'Stop here' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Stop deleting your data?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep going' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByRole('heading', { name: 'Confirm it is you, on your Shadow account' })).toBeDefined();
    expect(success).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Stop here' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Stop here' }));

    await waitFor(() => expect(success).toHaveBeenCalledWith('Stopped. Nothing was started and nothing was erased.', undefined));
    expect(await screen.findByRole('heading', { name: 'What would be erased' })).toBeDefined();
    for (const box of screen.getAllByRole('checkbox')) expect(box.getAttribute('aria-checked')).toBe('false');
  });

  it('should show the same deletion terms on settings and delete', async () => {
    renderScreen(<SettingsScreen />, { today: TODAY });
    expect(await screen.findByText(DELETION_TERMS)).toBeDefined();
    cleanup();

    renderScreen(<DeleteAccountScreen />, { today: TODAY });
    expect(await screen.findByText(DELETION_TERMS)).toBeDefined();
    expect(document.body.textContent).not.toMatch(/grace period|thirty-day/i);
  });

  it("should not restore another account's deletion step", async () => {
    deletionServer();
    const backing = sharedBacking();
    const marker = sharedMarker();

    const a = createTestEngine({ today: TODAY, backing, marker, accountId: ACCOUNT });
    a.store.open();
    const first = new SyncedAccountProvider(a.engine);
    for (const item of (await first.getDeletion()).acknowledgements) await first.dispatchCommand({ type: 'deletion.acknowledge', acknowledgementId: item.id, acknowledged: true });
    await first.dispatchCommand({ type: 'deletion.continue' });
    expect((await first.getDeletion()).stage).toEqual({ kind: 'confirm' });
    a.store.close();

    renderDelete({ backing, marker, accountId: 'account-b' });
    expect(await screen.findByRole('heading', { name: 'What would be erased' })).toBeDefined();
    for (const box of screen.getAllByRole('checkbox')) expect(box.getAttribute('aria-checked')).toBe('false');
  });

  it('should forget the deletion step when the account is wiped', async () => {
    deletionServer();
    const backing = sharedBacking();
    const marker = sharedMarker();

    const before = createTestEngine({ today: TODAY, backing, marker, accountId: ACCOUNT });
    before.store.open();
    await new SyncedAccountProvider(before.engine).dispatchCommand({ type: 'deletion.acknowledge', acknowledgementId: 'permanent', acknowledged: true });
    await before.store.wipeAccount();

    const after = createTestEngine({ today: TODAY, backing, marker, accountId: ACCOUNT });
    after.store.open();
    expect((await new SyncedAccountProvider(after.engine).getDeletion()).acknowledged).toEqual([]);
  });
});
