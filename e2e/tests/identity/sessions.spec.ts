/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

/**
 * Importing user defined packages
 */
import {
  findSessionBySecret,
  findSetCookie,
  identityDb,
  identityMutate,
  mintRefreshToken,
  readSessionStatus,
  refreshGrant,
  signInWithPassword,
  updateIdentitySession,
} from '../../lib';
import { expect, test } from './fixtures';
import { expectErrorCode } from './helpers';

/**
 * Defining types
 */

interface MeSession {
  id: string | number;
  isCurrent: boolean;
  userAgent?: string;
}

/**
 * Declaring the constants
 *
 * Identity's own session: the cookie a login sets, sign-out, absolute and idle expiry, and self-service session management.
 * Sessions are minted in the database where the login itself is not under test, so only the cookie and device tests spend
 * `login/init`, and each test runs under its own client address.
 */

const SESSION_COOKIE = '__Host-sid';
const PROBE_PATH = '/api/v1/me/mfa';
const DAY_MS = 24 * 60 * 60 * 1000;
const ELEVATION_MS = 10 * 60 * 1000;

test.describe('identity sessions — cookie and expiry', () => {
  test('should set a host-only, HttpOnly, Secure, Lax session cookie at login and clear it on a CSRF-correct signout', async ({ identity }) => {
    const user = await identity.createUser({ label: 'cookie' });
    const ctx = await identity.anonymous();

    const { response: login } = await signInWithPassword(ctx, user.email, user.password);
    expect(login.status()).toBe(200);
    const cookie = findSetCookie(login, SESSION_COOKIE);
    expect(cookie?.value, 'login must set __Host-sid').toBeTruthy();
    const attributes = cookie?.attributes ?? new Map<string, string>();
    expect(attributes.has('httponly'), 'HttpOnly').toBe(true);
    expect(attributes.has('secure'), 'Secure').toBe(true);
    expect(attributes.get('samesite')?.toLowerCase()).toBe('lax');
    expect(attributes.get('path')).toBe('/');
    expect(attributes.has('domain'), 'a __Host- cookie must not carry Domain').toBe(false);
    const secret = cookie?.value ?? '';

    const session = await findSessionBySecret(secret);
    expect(session).toMatchObject({ userId: user.userId, status: 'ACTIVE' });
    expect((await ctx.get(PROBE_PATH)).status()).toBe(200);

    const signout = await identityMutate(ctx, 'post', '/api/v1/auth/signout');
    expect(signout.status()).toBe(204);
    const cleared = findSetCookie(signout, SESSION_COOKIE);
    expect(cleared?.value).toBe('');
    expect(cleared?.attributes.get('max-age')).toBe('0');

    const replay = await identity.contextFor({ sessionId: session?.id ?? '', userId: user.userId, secret });
    const afterSignout = await replay.get(PROBE_PATH);
    expect(afterSignout.status(), 'the signed-out cookie value must no longer authenticate').toBe(401);
    expect(await readSessionStatus(session?.id ?? '')).toBe('TERMINATED');
  });

  test('should reject and expire a session past its absolute lifetime or idle for over 30 days', async ({ identity }) => {
    const user = await identity.createUser({ label: 'expiry' });
    const { session: pastAbsolute, ctx: pastAbsoluteCtx } = await identity.signIn(user, { expiresAt: new Date(Date.now() - 60_000), lastUsedAt: new Date() });
    const { session: idle, ctx: idleCtx } = await identity.signIn(user, { lastUsedAt: new Date(Date.now() - 31 * DAY_MS) });
    const { ctx: live } = await identity.signIn(user);

    for (const [session, ctx] of [
      [pastAbsolute, pastAbsoluteCtx],
      [idle, idleCtx],
    ] as const) {
      const response = await ctx.get(PROBE_PATH);
      expect(response.status()).toBe(401);
      await expectErrorCode(response, 'AUTH_005');
      expect(await readSessionStatus(session.sessionId)).toBe('EXPIRED');
    }
    expect((await live.get(PROBE_PATH)).status(), 'a live session of the same user is unaffected').toBe(200);
  });
});

test.describe('identity sessions — self-service management', () => {
  test('should list, revoke one and revoke all of the caller’s sessions, never a stranger’s', async ({ identity }) => {
    const user = await identity.createUser({ label: 'me-sessions' });
    const stranger = await identity.createUser({ label: 'me-sessions-stranger' });
    const currentAgent = `e2e-current/${randomBytes(4).toString('hex')}`;
    const { session: current, ctx } = await identity.signIn(user, { userAgent: currentAgent });
    const { session: withToken, ctx: withTokenCtx } = await identity.signIn(user);
    const others = [await identity.signIn(user), await identity.signIn(user)];
    const { session: strangerSession, ctx: strangerCtx } = await identity.signIn(stranger);

    const client = await identity.createOAuthClient('me-sessions');
    const tokenCtx = await identity.anonymous();
    const refreshToken = await mintRefreshToken(withTokenCtx, tokenCtx, client);

    const listed = await ctx.get('/api/v1/me/sessions');
    expect(listed.status()).toBe(200);
    const { sessions } = (await listed.json()) as { sessions: MeSession[] };
    expect(sessions.map(session => String(session.id)).sort()).toEqual([current, withToken, ...others.map(other => other.session)].map(s => s.sessionId).sort());
    const flagged = sessions.filter(session => session.isCurrent);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({ userAgent: currentAgent });
    expect(String(flagged[0]?.id)).toBe(current.sessionId);

    const anonymous = await (await identity.anonymous()).get('/api/v1/me/sessions');
    expect(anonymous.status()).toBe(401);

    const unelevated = await identityMutate(ctx, 'delete', '/api/v1/me/sessions');
    expect(unelevated.status()).toBe(403);
    await expectErrorCode(unelevated, 'AUTH_006');
    expect(await readSessionStatus(withToken.sessionId), 'a refused revoke-all must revoke nothing').toBe('ACTIVE');

    await updateIdentitySession(current, { aal: 'AAL2', elevatedUntil: new Date(Date.now() + ELEVATION_MS) });

    const revokeOne = await identityMutate(ctx, 'delete', `/api/v1/me/sessions/${withToken.sessionId}`);
    expect(revokeOne.status()).toBe(200);
    expect(await revokeOne.json()).toEqual({ revoked: 1 });
    expect(await readSessionStatus(withToken.sessionId)).toBe('REVOKED');
    expect((await withTokenCtx.get(PROBE_PATH)).status()).toBe(401);
    const refresh = await refreshGrant(tokenCtx, client, refreshToken);
    expect(refresh.status(), 'a refresh token bound to a revoked session must be dead').toBe(400);
    await expectErrorCode(refresh, 'invalid_grant');
    const families = await identityDb()<{ status: string; revokeReason: string | null }[]>`
        SELECT status, revoke_reason AS "revokeReason" FROM refresh_token_families WHERE session_id = ${withToken.sessionId}
      `;
    expect(families).toEqual([{ status: 'REVOKED', revokeReason: 'LOGOUT' }]);
    expect((await ctx.get(PROBE_PATH)).status(), 'the caller’s own session stays live').toBe(200);

    const foreign = await identityMutate(ctx, 'delete', `/api/v1/me/sessions/${strangerSession.sessionId}`);
    expect(foreign.status()).toBe(404);
    await expectErrorCode(foreign, 'USR_001');
    expect(await readSessionStatus(strangerSession.sessionId)).toBe('ACTIVE');
    expect((await strangerCtx.get(PROBE_PATH)).status(), 'the stranger’s session must survive').toBe(200);

    const revokeAll = await identityMutate(ctx, 'delete', '/api/v1/me/sessions');
    expect(revokeAll.status()).toBe(200);
    expect(await revokeAll.json()).toEqual({ revoked: others.length });
    for (const other of others) {
      expect(await readSessionStatus(other.session.sessionId)).toBe('TERMINATED');
      expect((await other.ctx.get(PROBE_PATH)).status()).toBe(401);
    }
    expect((await ctx.get(PROBE_PATH)).status(), 'revoke-all keeps the current session').toBe(200);
    expect((await strangerCtx.get(PROBE_PATH)).status()).toBe(200);
  });

  test('should reuse one device row for two logins from the same device fingerprint', async ({ identity }) => {
    const user = await identity.createUser({ label: 'device-reuse' });
    const deviceId = `e2e-device-${randomBytes(8).toString('hex')}`;

    const secrets: string[] = [];
    for (let login = 0; login < 2; login++) {
      const { response } = await signInWithPassword(await identity.anonymous(), user.email, user.password, { deviceId });
      expect(response.status()).toBe(200);
      secrets.push(findSetCookie(response, SESSION_COOKIE)?.value ?? '');
    }

    const devices = await identityDb()<{ id: string }[]>`SELECT id::text FROM devices WHERE user_id = ${user.userId}`;
    expect(devices).toHaveLength(1);
    const sessions = await Promise.all(secrets.map(secret => findSessionBySecret(secret)));
    expect(new Set(sessions.map(session => session?.id)).size, 'two distinct sessions').toBe(2);
    for (const session of sessions) expect(session).toMatchObject({ status: 'ACTIVE', deviceId: devices[0]?.id });
  });
});
