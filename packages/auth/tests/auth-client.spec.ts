/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AuthClient, AuthError } from '@shadow-library/auth';
import { TestIdP, createTestIdP } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const AUDIENCE = 'api://pulse';

describe('AuthClient constructor', () => {
  it('should reject invalid configuration outright', () => {
    expect(() => new AuthClient({ issuer: '', audience: AUDIENCE })).toThrow(AuthError);
    expect(() => new AuthClient({ issuer: 'not a url', audience: AUDIENCE })).toThrow(AuthError);
    expect(() => new AuthClient({ issuer: 'https://identity.test', audience: '' })).toThrow(AuthError);
    expect(() => new AuthClient({ issuer: 'https://identity.test', audience: AUDIENCE, client: { id: '' } })).toThrow(AuthError);
    expect(() => new AuthClient({ issuer: 'https://identity.test', audience: AUDIENCE, clockSkewSeconds: -1 })).toThrow(AuthError);
  });
});

describe('AuthClient.verify', () => {
  let idp: TestIdP;
  let auth: AuthClient;

  beforeAll(async () => {
    idp = await createTestIdP();
    auth = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE });
  });
  afterAll(() => idp.stop());

  it('should resolve a user principal from a valid token', async () => {
    const token = await idp.issueToken({ sub: '42', audience: AUDIENCE, scopes: ['posts:read', 'posts:write'], org: '7', sid: '99' });
    const principal = await auth.verify(token);
    expect(principal).toMatchObject({ kind: 'user', sub: '42', org: '7', sid: '99', scopes: ['posts:read', 'posts:write'] });
  });

  it('should resolve a service principal with its client id', async () => {
    const token = await idp.issueToken({ sub: 'svc-1', kind: 'service', clientId: 'svc-1', audience: AUDIENCE });
    const principal = await auth.verify(token);
    expect(principal).toMatchObject({ kind: 'service', sub: 'svc-1', clientId: 'svc-1', scopes: [] });
  });

  it('should reject empty and foreign-audience tokens', async () => {
    await expect(auth.verify('')).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
    const token = await idp.issueToken({ sub: '42', audience: 'api://other' });
    await expect(auth.verify(token)).rejects.toMatchObject({ code: 'AUDIENCE_MISMATCH' });
  });

  it('should cache the jwks between verifications', async () => {
    await auth.verify(await idp.issueToken({ sub: '0', audience: AUDIENCE }));
    const before = idp.getRequestCount('/.well-known/jwks.json');
    await auth.verify(await idp.issueToken({ sub: '1', audience: AUDIENCE }));
    await auth.verify(await idp.issueToken({ sub: '2', audience: AUDIENCE }));
    expect(idp.getRequestCount('/.well-known/jwks.json')).toBe(before);
  });

  it('should refetch the jwks once for an unknown kid so rotation is zero-config', async () => {
    await auth.verify(await idp.issueToken({ sub: '42', audience: AUDIENCE }));
    await idp.rotateKeys();
    const rotated = await idp.issueToken({ sub: '42', audience: AUDIENCE });
    const principal = await auth.verify(rotated);
    expect(principal.sub).toBe('42');
  });

  it('should fail closed when the kid is unknown even after a refetch', async () => {
    const idp2 = await createTestIdP();
    const foreign = await idp2.issueToken({ sub: '42', audience: AUDIENCE, claims: { iss: idp.issuer } });
    idp2.stop();
    await expect(auth.verify(foreign)).rejects.toMatchObject({ code: 'KEY_UNKNOWN' });
  });

  it('should keep verifying with cached keys when the jwks endpoint goes down', async () => {
    const client = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, cache: { jwksTtlSeconds: 0 } });
    await client.verify(await idp.issueToken({ sub: '42', audience: AUDIENCE }));
    idp.setEndpointFailure('/.well-known/jwks.json', true);
    const principal = await client.verify(await idp.issueToken({ sub: '43', audience: AUDIENCE }));
    expect(principal.sub).toBe('43');
    idp.setEndpointFailure('/.well-known/jwks.json', false);
  });
});

describe('AuthClient service tokens', () => {
  let idp: TestIdP;
  let auth: AuthClient;

  beforeAll(async () => {
    idp = await createTestIdP({ clientId: 'svc-pulse', clientSecret: 's3cret' });
    auth = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: { id: 'svc-pulse', secret: 's3cret' } });
  });
  afterAll(() => idp.stop());

  it('should mint a verifiable client-credentials token', async () => {
    const token = await auth.getServiceToken({ resource: AUDIENCE, scopes: ['posts:admin'] });
    const principal = await auth.verify(token);
    expect(principal).toMatchObject({ kind: 'service', sub: 'svc-pulse', scopes: ['posts:admin'] });
  });

  it('should cache tokens and share one in-flight request between concurrent callers', async () => {
    const before = idp.getRequestCount('/oauth2/token');
    const [first, second, third] = await Promise.all([
      auth.getServiceToken({ resource: 'api://books' }),
      auth.getServiceToken({ resource: 'api://books' }),
      auth.getServiceToken({ resource: 'api://books' }),
    ]);
    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(idp.getRequestCount('/oauth2/token')).toBe(before + 1);
    await auth.getServiceToken({ resource: 'api://books' });
    expect(idp.getRequestCount('/oauth2/token')).toBe(before + 1);
  });

  it('should surface credential failures immediately without caching them', async () => {
    const bad = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: { id: 'svc-pulse', secret: 'wrong' } });
    await expect(bad.getServiceToken()).rejects.toMatchObject({ code: 'TOKEN_REQUEST_FAILED' });
  });

  it('should require client credentials for service tokens', async () => {
    const anonymous = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE });
    await expect(anonymous.getServiceToken()).rejects.toMatchObject({ code: 'CONFIG_INVALID' });
  });

  it('should inject the bearer into the fetch wrapper', async () => {
    const response = await auth.fetch(`${idp.issuer}/api/v1/authz/check`, { method: 'POST', body: JSON.stringify({}) }, { resource: 'shadow-identity' });
    expect(response.status).toBe(200);
  });
});
