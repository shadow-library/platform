import { beforeEach, describe, expect, it, mock } from 'bun:test';

import { setConfig } from '@shadow-library/common/testing';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { RefreshTokenRaceError, RefreshTokenReuseError, RefreshTokenService } from '@server/modules/auth/token';
import { schema } from '@server/modules/infrastructure/datastore';

const CLIENT_ID = 'third-party-app';
const FAMILY = { id: 'family-1', userId: 42n, sessionId: 7n, clientId: CLIENT_ID, scope: 'openid', audience: null, organisationId: 3n, status: 'ACTIVE' };
const GRACE_MS = 2000;

interface Write {
  table: unknown;
  values: Record<string, unknown>;
}

interface Scenario {
  /** The conditional `ACTIVE → ROTATED` update finds no row when a concurrent rotation of the same token committed first. */
  rotation?: 'won' | 'lost';
  presented?: { status: 'ACTIVE' | 'ROTATED'; rotatedAgoMs?: number };
}

function whereResult(rows: unknown[]): Promise<unknown[]> & { returning: () => Promise<unknown[]> } {
  return Object.assign(Promise.resolve(rows), { returning: () => Promise.resolve(rows) });
}

function rotationService({ rotation = 'won', presented = { status: 'ACTIVE' } }: Scenario = {}) {
  const token = {
    id: 'token-1',
    familyId: FAMILY.id,
    status: presented.status,
    rotatedAt: presented.rotatedAgoMs === undefined ? null : new Date(Date.now() - presented.rotatedAgoMs),
    expiresAt: new Date(Date.now() + 60_000),
  };
  const writes: Write[] = [];
  const update = (table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: () => (writes.push({ table, values }), whereResult(table === schema.refreshTokenFamilies ? [FAMILY] : rotation === 'won' ? [{ id: token.id }] : [])),
    }),
  });
  const insert = () => ({ values: () => ({ returning: () => Promise.resolve([{ id: 'token-2' }]) }) });
  const postgres = {
    query: {
      refreshTokens: { findFirst: () => Promise.resolve(token) },
      refreshTokenFamilies: { findFirst: () => Promise.resolve(FAMILY) },
    },
    update,
    transaction: (work: (tx: unknown) => Promise<unknown>) => work({ update, insert }),
  };

  const revokeSession = mock(() => Promise.resolve());
  const service = new RefreshTokenService(
    new FakeDatabaseService({ postgres }),
    { revoke: revokeSession } as never,
    { record: () => Promise.resolve() } as never,
    { resolve: () => Promise.resolve(3600) } as never,
  );
  const familyRevoked = (): boolean => writes.some(write => write.table === schema.refreshTokenFamilies && write.values['revokeReason'] === 'ROTATION_REUSE');
  return { service, familyRevoked, revokeSession };
}

describe('RefreshTokenService rotation', () => {
  beforeEach(() => setConfig({ 'auth.refresh-token.reuse-grace-ms': GRACE_MS }));

  it('should rotate without revoking anything when it wins', async () => {
    const { service, familyRevoked, revokeSession } = rotationService();

    expect((await service.rotate('legitimate-secret', { expectedClientId: CLIENT_ID })).familyId).toBe(FAMILY.id);
    expect(familyRevoked()).toBe(false);
    expect(revokeSession).not.toHaveBeenCalled();
  });

  it("should refuse the family's own client losing a concurrent rotation without revoking the family", async () => {
    const { service, familyRevoked, revokeSession } = rotationService({ rotation: 'lost' });

    expect(await service.rotate('duplicate-secret', { expectedClientId: CLIENT_ID }).catch((error: unknown) => error)).toBeInstanceOf(RefreshTokenRaceError);
    expect(familyRevoked()).toBe(false);
    expect(revokeSession).not.toHaveBeenCalled();
  });

  it('should refuse a same-client duplicate of a token rotated inside the grace window without revoking the family', async () => {
    const { service, familyRevoked } = rotationService({ presented: { status: 'ROTATED', rotatedAgoMs: 500 } });

    expect(await service.rotate('duplicate-secret', { expectedClientId: CLIENT_ID }).catch((error: unknown) => error)).toBeInstanceOf(RefreshTokenRaceError);
    expect(familyRevoked()).toBe(false);
  });

  it('should treat a duplicate outside the grace window as reuse and revoke the family and its session', async () => {
    const { service, familyRevoked, revokeSession } = rotationService({ presented: { status: 'ROTATED', rotatedAgoMs: GRACE_MS + 1000 } });

    expect(await service.rotate('replayed-secret', { expectedClientId: CLIENT_ID }).catch((error: unknown) => error)).toBeInstanceOf(RefreshTokenReuseError);
    expect(familyRevoked()).toBe(true);
    expect(revokeSession).toHaveBeenCalledWith(FAMILY.sessionId, 'TERMINATED');
  });

  it('should treat a duplicate inside the grace window from another client as reuse', async () => {
    const { service, familyRevoked } = rotationService({ presented: { status: 'ROTATED', rotatedAgoMs: 500 } });

    expect(await service.rotate('stolen-secret', { expectedClientId: 'other-app' }).catch((error: unknown) => error)).toBeInstanceOf(RefreshTokenReuseError);
    expect(familyRevoked()).toBe(true);
  });

  it('should treat losing a concurrent rotation as reuse when no client is bound to the call', async () => {
    const { service, familyRevoked, revokeSession } = rotationService({ rotation: 'lost' });

    expect(await service.rotate('stolen-secret').catch((error: unknown) => error)).toBeInstanceOf(RefreshTokenReuseError);
    expect(familyRevoked()).toBe(true);
    expect(revokeSession).toHaveBeenCalledWith(FAMILY.sessionId, 'TERMINATED');
  });
});
