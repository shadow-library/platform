import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { type ReactElement, useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QuickCapture, type SystemOverlayKind, SystemOverlayProvider, useSystemOverlays } from '@/features/shell';

import { type MemoirData } from '@/lib/data';

import { createMemoirTestData, renderScreen } from './harness';

function OpenOnMount({ kind }: { kind: SystemOverlayKind }): ReactElement {
  const overlays = useSystemOverlays();
  useEffect(() => overlays.open(kind), [overlays, kind]);
  return <span />;
}

function renderOverlay(kind: SystemOverlayKind, value?: MemoirData): void {
  renderScreen(
    <SystemOverlayProvider>
      <OpenOnMount kind={kind} />
    </SystemOverlayProvider>,
    { value },
  );
}

function OpenerButton({ kind }: { kind: SystemOverlayKind }): ReactElement {
  const overlays = useSystemOverlays();
  return (
    <button type="button" onClick={() => overlays.open(kind)}>
      Open
    </button>
  );
}

function renderOverlayWithTrigger(kind: SystemOverlayKind, value?: MemoirData): void {
  renderScreen(
    <SystemOverlayProvider>
      <OpenerButton kind={kind} />
    </SystemOverlayProvider>,
    { value },
  );
}

const VALUE_DELIVERED_KEY = 'shadow-memoir:value-delivered';
const OFFER_SETTLED_KEY = 'shadow-memoir:install-offer-settled';

function raiseInstallPrompt(): void {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: () => Promise.resolve(),
    userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
  });
  act(() => void window.dispatchEvent(event));
}

function OpenCaptureButton(): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open capture
      </button>
      <QuickCapture open={open} onOpenChange={setOpen} />
    </>
  );
}

function stubTouchViewport(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(max-width: 639px)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe('system overlays', () => {
  it('should say nothing has arrived rather than list invented notifications', async () => {
    renderOverlay('notifications');
    expect(await screen.findByText(/Nothing has arrived here yet/)).toBeDefined();
    expect(screen.queryByText(/Your coaching result is ready/)).toBeNull();
    expect(screen.queryByText(/A subscription renews tomorrow/)).toBeNull();
  });

  it('should list the queue the account provider reports rather than a hard-coded one', async () => {
    const data = createMemoirTestData();
    const queue = (await data.account.getAppSync()).queue;
    renderOverlay('session-expired', data);

    for (const entry of queue) expect(await screen.findByText(entry.text)).toBeDefined();
    expect(screen.queryAllByRole('listitem')).toHaveLength(queue.length);
  });

  it('should return focus to the opener when an overlay closes', async () => {
    renderOverlayWithTrigger('update');

    const trigger = await screen.findByRole('button', { name: 'Open' });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.click(await screen.findByRole('button', { name: 'Done' }));

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('should return focus to the opener on Escape', async () => {
    renderOverlayWithTrigger('update');

    const trigger = await screen.findByRole('button', { name: 'Open' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

describe('install offer', () => {
  afterEach(() => window.localStorage.clear());

  it('should not spend the install offer from the preview', async () => {
    window.localStorage.setItem(VALUE_DELIVERED_KEY, '1');
    renderOverlay('install-preview');

    expect(await screen.findByText('What installing looks like')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(screen.queryByText('What installing looks like')).toBeNull());
    expect(window.localStorage.getItem(OFFER_SETTLED_KEY)).toBeNull();
  });

  it('should not spend the install offer when the browser has no prompt to show', async () => {
    window.localStorage.setItem(VALUE_DELIVERED_KEY, '1');
    renderOverlay('install');

    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));

    await waitFor(() => expect(screen.queryByText('Keep Shadow Memoir a tap away')).toBeNull());
    expect(window.localStorage.getItem(OFFER_SETTLED_KEY)).toBeNull();
  });

  it('should settle the install offer on Not now', async () => {
    window.localStorage.setItem(VALUE_DELIVERED_KEY, '1');
    renderOverlayWithTrigger('notifications');
    await screen.findByRole('button', { name: 'Open' });

    raiseInstallPrompt();
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));

    await waitFor(() => expect(screen.queryByText('Keep Shadow Memoir a tap away')).toBeNull());
    expect(window.localStorage.getItem(OFFER_SETTLED_KEY)).toBe('1');

    raiseInstallPrompt();
    expect(screen.queryByText('Keep Shadow Memoir a tap away')).toBeNull();
  });

  it('should settle the install offer when the sheet is closed with Escape', async () => {
    window.localStorage.setItem(VALUE_DELIVERED_KEY, '1');
    renderOverlayWithTrigger('notifications');
    await screen.findByRole('button', { name: 'Open' });

    raiseInstallPrompt();
    expect(await screen.findByText('Keep Shadow Memoir a tap away')).toBeDefined();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    await waitFor(() => expect(screen.queryByText('Keep Shadow Memoir a tap away')).toBeNull());
    expect(window.localStorage.getItem(OFFER_SETTLED_KEY)).toBe('1');
  });

  it('should not take over an overlay that is already open', async () => {
    window.localStorage.setItem(VALUE_DELIVERED_KEY, '1');
    renderOverlayWithTrigger('notifications');
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
    expect(await screen.findByText(/Nothing has arrived here yet/)).toBeDefined();

    raiseInstallPrompt();

    expect(screen.queryByText('Keep Shadow Memoir a tap away')).toBeNull();
    expect(screen.getByText(/Nothing has arrived here yet/)).toBeDefined();
    expect(window.localStorage.getItem(OFFER_SETTLED_KEY)).toBeNull();
  });
});

describe('update overlay', () => {
  it('should say the app is up to date when no update is waiting', async () => {
    renderOverlay('update');

    expect(await screen.findByText('You’re up to date')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Reload now' })).toBeNull();
  });
});

describe('notifications overlay', () => {
  it('should describe notification categories from settings', async () => {
    const data = createMemoirTestData();
    await data.account.dispatchCommand({ type: 'notification.set', preferenceId: 'weeklyDigest', enabled: true });
    renderOverlay('notifications', data);

    const categories = within(await screen.findByRole('region', { name: 'By email' }));
    expect((await categories.findByText('Weekly review')).nextElementSibling?.textContent).toBe('On');
    expect(categories.getByText('Coaching result ready').nextElementSibling?.textContent).toBe('Off');
    expect(screen.queryByText(/push/i)).toBeNull();
    expect(screen.queryByText(/starts off/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Notification preferences' })).toBeDefined();
  });
});

describe('overlay snap points', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('should use the content snap by default on phone', async () => {
    stubTouchViewport();
    renderOverlayWithTrigger('notifications');

    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));

    const sheet = (await screen.findByText(/Nothing has arrived here yet/)).closest('[data-snap]');
    expect(sheet?.getAttribute('data-snap')).toBe('content');
  });
});

describe('quick capture', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('should focus the capture input on open', async () => {
    renderScreen(<OpenCaptureButton />);

    const trigger = await screen.findByRole('button', { name: 'Open capture' });
    trigger.focus();
    fireEvent.click(trigger);

    const field = await screen.findByRole('textbox', { name: /Log something/ });
    await waitFor(() => expect(document.activeElement).toBe(field));
  });

  it('should show a close control in the capture sheet on phone', async () => {
    stubTouchViewport();
    renderScreen(<OpenCaptureButton />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open capture' }));

    expect(await screen.findByRole('button', { name: 'Close' })).toBeDefined();
  });
});
