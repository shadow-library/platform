import { describe, expect, it } from 'bun:test';
import { ApiError } from '@shadow-library/web';

import { type NetState, SyncTransportError, toSyncFailureReason } from '@/lib/sync';

import { createTestEngine } from './sync-harness';

const TODAY = '2026-08-24';

async function stateAfterStatus(status: number): Promise<NetState> {
  const { engine } = createTestEngine({ today: TODAY, status: () => status });
  await engine.start();
  return engine.getSnapshot().state;
}

describe('toSyncFailureReason', () => {
  it('should read a deletion-in-progress refusal by its error code, not the HTTP status', () => {
    const deletion = new ApiError(403, { code: 'ACC_002', type: 'Forbidden', message: 'refused' });
    expect(toSyncFailureReason(deletion, true)).toBe('deletion-pending');
    expect(toSyncFailureReason(new SyncTransportError('deletion-pending', 403, 'refused', 'ACC_002'), true)).toBe('deletion-pending');
  });

  it('should leave an expired session to the session overlay rather than a retry', () => {
    const expired = new ApiError(401, { code: 'IAM_001', type: 'Unauthorized', message: 'expired' });
    expect(toSyncFailureReason(expired, true)).toBe('signed-out');
  });

  it('should call a network error offline only while the browser also reports no connection', () => {
    const network = new ApiError(-1, { code: 'NETWORK_ERROR', type: 'NetworkError', message: 'Unable to reach the server' });
    expect(toSyncFailureReason(network, false)).toBe('offline');
    expect(toSyncFailureReason(network, true)).toBe('server');
  });

  it('should fall back to server for an error the sync layer does not recognise', () => {
    expect(toSyncFailureReason(new Error('boom'), true)).toBe('server');
  });
});

/**
 * A dead session and a refused request look alike on the wire and are nothing alike to the owner: one is
 * worth a modal, the other is worth a retry. Getting that wrong put a sheet over the onboarding wizard —
 * which the owner cannot leave — on a transient failure. `sync-readiness.spec.ts` already covers 401
 * (signed-out) and offline-without-a-connection over a booting engine; this covers the retry-worthy HTTP
 * statuses `classify()` also has to route to `'server'`, which only a live `SyncEngine` boot exercises.
 */
describe('sync failure classification (via SyncEngine)', () => {
  it.each([403, 429, 503])('should stay in the retry state on a %d', async (status: number) => {
    expect(await stateAfterStatus(status)).toBe('failed');
  });
});
