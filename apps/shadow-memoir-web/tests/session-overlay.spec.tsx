import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { NetStrip, SystemOverlayProvider } from '@/features/shell';
import { type NetState, SyncEngineProvider } from '@/lib/sync';

import { renderScreen } from './harness';
import { createSyncedTestData, createTestEngine } from './sync-harness';

const TODAY = '2026-08-24';
const OVERLAY_TITLE = 'Your session ended while you were offline';

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
}

async function stateAfterStatus(status: number): Promise<NetState> {
  const { engine } = createTestEngine({ today: TODAY, status: () => status });
  await engine.start();
  return engine.getSnapshot().state;
}

function renderNetStrip(status: number, initialPath: string): void {
  const { engine } = createTestEngine({ today: TODAY, status: () => status });
  const data = createSyncedTestData(engine);
  renderScreen(
    <SyncEngineProvider data={data}>
      <SystemOverlayProvider>
        <NetStrip />
      </SystemOverlayProvider>
    </SyncEngineProvider>,
    { value: data, initialPath },
  );
}

/**
 * A dead session and a refused request look alike on the wire and are nothing alike to the owner: one is
 * worth a modal, the other is worth a retry. Getting that wrong put a sheet over the onboarding wizard —
 * which the owner cannot leave — on a transient failure.
 */
describe('sync failure classification', () => {
  beforeEach(() => setOnline(true));

  it('should treat only a 401 as a lost session', async () => {
    expect(await stateAfterStatus(401)).toBe('signed-out');
  });

  it.each([403, 429, 500, 503])('should stay in the retry state on a %d', async status => {
    expect(await stateAfterStatus(status)).toBe('failed');
  });

  it('should report a request that never reached the server as offline', async () => {
    const { engine } = createTestEngine({ today: TODAY });
    setOnline(false);
    await engine.start();

    expect(engine.getSnapshot().state).toBe('offline');
  });
});

describe('NetStrip session overlay', () => {
  beforeEach(() => setOnline(true));

  it('should raise the session overlay once the session is gone', async () => {
    renderNetStrip(401, '/');
    expect(await screen.findByText(OVERLAY_TITLE)).toBeDefined();
  });

  it('should leave a refused request to the strip rather than the overlay', async () => {
    renderNetStrip(403, '/');

    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/still waiting/i));
    expect(screen.queryByText(OVERLAY_TITLE)).toBeNull();
  });

  it('should never cover the onboarding flow with the overlay', async () => {
    renderNetStrip(401, '/onboarding');

    await waitFor(() => expect(screen.getByRole('status')).toBeDefined());
    expect(screen.queryByText(OVERLAY_TITLE)).toBeNull();
  });
});
