import { describe, expect, it, mock, spyOn } from 'bun:test';

import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { AppError } from '@shadow-library/common';
import { FakeDatabaseService, InMemoryRedis } from '@shadow-library/modules/testing';

import { AppErrorCode } from '@server/classes';

import { AuthorizationCodeService } from '@server/modules/auth/oauth/authorization-code.service';
import { type RefreshTokenService } from '@server/modules/auth/token';
import { schema } from '@server/modules/infrastructure/datastore';

const CLIENT_ID = 'third-party-app';
const PAYLOAD = {
  clientId: CLIENT_ID,
  redirectUri: 'https://app.example.com/callback',
  codeChallenge: 'challenge',
  codeChallengeMethod: 'S256',
  scope: 'openid',
  userId: '42',
  sessionId: '7',
};

interface Revocation {
  table: unknown;
  values: Record<string, unknown>;
  where: { sql: string; params: unknown[] };
}

function codeStore(options: { revocationFails?: boolean } = {}) {
  let now = Date.now();
  const redis = new InMemoryRedis({ now: () => now });
  const revocations: Revocation[] = [];
  const dialect = new PgDialect();
  const postgres = {
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: SQL) => (revocations.push({ table, values, where: dialect.sqlToQuery(condition) }), Promise.resolve([])),
      }),
    }),
  };
  const revokeForSessionClient = mock<RefreshTokenService['revokeForSessionClient']>(() =>
    options.revocationFails ? Promise.reject(new Error('database down')) : Promise.resolve(),
  );
  const record = mock(() => Promise.resolve());
  const service = new AuthorizationCodeService(new FakeDatabaseService({ postgres, redis }), { revokeForSessionClient } as unknown as RefreshTokenService, { record } as never);
  const advance = (ms: number): void => {
    now += ms;
  };
  return { service, revocations, revokeForSessionClient, record, advance };
}

describe('AuthorizationCodeService replay', () => {
  it('should revoke the refresh families and app sessions a replayed code was redeemed for', async () => {
    const { service, revocations, revokeForSessionClient, record } = codeStore();
    const code = await service.issue(PAYLOAD);

    expect(await service.consume(code)).toMatchObject({ clientId: CLIENT_ID });
    expect(await service.consume(code)).toBeNull();

    expect(revokeForSessionClient).toHaveBeenCalledWith(7n, CLIENT_ID);
    expect(revocations).toHaveLength(1);
    expect(revocations[0]?.table).toBe(schema.appSessions);
    expect(revocations[0]?.values).toMatchObject({ status: 'REVOKED' });
    expect(revocations[0]?.where.sql).toContain('"identity_session_id" = $1');
    expect(revocations[0]?.where.sql).toContain('"client_id" = $2');
    expect(revocations[0]?.where.params).toEqual([7n, CLIENT_ID, 'ACTIVE']);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('should revoke nothing on the first redemption or for a code it never issued', async () => {
    const { service, revocations, revokeForSessionClient } = codeStore();
    const code = await service.issue(PAYLOAD);

    await service.consume(code);
    expect(await service.consume('never-issued')).toBeNull();

    expect(revokeForSessionClient).not.toHaveBeenCalled();
    expect(revocations).toEqual([]);
  });

  it('should treat a code that expired unredeemed as unknown however often it is presented', async () => {
    const { service, revokeForSessionClient, advance } = codeStore();
    const code = await service.issue(PAYLOAD);
    advance(61_000);

    expect(await service.consume(code)).toBeNull();
    expect(await service.consume(code)).toBeNull();
    expect(revokeForSessionClient).not.toHaveBeenCalled();
  });

  it('should still refuse a replay when revoking its grants fails, and log instead of throwing', async () => {
    const { service } = codeStore({ revocationFails: true });
    const error = spyOn(service['logger'], 'error');
    const code = await service.issue(PAYLOAD);
    await service.consume(code);

    expect(await service.consume(code)).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('should make a redeemer that a replay overtook mid-mint revoke what it minted and fail', async () => {
    const { service, revokeForSessionClient } = codeStore();
    const code = await service.issue(PAYLOAD);
    await service.consume(code);
    await service.consume(code);

    expect(AppError.is(await service.assertNotReplayed(code).catch((failure: unknown) => failure), AppErrorCode.OAU_003)).toBe(true);
    expect(revokeForSessionClient).toHaveBeenCalledTimes(2);
  });

  it('should let an untouched redemption finish', async () => {
    const { service, revokeForSessionClient } = codeStore();
    const code = await service.issue(PAYLOAD);
    await service.consume(code);

    expect(await service.assertNotReplayed(code)).toBeUndefined();
    expect(revokeForSessionClient).not.toHaveBeenCalled();
  });
});
