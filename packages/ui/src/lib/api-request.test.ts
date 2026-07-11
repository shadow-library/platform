/**
 * Importing npm packages
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { ApiError } from './api-error';
import { APIRequest } from './api-request';

/**
 * Declaring the constants
 */
type FetchArgs = [string, RequestInit];

function mockFetch(response: Partial<Response>): ReturnType<typeof vi.fn> {
  const fn = vi.fn(() => Promise.resolve(response as Response));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function ok(body: unknown, status = 200): Partial<Response> {
  return { ok: true, status, json: () => Promise.resolve(body) };
}

beforeEach(() => {
  APIRequest.setBaseUrl('');
  APIRequest.setPreRequestHook(null);
  APIRequest.setPostResponseHook(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('APIRequest', () => {
  it('issues a GET to the given path and returns the parsed body', async () => {
    const fetchMock = mockFetch(ok({ id: 1 }));
    const result = await APIRequest.get('/users').execute<{ id: number }>();

    const [url, init] = fetchMock.mock.calls[0] as FetchArgs;
    expect(url).toBe('/users');
    expect(init.method).toBe('GET');
    expect(result).toEqual({ id: 1 });
  });

  it('prepends the configured base URL to relative paths only', async () => {
    APIRequest.setBaseUrl('https://api.test');
    const fetchMock = mockFetch(ok({}));

    await APIRequest.get('/a').execute();
    await APIRequest.get('https://other.test/b').execute();

    expect((fetchMock.mock.calls[0] as FetchArgs)[0]).toBe('https://api.test/a');
    expect((fetchMock.mock.calls[1] as FetchArgs)[0]).toBe('https://other.test/b');
  });

  it('serialises a query object and skips undefined values', async () => {
    const fetchMock = mockFetch(ok({}));
    await APIRequest.get('/search').query({ q: 'hi', page: 2, active: true, missing: undefined }).execute();

    expect((fetchMock.mock.calls[0] as FetchArgs)[0]).toBe('/search?q=hi&page=2&active=true');
  });

  it('serialises a single query key/value pair', async () => {
    const fetchMock = mockFetch(ok({}));
    await APIRequest.get('/search').query('q', 'hi').execute();
    expect((fetchMock.mock.calls[0] as FetchArgs)[0]).toBe('/search?q=hi');
  });

  it('omits a single query pair whose value is undefined', async () => {
    const fetchMock = mockFetch(ok({}));
    await APIRequest.get('/search')
      .query('q', undefined as unknown as string)
      .execute();
    expect((fetchMock.mock.calls[0] as FetchArgs)[0]).toBe('/search');
  });

  it('sends a JSON body with a content-type header', async () => {
    const fetchMock = mockFetch(ok({}));
    await APIRequest.post('/users').body({ name: 'Ada' }).execute();

    const [, init] = fetchMock.mock.calls[0] as FetchArgs;
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ name: 'Ada' }));
  });

  it('builds a nested body from dotted field paths', async () => {
    const fetchMock = mockFetch(ok({}));
    await APIRequest.post('/users').field('profile.name', 'Ada').field('profile.age', 30).execute();

    const [, init] = fetchMock.mock.calls[0] as FetchArgs;
    expect(JSON.parse(init.body as string)).toEqual({ profile: { name: 'Ada', age: 30 } });
  });

  it('returns undefined for a 204 response', async () => {
    mockFetch({ ok: true, status: 204, json: () => Promise.reject(new Error('no body')) });
    await expect(APIRequest.delete('/users/1').execute()).resolves.toBeUndefined();
  });

  it('throws an ApiError carrying the server error body on a non-2xx response', async () => {
    mockFetch({ ok: false, status: 404, json: () => Promise.resolve({ code: 'NOT_FOUND', type: 'NotFound', message: 'Missing' }) });

    await expect(APIRequest.get('/users/1').execute()).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('throws an UNKNOWN_ERROR ApiError when a failed response has no JSON body', async () => {
    mockFetch({ ok: false, status: 500, json: () => Promise.reject(new Error('not json')) });

    const error = (await APIRequest.get('/x')
      .execute()
      .catch(e => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('UNKNOWN_ERROR');
    expect(error.status).toBe(500);
  });

  it('maps a fetch rejection to a NETWORK_ERROR ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );

    const error = (await APIRequest.get('/x')
      .execute()
      .catch(e => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.status).toBe(-1);
  });

  it('runs the pre-request and post-response hooks', async () => {
    mockFetch(ok({}));
    const pre = vi.fn();
    const post = vi.fn();
    APIRequest.setPreRequestHook(pre);
    APIRequest.setPostResponseHook(post);

    await APIRequest.get('/x').execute();

    expect(pre).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledOnce();
  });

  it('is thenable, resolving like the promise from execute()', async () => {
    mockFetch(ok({ ok: true }));
    await expect(APIRequest.get('/x')).resolves.toEqual({ ok: true });
  });
});
