import { fireEvent, screen, waitFor } from '@testing-library/react';
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

    fireEvent.click(await screen.findByRole('button', { name: 'Later' }));

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
