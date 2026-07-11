/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { ApiError, type CookieAccess, type FetchLike, IdentityApi } from '../lib/api';
import { matchRoute } from '../lib/router';

/**
 * Defining types
 */

interface RecordedRequest {
  input: string;
  init: RequestInit;
}

/**
 * Declaring the constants
 */
const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function harness(responses: Response[]): { api: IdentityApi; requests: RecordedRequest[]; jar: Map<string, string> } {
  const requests: RecordedRequest[] = [];
  const jar = new Map<string, string>();
  const fetchImpl: FetchLike = (input, init) => {
    requests.push({ input, init });
    const next = responses.shift();
    if (!next) throw new Error('No response queued');
    return Promise.resolve(next);
  };
  const cookies: CookieAccess = { get: name => jar.get(name), set: (name, value) => void jar.set(name, value) };
  return { api: new IdentityApi({ fetchImpl, cookies }), requests, jar };
}

describe('IdentityApi', () => {
  describe('csrf handling', () => {
    it('should echo the token half of a server-issued csrf cookie', () => {
      const { api, jar } = harness([]);
      const expiry = (Date.now() + 60_000).toString(36);
      jar.set('csrf-token', `${expiry}:abc123`);
      expect(api.csrfToken()).toBe('abc123');
    });

    it('should mint a spec-shaped pair when no cookie exists', () => {
      const { api, jar } = harness([]);
      const token = api.csrfToken();
      const cookie = jar.get('csrf-token');
      expect(cookie).toBeDefined();
      const [expiry, cookieToken] = (cookie as string).split(':');
      expect(cookieToken).toBe(token);
      expect(token).toMatch(/^[0-9a-f]{32}$/);
      expect(parseInt(expiry as string, 36)).toBeGreaterThan(Date.now());
    });

    it('should replace an expired cookie instead of echoing it', () => {
      const { api, jar } = harness([]);
      const stale = (Date.now() - 1000).toString(36);
      jar.set('csrf-token', `${stale}:stale-token`);
      expect(api.csrfToken()).not.toBe('stale-token');
    });

    it('should attach the header and same-origin credentials to every call', async () => {
      const { api, requests } = harness([jsonResponse(200, { flowId: 'f', status: 'AWAITING_PASSWORD' })]);
      await api.loginInit('jane@example.com');
      const [request] = requests;
      const headers = request?.init.headers as Record<string, string>;
      expect(headers['x-csrf-token']).toMatch(/^[0-9a-f]{32}$/);
      expect(request?.init.credentials).toBe('same-origin');
    });
  });

  describe('flow responses', () => {
    it('should surface a 401 verify answer as typed retry state, not an error', async () => {
      const { api } = harness([jsonResponse(401, { flowId: 'f', status: 'AWAITING_PASSWORD', attemptsLeft: 2 })]);
      const state = await api.challengeVerify('f', { password: 'wrong' });
      expect(state).toMatchObject({ status: 'AWAITING_PASSWORD', attemptsLeft: 2 });
    });

    it('should surface a 429 resend answer with its retry window', async () => {
      const { api } = harness([jsonResponse(429, { status: 'LIMITED', retryAfterSeconds: 41 })]);
      const result = await api.challengeResend('f', 'EMAIL_OTP');
      expect(result).toMatchObject({ status: 'LIMITED', retryAfterSeconds: 41 });
    });

    it('should throw a typed ApiError for unmodeled statuses', async () => {
      const { api } = harness([jsonResponse(410, { code: 'FLOW_EXPIRED', type: 'NOT_FOUND', message: 'gone' })]);
      const error = await api.loginInit('jane@example.com').catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(ApiError);
      expect(error as ApiError).toMatchObject({ status: 410, code: 'FLOW_EXPIRED' });
    });

    it('should carry retry-after headers into the error', async () => {
      const { api } = harness([jsonResponse(429, { code: 'SEC_001', type: 'CLIENT_ERROR', message: 'limited' }, { 'retry-after': '60' })]);
      const error = await api.loginInit('jane@example.com').catch((cause: unknown) => cause);
      expect((error as ApiError).retryAfterSeconds).toBe(60);
    });
  });
});

describe('router matching', () => {
  const routes = [
    { path: '/login', component: () => null },
    { path: '/account', component: () => null },
  ];

  it('should match exact paths and tolerate a trailing slash', () => {
    expect(matchRoute(routes, '/login')?.path).toBe('/login');
    expect(matchRoute(routes, '/login/')?.path).toBe('/login');
  });

  it('should not prefix-match nested paths', () => {
    expect(matchRoute(routes, '/login/extra')).toBeUndefined();
  });
});
