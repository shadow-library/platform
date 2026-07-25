/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AuthClient } from '@shadow-library/auth';
import { createTestIdP, TestIdP } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Calling another application *as the user* has exactly one supported shape (D-22): an RFC 8693
 * exchange. The two properties worth pinning are that identity narrows the scope silently — so the
 * caller must be handed what actually survived — and that delegation stops after one hop, refused
 * client-side before a round trip that would fail for reasons a caller cannot tell from an outage.
 */
const AUDIENCE = 'api://pulse';
const DOWNSTREAM = 'api://novel-forge';
const CLIENT = { id: 'svc-pulse', secret: 's3cr3t' };
const USER = 'user-42';

describe('AuthClient.exchangeUserToken', () => {
  let idp: TestIdP;
  let auth: AuthClient;

  beforeAll(async () => {
    idp = await createTestIdP({ clientId: CLIENT.id, clientSecret: CLIENT.secret });
    auth = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: CLIENT });
  });
  afterAll(() => idp.stop());

  const userToken = (scopes: string[]) => idp.issueToken({ sub: USER, audience: AUDIENCE, scopes });

  it('should exchange the user token for one addressed to the downstream resource', async () => {
    const exchanged = await auth.exchangeUserToken({ subjectToken: await userToken(['books:read']), resource: DOWNSTREAM, scopes: ['books:read'] });

    expect(exchanged.tokenType).toBe('Bearer');
    expect(exchanged.expiresIn).toBeGreaterThan(0);
    expect(exchanged.scope).toEqual(['books:read']);
    expect(exchanged.audience).toBe(DOWNSTREAM);

    /** The exchanged token still speaks for the user, with this application recorded as the actor */
    const downstream = new AuthClient({ issuer: idp.issuer, audience: DOWNSTREAM });
    await expect(downstream.verify(exchanged.accessToken)).resolves.toMatchObject({ sub: USER, scopes: ['books:read'] });
  });

  it('should surface the scope that actually survived rather than the one requested', async () => {
    idp.setUnexchangeableScopes(['books:write']);

    const exchanged = await auth.exchangeUserToken({ subjectToken: await userToken(['books:read', 'books:write']), resource: DOWNSTREAM, scopes: ['books:read', 'books:write'] });
    expect(exchanged.scope).toEqual(['books:read']);

    idp.setUnexchangeableScopes([]);
  });

  it('should never grant a scope the user does not hold', async () => {
    const exchanged = await auth.exchangeUserToken({ subjectToken: await userToken(['books:read']), resource: DOWNSTREAM, scopes: ['books:read', 'books:delete'] });
    expect(exchanged.scope).toEqual(['books:read']);
  });

  it('should refuse an act-bearing subject token before any network call', async () => {
    const delegated = await idp.issueToken({ sub: USER, audience: AUDIENCE, scopes: ['books:read'], claims: { act: { sub: 'svc-upstream' } } });
    const before = idp.getRequestCount('/oauth2/token');

    await expect(auth.exchangeUserToken({ subjectToken: delegated, resource: DOWNSTREAM })).rejects.toMatchObject({ code: 'TOKEN_EXCHANGE_REFUSED', status: 400 });
    expect(idp.getRequestCount('/oauth2/token')).toBe(before);
  });

  it('should refuse a missing subject token, an unreadable one, and a missing resource', async () => {
    const before = idp.getRequestCount('/oauth2/token');

    await expect(auth.exchangeUserToken({ subjectToken: '', resource: DOWNSTREAM })).rejects.toMatchObject({ code: 'TOKEN_EXCHANGE_REFUSED' });
    await expect(auth.exchangeUserToken({ subjectToken: 'not-a-jwt', resource: DOWNSTREAM })).rejects.toMatchObject({ code: 'TOKEN_EXCHANGE_REFUSED' });
    await expect(auth.exchangeUserToken({ subjectToken: await userToken(['books:read']), resource: '' })).rejects.toMatchObject({ code: 'TOKEN_EXCHANGE_REFUSED' });
    expect(idp.getRequestCount('/oauth2/token')).toBe(before);
  });

  it('should require confidential client credentials', async () => {
    const publicClient = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: { id: CLIENT.id } });
    await expect(publicClient.exchangeUserToken({ subjectToken: await userToken([]), resource: DOWNSTREAM })).rejects.toMatchObject({ code: 'CONFIG_INVALID' });
  });

  it('should surface a rejected exchange as TOKEN_EXCHANGE_FAILED', async () => {
    idp.setEndpointFailure('/oauth2/token', true);
    await expect(auth.exchangeUserToken({ subjectToken: await userToken(['books:read']), resource: DOWNSTREAM })).rejects.toMatchObject({ code: 'TOKEN_EXCHANGE_FAILED' });
    idp.setEndpointFailure('/oauth2/token', false);
  });

  it('should mint a fresh token per call, since the result belongs to one user', async () => {
    const subjectToken = await userToken(['books:read']);
    const before = idp.getRequestCount('/oauth2/token');

    await auth.exchangeUserToken({ subjectToken, resource: DOWNSTREAM });
    await auth.exchangeUserToken({ subjectToken, resource: DOWNSTREAM });
    expect(idp.getRequestCount('/oauth2/token')).toBe(before + 2);
  });
});
