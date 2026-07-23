/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AuthClient } from '@shadow-library/auth';
import { RelyingParty } from '@shadow-library/auth/rp';
import { createTestIdP, TestIdP } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const AUDIENCE = 'api://pulse';
const ISSUER = 'https://identity.test';
const REDIRECT_URI = 'https://app.test/auth/callback';

/** A transport that never resolves on its own, so only the injected timeout signal can settle it */
const hangingFetch = (_url: string, init: RequestInit = {}): Promise<Response> =>
  new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason)));

describe('AuthClient request timeout', () => {
  it('should reject a non-positive or non-finite timeout at construction', () => {
    expect(() => new AuthClient({ issuer: ISSUER, audience: AUDIENCE, timeout: 0 })).toThrow(AppError);
    expect(() => new AuthClient({ issuer: ISSUER, audience: AUDIENCE, timeout: -100 })).toThrow(AppError);
    expect(() => new AuthClient({ issuer: ISSUER, audience: AUDIENCE, timeout: NaN })).toThrow(AppError);
  });

  it('should abort a transport request that outlives the timeout', async () => {
    const auth = new AuthClient({ issuer: ISSUER, audience: AUDIENCE, client: { id: 'svc', secret: 's3cret' }, fetch: hangingFetch, timeout: 10 });
    await expect(auth.getServiceToken()).rejects.toMatchObject({ code: 'DISCOVERY_FAILED' });
  });

  it('should leave requests unbounded when no timeout is configured', async () => {
    const idp = await createTestIdP();
    const auth = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE });
    const principal = await auth.verify(await idp.issueToken({ sub: '42', audience: AUDIENCE }));
    expect(principal.sub).toBe('42');
    idp.stop();
  });

  it('should honour a generous timeout without disturbing a normal request', async () => {
    const idp = await createTestIdP();
    const auth = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, timeout: 5000 });
    const principal = await auth.verify(await idp.issueToken({ sub: '42', audience: AUDIENCE }));
    expect(principal.sub).toBe('42');
    idp.stop();
  });
});

describe('AuthClient.fetchService timeout', () => {
  let idp: TestIdP | undefined;
  let slow: ReturnType<typeof Bun.serve>;

  beforeAll(() => {
    /** A reachable service that never answers, resolved through the svc:// override below */
    slow = Bun.serve({ port: 0, fetch: () => new Promise<Response>(() => {}) });
    process.env.SERVICE_URL_SLOW_SVC = `http://127.0.0.1:${slow.port}`;
  });

  afterAll(() => {
    slow.stop(true);
    idp?.stop();
    delete process.env.SERVICE_URL_SLOW_SVC;
  });

  it('should surface a retryable API_REQUEST_TIMEOUT when the service call outlives the timeout', async () => {
    idp = await createTestIdP({ clientId: 'svc-pulse', clientSecret: 's3cret' });
    const auth = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: { id: 'svc-pulse', secret: 's3cret' }, timeout: 300 });
    const failure = await auth.fetchService('slow-svc', '/api/v1/ping').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AppError);
    expect(failure as AppError).toMatchObject({ code: 'API_REQUEST_TIMEOUT', status: 504 });
  });
});

describe('RelyingParty request timeout', () => {
  const client = { id: 'web-app', secret: 'web-secret' };

  it('should reject a non-positive or non-finite timeout at construction', () => {
    expect(() => new RelyingParty({ issuer: ISSUER, client, redirectUri: REDIRECT_URI, timeout: 0 })).toThrow(AppError);
    expect(() => new RelyingParty({ issuer: ISSUER, client, redirectUri: REDIRECT_URI, timeout: -1 })).toThrow(AppError);
    expect(() => new RelyingParty({ issuer: ISSUER, client, redirectUri: REDIRECT_URI, timeout: NaN })).toThrow(AppError);
  });

  it('should abort a transport request that outlives the timeout', async () => {
    const rp = new RelyingParty({ issuer: ISSUER, client, redirectUri: REDIRECT_URI, fetch: hangingFetch, timeout: 10 });
    await expect(rp.createAuthorizationUrl()).rejects.toMatchObject({ code: 'DISCOVERY_FAILED' });
  });
});
