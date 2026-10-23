import { QueryClient } from '@tanstack/react-query';
import { isRedirect } from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createAuthApi } from '@shadow-library/web/auth';

import { apiClient, readAccessMode, requireReaderAccess, sessionKeys } from '@/lib/apis';

/** The transport's browser path calls global `fetch`, so a stub answering per path stands in for webnovel-server. */
type Answer = { status: number; body?: unknown } | 'offline';

const ACCESS_KEY = createAuthApi(apiClient.auth).keys.access;
const realFetch = globalThis.fetch;
let answers: Record<string, Answer>;
let requested: string[];

function json(answer: Exclude<Answer, 'offline'>): Response {
  return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), { status: answer.status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  requested = [];
  (globalThis as { fetch: unknown }).fetch = async (url: string): Promise<Response> => {
    requested.push(url);
    const answer = answers[url] ?? { status: 404 };
    if (answer === 'offline') throw new TypeError('fetch failed');
    return json(answer);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const PUBLIC: Answer = { status: 200, body: { mode: 'public' } };
const PRIVATE: Answer = { status: 200, body: { mode: 'private' } };
const SIGNED_IN: Answer = { status: 200, body: { sub: 'reader-1', scopes: [] } };
const SIGNED_OUT: Answer = { status: 401, body: { code: 'IAM_001', type: 'UnauthorizedError', message: 'Unauthenticated' } };

describe('requireReaderAccess', () => {
  it('should let a guest through a public deployment without reading the session', async () => {
    answers = { '/api/auth/access': PUBLIC, '/api/auth/session': SIGNED_OUT };

    expect(await requireReaderAccess(new QueryClient(), '/novels/a')).toBe('public');
    expect(requested).toEqual(['/api/auth/access']);
  });

  it('should admit a signed-in reader to a private deployment and seed the session the chrome renders', async () => {
    answers = { '/api/auth/access': PRIVATE, '/api/auth/session': SIGNED_IN };
    const queryClient = new QueryClient();

    expect(await requireReaderAccess(queryClient, '/novels/a')).toBe('private');
    expect(queryClient.getQueryData(sessionKeys.session)).toEqual({ userId: 'reader-1' });
  });

  it('should redirect a signed-out visitor on a private deployment to login with the page as returnTo', async () => {
    answers = { '/api/auth/access': PRIVATE, '/api/auth/session': SIGNED_OUT };

    const thrown = await requireReaderAccess(new QueryClient(), '/read/a/3?from=list').catch((error: unknown) => error);

    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({ options: { to: '/login', search: { returnTo: '/read/a/3?from=list' } } });
  });

  it('should fail closed to private when the access mode cannot be read', async () => {
    answers = { '/api/auth/access': { status: 503 }, '/api/auth/session': SIGNED_OUT };

    expect(isRedirect(await requireReaderAccess(new QueryClient(), '/').catch((error: unknown) => error))).toBe(true);
  });

  it('should pass a private deployment with no network from the cache the SSR shell hydrated', async () => {
    answers = { '/api/auth/access': 'offline', '/api/auth/session': 'offline' };
    const queryClient = new QueryClient();
    queryClient.setQueryData(ACCESS_KEY, { mode: 'private' });
    queryClient.setQueryData(sessionKeys.required, { userId: 'reader-1' });

    expect(await requireReaderAccess(queryClient, '/read/a/1')).toBe('private');
    expect(requested).toEqual([]);
  });

  it('should replace a cached signed-out read once the gate proved a session', async () => {
    answers = { '/api/auth/access': PRIVATE, '/api/auth/session': SIGNED_IN };
    const queryClient = new QueryClient();
    queryClient.setQueryData(sessionKeys.session, null);

    await requireReaderAccess(queryClient, '/');

    expect(queryClient.getQueryData(sessionKeys.session)).toEqual({ userId: 'reader-1' });
  });

  it('should keep a session the chrome already holds rather than overwrite it', async () => {
    answers = { '/api/auth/access': PRIVATE, '/api/auth/session': SIGNED_IN };
    const queryClient = new QueryClient();
    queryClient.setQueryData(sessionKeys.session, { userId: 'reader-1' }, { updatedAt: 1 });

    await requireReaderAccess(queryClient, '/');

    expect(queryClient.getQueryState(sessionKeys.session)?.dataUpdatedAt).toBe(1);
  });
});

describe('readAccessMode', () => {
  it('should read the deployment mode for routes outside the gate', async () => {
    answers = { '/api/auth/access': PUBLIC };

    expect(await readAccessMode(new QueryClient())).toBe('public');
  });

  it('should read an unreachable access route as private instead of rejecting', async () => {
    answers = { '/api/auth/access': 'offline' };

    expect(await readAccessMode(new QueryClient())).toBe('private');
  });
});
