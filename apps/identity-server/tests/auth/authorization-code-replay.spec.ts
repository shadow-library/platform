import { describe, expect, it, mock } from 'bun:test';

import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { FakeDatabaseService, InMemoryRedis } from '@shadow-library/modules/testing';

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

function codeStore() {
  const revocations: Revocation[] = [];
  const dialect = new PgDialect();
  const postgres = {
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: SQL) => (revocations.push({ table, values, where: dialect.sqlToQuery(condition) }), Promise.resolve([])),
      }),
    }),
  };
  const revokeForSessionClient = mock<RefreshTokenService['revokeForSessionClient']>(() => Promise.resolve());
  const record = mock(() => Promise.resolve());
  const service = new AuthorizationCodeService(
    new FakeDatabaseService({ postgres, redis: new InMemoryRedis() }),
    { revokeForSessionClient } as unknown as RefreshTokenService,
    { record } as never,
  );
  return { service, revocations, revokeForSessionClient, record };
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
});
