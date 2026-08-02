/**
 * Importing npm packages
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { createApiClient } from './api-client';
import { ApiError } from './api-error';
import { type ServerFetchSpec } from './transport';

/**
 * Defining types
 */
interface RecordedFetch {
  url: string;
  init: RequestInit;
}

/**
 * Declaring the constants
 *
 * The browser branch is selected by the presence of `window`, so these tests install a minimal one along
 * with a writable `document.cookie` and a stub `fetch`. That is the whole of the browser surface the client
 * touches — no DOM, no navigation — which is what makes the transport testable without a real browser.
 */
const originalFetch = globalThis.fetch;

let recorded: RecordedFetch[] = [];
let nextResponse: Response;

function enterBrowser(cookie = ''): void {
  (globalThis as { window?: unknown }).window = {};
  (globalThis as { document?: unknown }).document = { cookie };
  globalThis.fetch = ((url: string, init: RequestInit) => {
    recorded.push({ url, init });
    return Promise.resolve(nextResponse);
  }) as unknown as typeof fetch;
}

function leaveBrowser(): void {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
  globalThis.fetch = originalFetch;
}

function client() {
  return createApiClient({ surfaces: { v1: '/api/v1', auth: '/api/auth' } });
}

beforeEach(() => {
  recorded = [];
  nextResponse = Response.json({ ok: true });
});

afterEach(leaveBrowser);

describe('createApiClient (browser)', () => {
  it('should call the same-origin surface path so the ingress routes it to the backend', async () => {
    enterBrowser();
    nextResponse = Response.json({ id: 'proj_1' });

    const data = await client().v1.get('/projects/proj_1').execute<{ id: string }>();

    expect(data).toEqual({ id: 'proj_1' });
    expect(recorded[0]?.url).toBe('/api/v1/projects/proj_1');
    expect(recorded[0]?.init.credentials).toBe('same-origin');
  });

  it('should append query parameters and drop undefined ones', async () => {
    enterBrowser();

    await client().v1.get('/projects').query({ page: 2, search: undefined, draft: false }).execute();

    expect(recorded[0]?.url).toBe('/api/v1/projects?page=2&draft=false');
  });

  it('should route each surface to its own base path from one client', async () => {
    enterBrowser();

    await client().auth.get('/session').execute();

    expect(recorded[0]?.url).toBe('/api/auth/session');
  });

  it('should satisfy the CSRF double-submit on a mutation by echoing the existing cookie', async () => {
    enterBrowser(`csrf-token=${encodeURIComponent(`${(Date.now() + 60_000).toString(36)}:tok_existing`)}`);

    await client().v1.post('/projects').body({ name: 'Ada' }).execute();

    const headers = recorded[0]?.init.headers as Record<string, string>;
    expect(headers['x-csrf-token']).toBe('tok_existing');
    expect(recorded[0]?.init.body).toBe('{"name":"Ada"}');
  });

  it('should mint and persist a CSRF token when the browser holds none', async () => {
    enterBrowser();

    await client().v1.delete('/projects/proj_1').execute();

    const headers = recorded[0]?.init.headers as Record<string, string>;
    expect(headers['x-csrf-token']).toMatch(/^[0-9a-f]{32}$/);
    // The minted pair is written back so the next request — and the SSR pass — agree on the same token.
    expect(document.cookie).toContain('csrf-token=');
    expect(decodeURIComponent(document.cookie)).toContain(headers['x-csrf-token'] as string);
  });

  it('should not attach a CSRF header to a read', async () => {
    enterBrowser();

    await client().v1.get('/projects').execute();

    expect(recorded[0]?.init.headers as Record<string, string>).not.toHaveProperty('x-csrf-token');
  });

  it('should resolve a 204 as undefined rather than failing to parse an empty body', async () => {
    enterBrowser();
    nextResponse = new Response(null, { status: 204 });

    expect(await client().v1.delete('/projects/proj_1').execute()).toBeUndefined();
  });

  it('should raise an ApiError carrying the backend envelope on a non-2xx', async () => {
    enterBrowser();
    nextResponse = Response.json({ code: 'VALIDATION_FAILED', type: 'ValidationError', message: 'bad input', fields: [{ field: 'name', msg: 'required' }] }, { status: 422 });

    const error = await client()
      .v1.post('/projects')
      .body({})
      .execute()
      .catch((caught: unknown) => caught);

    expect(ApiError.isApiError(error)).toBe(true);
    expect((error as ApiError).status).toBe(422);
    expect((error as ApiError).fieldErrors).toEqual({ name: 'required' });
  });

  it('should resolve a modeled non-2xx as data instead of throwing', async () => {
    enterBrowser();
    nextResponse = Response.json({ step: 'mfa' }, { status: 400 });

    expect(await client().auth.post('/login').modeled(400).execute()).toEqual({ step: 'mfa' });
  });

  it('should report an unreachable backend as a network failure rather than a parse error', async () => {
    enterBrowser();
    globalThis.fetch = (() => Promise.reject(new TypeError('connection refused'))) as unknown as typeof fetch;

    const result = await client().v1.get('/projects').result();

    expect(result).toEqual({ ok: false, failure: { status: -1, code: 'NETWORK_ERROR', type: 'NetworkError', message: 'Unable to reach the server' } });
  });

  it('should propagate a cancellation untouched so a query reads it as cancelled, not failed', async () => {
    enterBrowser();
    globalThis.fetch = (() => Promise.reject(new DOMException('aborted', 'AbortError'))) as unknown as typeof fetch;

    const error = await client()
      .v1.get('/projects')
      .execute()
      .catch((caught: unknown) => caught);

    expect((error as DOMException).name).toBe('AbortError');
  });
});

describe('createApiClient (server)', () => {
  it('should hand the SSR transport the full root-absolute path', async () => {
    let seen: ServerFetchSpec | undefined;
    const api = createApiClient({
      surfaces: { v1: '/api/v1' },
      ssr: () =>
        Promise.resolve({
          serverFetch: (async (spec: ServerFetchSpec) => {
            seen = spec;
            return { ok: true, data: { id: 'proj_1' } };
          }) as never,
        }),
    });

    expect(await api.v1.get('/projects/proj_1').query('draft', true).execute()).toEqual({ id: 'proj_1' });
    expect(seen?.path).toBe('/api/v1/projects/proj_1');
    expect(seen?.query).toEqual({ draft: 'true' });
  });

  it('should fail loudly when no SSR transport was configured, rather than silently mis-routing', async () => {
    const api = createApiClient({ surfaces: { v1: '/api/v1' } });

    const error = await api.v1
      .get('/projects')
      .execute()
      .catch((caught: unknown) => caught);

    expect((error as Error).name).toBe('ApiClientError');
  });
});
