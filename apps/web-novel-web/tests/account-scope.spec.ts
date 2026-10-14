import { describe, expect, it } from 'bun:test';

import { shouldReconcileAccount } from '@/lib/offline';

describe('shouldReconcileAccount', () => {
  it('should never decide on a session hydrated from the precached shell', () => {
    for (const accessMode of ['public', 'private'] as const) {
      expect(shouldReconcileAccount({ fetchedThisPage: false, accountId: 'reader-a', accessMode })).toBe(false);
      expect(shouldReconcileAccount({ fetchedThisPage: false, accountId: null, accessMode })).toBe(false);
    }
  });

  it('should reconcile a signed-in reader this page fetched in either mode', () => {
    expect(shouldReconcileAccount({ fetchedThisPage: true, accountId: 'reader-b', accessMode: 'public' })).toBe(true);
    expect(shouldReconcileAccount({ fetchedThisPage: true, accountId: 'reader-b', accessMode: 'private' })).toBe(true);
  });

  it('should treat a signed-out read on a public deployment as a guest taking over the device', () => {
    expect(shouldReconcileAccount({ fetchedThisPage: true, accountId: null, accessMode: 'public' })).toBe(true);
  });

  it('should not purge on a private deployment when the session merely expired', () => {
    expect(shouldReconcileAccount({ fetchedThisPage: true, accountId: null, accessMode: 'private' })).toBe(false);
  });
});
