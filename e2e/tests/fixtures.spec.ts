/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';

import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { createIdentitySession, createIdentityUser, deleteIdentityUser, identityDb, identitySessionContext, type IdentityUser, redisGet, updateIdentitySession } from '../lib';

/**
 * Defining types
 */

interface MeResponse {
  readonly userId: string;
  readonly email: string;
  readonly aal: 'AAL1' | 'AAL2';
  readonly elevated: boolean;
}

/**
 * Declaring the constants
 *
 * Self-checks for the shared identity fixtures in `e2e/lib`: that a factory user plus a DB-minted session is a caller identity
 * accepts, and that the Redis helper reaches the cache identity actually reads. None of them spends a rate-limited login.
 */
test.describe('e2e identity fixtures', () => {
  let user: IdentityUser | undefined;

  test.beforeEach(async () => {
    user = await createIdentityUser({ label: 'fixture' });
  });

  test.afterEach(async () => {
    if (user) await deleteIdentityUser(user);
    user = undefined;
  });

  test('should sign a factory user in through a DB-minted AAL1 session', async () => {
    const ctx = await identitySessionContext(await createIdentitySession(user!.userId));
    const response = await ctx.get('/api/v1/me');
    expect(response.status(), await response.text()).toBe(200);
    const me = (await response.json()) as MeResponse;
    expect(me).toMatchObject({ userId: user!.userId, email: user!.email, aal: 'AAL1', elevated: false });
    await ctx.dispose();
  });

  test('should honour the elevation window of a DB-minted AAL2 session', async () => {
    const ctx = await identitySessionContext(await createIdentitySession(user!.userId, { aal: 'AAL2' }));
    const me = (await (await ctx.get('/api/v1/me')).json()) as MeResponse;
    expect(me).toMatchObject({ aal: 'AAL2', elevated: true });
    await ctx.dispose();
  });

  test('should cache a used session in Redis and drop it once the row is revoked', async () => {
    const session = await createIdentitySession(user!.userId);
    const cacheKey = `session:${createHash('sha256').update(session.secret).digest('hex')}`;
    const ctx = await identitySessionContext(session);

    expect((await ctx.get('/api/v1/me')).status()).toBe(200);
    expect(await redisGet(cacheKey), 'identity caches a validated session under session:<sha256(secret)>').not.toBeNull();

    await updateIdentitySession(session, { status: 'REVOKED' });
    expect(await redisGet(cacheKey), 'updateIdentitySession evicts the cache entry').toBeNull();
    expect((await ctx.get('/api/v1/me')).status(), 'a revoked session is refused once the cache no longer vouches for it').toBe(401);

    await ctx.dispose();
  });

  test('should refuse a session whose DB row expired before its first use', async () => {
    const session = await createIdentitySession(user!.userId, { expiresAt: new Date(Date.now() - 60_000) });
    const ctx = await identitySessionContext(session);
    expect((await ctx.get('/api/v1/me')).status()).toBe(401);
    const [row] = await identityDb()<{ status: string }[]>`SELECT status::text AS status FROM user_sessions WHERE id = ${session.sessionId}`;
    expect(row?.status, 'identity marks the row EXPIRED when it judges it').toBe('EXPIRED');
    await ctx.dispose();
  });
});
