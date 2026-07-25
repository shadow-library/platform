/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AccessTokenCache, type AppSessionToken, AuthClient, hashSessionHandle } from '@shadow-library/auth';
import { AppSessionService, decodeLoginState, encodeLoginState, type LoginState, matchesState, resolveAuthRoutes, resolveBrowserAuthConfig } from '@shadow-library/auth/module';
import { createTestIdP, TestIdP } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const CLIENT = { id: 'svc-reports', secret: 's3cr3t' };
const AUDIENCE = 'api://reports';
const OTHER_AUDIENCE = 'api://billing';

describe('AppSessionClient', () => {
  let idp: TestIdP;
  let auth: AuthClient;

  beforeAll(async () => {
    idp = await createTestIdP({ clientId: CLIENT.id, clientSecret: CLIENT.secret });
    auth = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: CLIENT });
  });
  afterAll(() => idp.stop());

  const createSession = async (sub = '42', scopes = ['openid', 'reports:read']) => {
    const code = idp.createAuthorizationCode({ sub, scopes });
    return auth.appSessions.createSession({ code, codeVerifier: 'verifier', redirectUri: 'https://app.test/auth/callback' });
  };

  it('should exchange an authorization code for an opaque session handle', async () => {
    const session = await createSession();
    expect(session.sessionHandle).toBeString();
    expect(session.userId).toBe('42');
    expect(session.scope).toBe('openid reports:read');
    expect(Date.parse(session.expiresAt)).toBeGreaterThan(Date.now());
  });

  it('should mint an access token addressed to the requested resource', async () => {
    const session = await createSession();
    const token = await auth.appSessions.mintToken({ sessionHandle: session.sessionHandle, resource: AUDIENCE, scope: 'reports:read' });

    expect(token.audience).toBe(AUDIENCE);
    expect(token.scope).toBe('reports:read');
    expect(token.aal).toBe('AAL1');
    await expect(auth.verify(token.accessToken)).resolves.toMatchObject({ sub: '42', aal: 'AAL1' });
  });

  it('should surface an unknown handle as a typed SESSION_INVALID rather than a status code', async () => {
    await expect(auth.appSessions.mintToken({ sessionHandle: 'not-a-handle', resource: AUDIENCE })).rejects.toMatchObject({ code: 'SESSION_INVALID', status: 401 });
  });

  it('should surface a missing step-up as ELEVATION_REQUIRED', async () => {
    const session = await createSession('needs-step-up');
    await expect(auth.appSessions.claimElevation(session.sessionHandle, AUDIENCE)).rejects.toMatchObject({ code: 'ELEVATION_REQUIRED', status: 403 });
    await expect(auth.appSessions.mintToken({ sessionHandle: session.sessionHandle, resource: AUDIENCE, elevated: true })).rejects.toMatchObject({ code: 'ELEVATION_REQUIRED' });
  });

  it('should refuse a claim on a step-up granted to another application or resource', async () => {
    const session = await createSession('someone-elses-step-up');

    /** D-19: the step-up names its beneficiary, so whoever asks first cannot simply take the window */
    idp.setSteppedUp('someone-elses-step-up', { clientId: 'svc-somebody-else' });
    await expect(auth.appSessions.claimElevation(session.sessionHandle, AUDIENCE)).rejects.toMatchObject({ code: 'ELEVATION_INTENT_MISMATCH', status: 403 });

    idp.setSteppedUp('someone-elses-step-up', { clientId: CLIENT.id, resource: OTHER_AUDIENCE });
    await expect(auth.appSessions.claimElevation(session.sessionHandle, AUDIENCE)).rejects.toMatchObject({ code: 'ELEVATION_INTENT_MISMATCH' });

    /** The step-up is still there to be spent — a mismatch refuses the claim, it does not consume it */
    idp.setSteppedUp('someone-elses-step-up', { clientId: CLIENT.id, resource: AUDIENCE });
    await expect(auth.appSessions.claimElevation(session.sessionHandle, AUDIENCE)).resolves.toMatchObject({ expiresAt: expect.any(String) });
  });

  it('should spend a step-up into a grant that mints AAL2 for that audience only', async () => {
    const session = await createSession('stepped-up');
    idp.setSteppedUp('stepped-up', true);

    const elevation = await auth.appSessions.claimElevation(session.sessionHandle, AUDIENCE);
    expect(Date.parse(elevation.expiresAt)).toBeGreaterThan(Date.now());

    const elevated = await auth.appSessions.mintToken({ sessionHandle: session.sessionHandle, resource: AUDIENCE, elevated: true });
    expect(elevated.aal).toBe('AAL2');

    /** The grant covers one audience; the same session asking for another is still unelevated */
    await expect(auth.appSessions.mintToken({ sessionHandle: session.sessionHandle, resource: OTHER_AUDIENCE, elevated: true })).rejects.toMatchObject({
      code: 'ELEVATION_REQUIRED',
    });
  });

  it('should end only this application session on revoke', async () => {
    const session = await createSession('leaving');
    const before = idp.getAppSessionCount();
    await auth.appSessions.revokeSession(session.sessionHandle);

    expect(idp.getAppSessionCount()).toBe(before - 1);
    await expect(auth.appSessions.mintToken({ sessionHandle: session.sessionHandle, resource: AUDIENCE })).rejects.toMatchObject({ code: 'SESSION_INVALID' });
  });

  it('should surface the scope that survived filtering, not the one requested', async () => {
    const session = await createSession('narrowed', ['openid', 'reports:read']);

    /** Minting answers 200 with whatever survived, so the delta has to reach the caller somehow */
    const token = await auth.appSessions.mintToken({ sessionHandle: session.sessionHandle, resource: AUDIENCE, scope: 'reports:read reports:write' });
    expect(token.grantedScopes).toEqual(['reports:read']);
    expect(token.scope).toBe('reports:read');
  });

  it('should throw instead of warning when strictScopes is on', async () => {
    const strict = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: CLIENT, strictScopes: true });
    const session = await createSession('strict', ['reports:read']);

    await expect(strict.appSessions.mintToken({ sessionHandle: session.sessionHandle, resource: AUDIENCE, scope: 'reports:read reports:write' })).rejects.toMatchObject({
      code: 'SCOPE_NOT_GRANTED',
    });
    await expect(strict.appSessions.mintToken({ sessionHandle: session.sessionHandle, resource: AUDIENCE, scope: 'reports:read' })).resolves.toMatchObject({
      grantedScopes: ['reports:read'],
    });
  });

  it('should refuse to mint without the app-session:manage service token', async () => {
    const anonymous = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: CLIENT, fetch: (url, init) => fetch(url, { ...init, headers: stripBearer(init) }) });
    const session = await createSession('handle-alone');
    await expect(anonymous.appSessions.mintToken({ sessionHandle: session.sessionHandle, resource: AUDIENCE })).rejects.toBeInstanceOf(AppError);
  });
});

/** Drops the authorization header so a request arrives carrying nothing but the handle */
const stripBearer = (init: RequestInit = {}): Headers => {
  const headers = new Headers(init.headers);
  headers.delete('authorization');
  return headers;
};

describe('AccessTokenCache', () => {
  const token = (aal: 'AAL1' | 'AAL2', expiresIn = 600, grantedScopes: string[] = []): AppSessionToken => ({
    accessToken: `token-${aal}`,
    tokenType: 'Bearer',
    expiresIn,
    aal,
    scope: grantedScopes.join(' '),
    grantedScopes,
  });
  const handleHash = hashSessionHandle('handle');

  it('should never answer a non-elevated lookup with an elevated token', () => {
    const cache = new AccessTokenCache();
    cache.set({ handleHash, audience: AUDIENCE, elevated: true }, token('AAL2'));

    expect(cache.get({ handleHash, audience: AUDIENCE, elevated: false })).toBeUndefined();
    expect(cache.get({ handleHash, audience: AUDIENCE, elevated: true })?.aal).toBe('AAL2');
  });

  it('should never answer a lookup for another audience or scope', () => {
    const cache = new AccessTokenCache();
    cache.set({ handleHash, audience: AUDIENCE, elevated: true, scope: 'reports:read' }, token('AAL2', 600, ['reports:read']));

    expect(cache.get({ handleHash, audience: OTHER_AUDIENCE, elevated: true, scope: 'reports:read' })).toBeUndefined();
    expect(cache.get({ handleHash, audience: AUDIENCE, elevated: true, scope: 'reports:write' })).toBeUndefined();
    expect(cache.get({ handleHash: hashSessionHandle('other'), audience: AUDIENCE, elevated: true, scope: 'reports:read' })).toBeUndefined();
  });

  it('should file a narrowed token under what was granted, never under what was requested', () => {
    const cache = new AccessTokenCache();
    const requested = { handleHash, audience: AUDIENCE, elevated: false, scope: 'reports:read reports:write' };

    /** Identity granted only the read scope; nothing may end up labelled as carrying the write scope */
    cache.set(requested, token('AAL1', 600, ['reports:read']));

    /** The entry is honest about what it holds, and no other request borrows it without minting */
    expect(cache.get(requested)?.grantedScopes).toEqual(['reports:read']);
    expect(cache.get({ handleHash, audience: AUDIENCE, elevated: false, scope: 'reports:read' })).toBeUndefined();
  });

  it('should share one entry between two requests identity narrows to the same grant', () => {
    const cache = new AccessTokenCache();
    const wide = { handleHash, audience: AUDIENCE, elevated: false, scope: 'reports:read reports:write' };
    const narrow = { handleHash, audience: AUDIENCE, elevated: false, scope: 'reports:read' };

    cache.set(wide, token('AAL1', 600, ['reports:read']));
    cache.set(narrow, token('AAL1', 600, ['reports:read']));

    /** Both requests resolved to the same grant, so evicting it must take both lookups with it */
    cache.evictSession(handleHash);
    expect(cache.get(wide)).toBeUndefined();
    expect(cache.get(narrow)).toBeUndefined();
  });

  it('should drop the stale lookup when a request starts being granted something else', () => {
    const cache = new AccessTokenCache();
    const requested = { handleHash, audience: AUDIENCE, elevated: false, scope: 'reports:read reports:write' };

    cache.set(requested, token('AAL1', 600, ['reports:read']));
    cache.set(requested, token('AAL1', 600, ['reports:read', 'reports:write']));

    expect(cache.get(requested)?.grantedScopes).toEqual(['reports:read', 'reports:write']);
    expect(cache.get({ handleHash, audience: AUDIENCE, elevated: false, scope: 'reports:read' })).toBeUndefined();
  });

  it('should treat a reordered scope request as the same request', () => {
    const cache = new AccessTokenCache();
    cache.set({ handleHash, audience: AUDIENCE, elevated: false, scope: 'a b' }, token('AAL1', 600, ['b', 'a']));
    expect(cache.get({ handleHash, audience: AUDIENCE, elevated: false, scope: 'b a' })).toBeDefined();
  });

  it('should not outlive the elevation grant it was minted from', () => {
    const cache = new AccessTokenCache();
    const key = { handleHash, audience: AUDIENCE, elevated: true };

    cache.set(key, token('AAL2', 3600), Date.now() - 1);
    expect(cache.get(key)).toBeUndefined();

    cache.set(key, token('AAL2', 3600), Date.now() + 60_000);
    expect(cache.get(key)).toBeDefined();
  });

  it('should refuse to cache against a grant window it cannot read', () => {
    const cache = new AccessTokenCache();
    const key = { handleHash, audience: AUDIENCE, elevated: true };

    /** `NaN` compares false against everything, so an unchecked bound would cache an AAL2 token forever */
    cache.set(key, token('AAL2', 3600), Number.NaN);
    expect(cache.get(key)).toBeUndefined();

    cache.set(key, token('AAL2', 3600), Number.POSITIVE_INFINITY);
    expect(cache.get(key)).toBeUndefined();
  });

  it('should serve a live token and drop one inside the refresh margin', () => {
    const cache = new AccessTokenCache();
    const key = { handleHash, audience: AUDIENCE, elevated: false };

    cache.set(key, token('AAL1', 600));
    expect(cache.get(key)?.accessToken).toBe('token-AAL1');

    /** 30s of life left is inside the 60s margin, so it is already unusable */
    cache.set(key, token('AAL1', 30));
    expect(cache.get(key)).toBeUndefined();
  });

  it('should evict every token of a session at once', () => {
    const cache = new AccessTokenCache();
    cache.set({ handleHash, audience: AUDIENCE, elevated: false }, token('AAL1'));
    cache.set({ handleHash, audience: AUDIENCE, elevated: true }, token('AAL2'));

    cache.evictSession(handleHash);
    expect(cache.get({ handleHash, audience: AUDIENCE, elevated: false })).toBeUndefined();
    expect(cache.get({ handleHash, audience: AUDIENCE, elevated: true })).toBeUndefined();
  });

  it('should evict only the elevated tokens when the grant is refreshed', () => {
    const cache = new AccessTokenCache();
    cache.set({ handleHash, audience: AUDIENCE, elevated: false }, token('AAL1'));
    cache.set({ handleHash, audience: AUDIENCE, elevated: true }, token('AAL2'));

    cache.evictElevated(handleHash);
    expect(cache.get({ handleHash, audience: AUDIENCE, elevated: false })).toBeDefined();
    expect(cache.get({ handleHash, audience: AUDIENCE, elevated: true })).toBeUndefined();
  });
});

describe('redirect allow-list', () => {
  const service = (allowedRedirects: string[]): AppSessionService => {
    const client = { issuer: 'https://identity.test', audience: AUDIENCE, client: CLIENT };
    const browser = resolveBrowserAuthConfig(client, resolveAuthRoutes(), { enabled: true, redirectUri: 'https://reports.test/auth/callback', allowedRedirects });
    return new AppSessionService(new AuthClient(client), browser);
  };

  it('should accept same-origin paths and allow-listed origins', () => {
    const sessions = service(['https://reports.test', 'https://admin.test/ops']);
    expect(sessions.resolveReturnTo('/reports/42')).toBe('/reports/42');
    expect(sessions.resolveReturnTo('https://reports.test/anything')).toBe('https://reports.test/anything');
    expect(sessions.resolveReturnTo('https://admin.test/ops/users')).toBe('https://admin.test/ops/users');
  });

  it('should reject another origin, a sibling path, and both authority-smuggling spellings', () => {
    const sessions = service(['https://reports.test', 'https://admin.test/ops']);
    for (const target of ['https://evil.test', 'https://admin.test/other', '//evil.test', '/\\evil.test', '/\\\\evil.test', 'https://reports.test.evil.test']) {
      expect(() => sessions.resolveReturnTo(target)).toThrow(/not allowed/);
    }
  });

  it('should not let one custom-scheme entry whitelist every custom-scheme target', () => {
    /** Every non-special scheme reports its origin as the string "null", which would compare equal */
    const sessions = service(['app-reports://callback']);
    expect(() => sessions.resolveReturnTo('app-evil://callback')).toThrow(/not allowed/);
    expect(() => sessions.resolveReturnTo('app-reports://callback')).toThrow(/not allowed/);
  });
});

describe('login state cookie', () => {
  const state: LoginState = { state: 'st', nonce: 'no', codeVerifier: 'ver', returnTo: '/reports' };

  it('should round-trip the in-flight login with no key and no store', () => {
    expect(decodeLoginState(encodeLoginState(state))).toEqual(state);
  });

  it('should read a cookie written by another replica, since nothing is held server-side', () => {
    /** The multi-instance caveat the sealed store carried is gone: no shared secret, no shared memory */
    const written = encodeLoginState(state);
    expect(decodeLoginState(written)).toEqual(state);
    expect(decodeLoginState(written)).toEqual(decodeLoginState(written));
  });

  it('should refuse an absent, junk, truncated or incomplete cookie as an unstarted login', () => {
    expect(decodeLoginState(undefined)).toBeNull();
    expect(decodeLoginState('')).toBeNull();
    expect(decodeLoginState('not-base64-json')).toBeNull();
    expect(decodeLoginState(Buffer.from('{"state":"st"}').toString('base64url'))).toBeNull();
    expect(decodeLoginState(Buffer.from(JSON.stringify({ ...state, exp: 'soon' })).toString('base64url'))).toBeNull();
  });

  it('should refuse a cookie whose deadline has passed', () => {
    expect(decodeLoginState(encodeLoginState(state, -1))).toBeNull();
    expect(decodeLoginState(encodeLoginState(state, 600))).toEqual(state);
  });

  it('should compare callback state in constant time without leaking a length mismatch', () => {
    expect(matchesState('abc', 'abc')).toBe(true);
    expect(matchesState('abc', 'abd')).toBe(false);
    expect(matchesState('abc', 'abcd')).toBe(false);
  });
});
