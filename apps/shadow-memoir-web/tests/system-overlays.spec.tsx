import { screen } from '@testing-library/react';
import { type ReactElement, useEffect } from 'react';
import { describe, expect, it } from 'vitest';

import { type SystemOverlayKind, SystemOverlayProvider, useSystemOverlays } from '@/features/shell';

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
});
