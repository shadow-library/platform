import { beforeEach, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';

import { SessionService } from '@server/modules/auth/session';
import { RefreshTokenClientMismatchError, RefreshTokenReuseError, RefreshTokenService } from '@server/modules/auth/token';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';

import { TestEnvironment } from '../test-environment';

const env = new TestEnvironment('refresh-token').init();

const rejection = <T>(promise: Promise<T>): Promise<any> =>
  promise.then(
    () => ({}),
    error => error,
  );

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let userId: bigint;

  beforeEach(async () => {
    service = env.getService(RefreshTokenService);
    const user = await env.getService(UserService).createUserWithPassword({ email: 'rt@example.com', password: 'Password@123', status: 'ACTIVE' });
    userId = user.id;
  });

  it('should issue a family with one active token', async () => {
    const { secret, familyId } = await service.issue({ userId });
    expect(secret).toBeTruthy();

    const tokens = await env.getPostgresClient().select().from(schema.refreshTokens).where(eq(schema.refreshTokens.familyId, familyId));
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.status).toBe('ACTIVE');
  });

  it('should rotate a token, retiring the old one within the same family', async () => {
    const first = await service.issue({ userId });
    const second = await service.rotate(first.secret);

    expect(second.familyId).toBe(first.familyId);
    expect(second.secret).not.toBe(first.secret);

    const tokens = await env.getPostgresClient().select().from(schema.refreshTokens).where(eq(schema.refreshTokens.familyId, first.familyId));
    const active = tokens.filter(token => token.status === 'ACTIVE');
    const rotated = tokens.filter(token => token.status === 'ROTATED');
    expect(active).toHaveLength(1);
    expect(rotated).toHaveLength(1);
  });

  it('should reject an unknown token', async () => {
    const error = await rejection(service.rotate('not-a-real-token'));
    expect(error).toBeInstanceOf(RefreshTokenReuseError);
  });

  it('should detect reuse and revoke the whole family and its session', async () => {
    const session = await env.getService(SessionService).create({ userId });
    const first = await service.issue({ userId, sessionId: session.session.id });
    await service.rotate(first.secret);

    const error = await rejection(service.rotate(first.secret));
    expect(error).toBeInstanceOf(RefreshTokenReuseError);

    const [family] = await env.getPostgresClient().select().from(schema.refreshTokenFamilies).where(eq(schema.refreshTokenFamilies.id, first.familyId));
    expect(family?.status).toBe('REVOKED');
    expect(family?.revokeReason).toBe('ROTATION_REUSE');

    expect(await env.getService(SessionService).validate(session.secret)).toBeNull();
    const audit = await env.getPostgresClient().select().from(schema.auditEvents);
    expect(audit.some(event => event.action === 'security.token_reuse')).toBe(true);
  });

  it('should reject a mismatched client before consuming the token, leaving it usable (M2)', async () => {
    const first = await service.issue({ userId, clientId: 'client-a' });
    const error = await rejection(service.rotate(first.secret, { expectedClientId: 'client-b' }));
    expect(error).toBeInstanceOf(RefreshTokenClientMismatchError);

    const rotated = await service.rotate(first.secret, { expectedClientId: 'client-a' });
    expect(rotated.secret).not.toBe(first.secret);

    const [family] = await env.getPostgresClient().select().from(schema.refreshTokenFamilies).where(eq(schema.refreshTokenFamilies.id, first.familyId));
    expect(family?.status).toBe('ACTIVE');
  });

  it('should let only one of two concurrent rotations of the same token succeed (M1)', async () => {
    const first = await service.issue({ userId });
    const results = await Promise.allSettled([service.rotate(first.secret), service.rotate(first.secret)]);
    const fulfilled = results.filter(result => result.status === 'fulfilled');
    const rejected = results.filter(result => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const active = (await env.getPostgresClient().select().from(schema.refreshTokens).where(eq(schema.refreshTokens.familyId, first.familyId))).filter(
      token => token.status === 'ACTIVE',
    );
    expect(active).toHaveLength(1);
  });

  it('should revoke every family for a session on demand', async () => {
    const session = await env.getService(SessionService).create({ userId });
    const { secret } = await service.issue({ userId, sessionId: session.session.id });
    await service.revokeForSession(session.session.id);
    const error = await rejection(service.rotate(secret));
    expect(error).toBeInstanceOf(RefreshTokenReuseError);
  });
});
