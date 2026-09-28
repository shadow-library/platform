import { describe, expect, it, mock } from 'bun:test';

import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { RefreshTokenReuseError, RefreshTokenService } from '@server/modules/auth/token';
import { schema } from '@server/modules/infrastructure/datastore';

const FAMILY = { id: 'family-1', userId: 42n, sessionId: 7n, clientId: 'third-party-app', scope: 'openid', audience: null, organisationId: 3n, status: 'ACTIVE' };
const PRESENTED = { id: 'token-1', familyId: FAMILY.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 60_000) };

interface Write {
  table: unknown;
  values: Record<string, unknown>;
}

function whereResult(rows: unknown[]): Promise<unknown[]> & { returning: () => Promise<unknown[]> } {
  return Object.assign(Promise.resolve(rows), { returning: () => Promise.resolve(rows) });
}

/** The conditional `ACTIVE → ROTATED` update finds no row when a concurrent rotation of the same token committed first. */
function serviceWhereRotationIs(outcome: 'won' | 'lost') {
  const writes: Write[] = [];
  const update = (table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: () => (writes.push({ table, values }), whereResult(table === schema.refreshTokenFamilies ? [FAMILY] : outcome === 'won' ? [{ id: PRESENTED.id }] : [])),
    }),
  });
  const insert = () => ({ values: () => ({ returning: () => Promise.resolve([{ id: 'token-2' }]) }) });
  const postgres = {
    query: {
      refreshTokens: { findFirst: () => Promise.resolve(PRESENTED) },
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
  return { service, writes, revokeSession };
}

describe('RefreshTokenService rotation', () => {
  it('should treat losing a concurrent rotation as reuse and revoke the family and its session', async () => {
    const { service, writes, revokeSession } = serviceWhereRotationIs('lost');

    expect(await service.rotate('stolen-secret').catch((error: unknown) => error)).toBeInstanceOf(RefreshTokenReuseError);

    expect(writes.find(write => write.table === schema.refreshTokenFamilies)?.values).toMatchObject({ status: 'REVOKED', revokeReason: 'ROTATION_REUSE' });
    expect(revokeSession).toHaveBeenCalledWith(FAMILY.sessionId, 'TERMINATED');
  });

  it('should rotate without revoking anything when it wins', async () => {
    const { service, writes, revokeSession } = serviceWhereRotationIs('won');

    expect((await service.rotate('legitimate-secret')).familyId).toBe(FAMILY.id);

    expect(writes.some(write => write.table === schema.refreshTokenFamilies)).toBe(false);
    expect(revokeSession).not.toHaveBeenCalled();
  });
});
