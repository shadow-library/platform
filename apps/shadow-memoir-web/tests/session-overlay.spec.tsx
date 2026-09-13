import { type QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NetStrip, SystemOverlayProvider } from '@/features/shell';
import { sessionQueryOptions } from '@/lib/apis';
import { confirmSessionAccount, useSessionGuard } from '@/lib/session';
import { type NetState, SyncEngineProvider } from '@/lib/sync';

import { renderScreen } from './harness';
import { createSyncedTestData, createTestEngine, sharedMarker } from './sync-harness';

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

    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/couldn't reach/i));
    expect(screen.queryByText(OVERLAY_TITLE)).toBeNull();
  });

  it('should never cover the onboarding flow with the overlay', async () => {
    renderNetStrip(401, '/onboarding');

    await waitFor(() => expect(screen.getByRole('status')).toBeDefined());
    expect(screen.queryByText(OVERLAY_TITLE)).toBeNull();
  });
});

function GuardStatus(): ReactElement {
  return <output aria-label="Session guard">{useSessionGuard()}</output>;
}

describe('session principal check', () => {
  beforeEach(() => setOnline(true));
  afterEach(() => vi.unstubAllGlobals());

  it('should keep the signed-out overlay and not redirect when the principal check returns 401', async () => {
    const sessionRequests: string[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      sessionRequests.push(String(input));
      return new Response(JSON.stringify({ code: 'IAM_001', message: 'Authentication required' }), { status: 401, headers: { 'content-type': 'application/json' } });
    });
    const shell: { client?: QueryClient } = {};
    const { engine } = createTestEngine({ today: TODAY, accountId: 'usr_A', marker: sharedMarker(), principal: () => confirmSessionAccount(shell.client as QueryClient) });
    const data = createSyncedTestData(engine);
    shell.client = data.queryClient;
    const sessionKey = sessionQueryOptions().queryKey;
    data.queryClient.setQueryData(sessionKey, { sub: 'usr_A', scopes: [] });

    renderScreen(
      <SyncEngineProvider data={data}>
        <SystemOverlayProvider>
          <NetStrip />
          <GuardStatus />
        </SystemOverlayProvider>
      </SyncEngineProvider>,
      { value: data },
    );

    expect(await screen.findByText(OVERLAY_TITLE)).toBeDefined();
    expect(sessionRequests.some(url => url.includes('/session'))).toBe(true);
    expect(engine.getSnapshot().state).toBe('signed-out');
    expect(data.queryClient.getQueryState(sessionKey)?.status).toBe('success');
    expect(data.queryClient.getQueryData(sessionKey)).toMatchObject({ sub: 'usr_A' });
    expect(screen.getByLabelText('Session guard').textContent).toBe('authenticated');
  });
});
