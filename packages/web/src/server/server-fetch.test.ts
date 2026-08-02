/**
 * Importing npm packages
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

/**
 * Importing user defined packages
 */

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
 * The server transport reaches for `@tanstack/react-start/server`'s request accessors, which only resolve
 * inside a Start request. These tests stub that module with a mutable inbound `Request` and a plain `Headers`
 * standing in for the response, plus a recording `fetch` — the whole of the server surface the transport
 * touches, which is what makes the SSR path testable without a running server. The module is mocked before it
 * is imported so the stub is what `server-fetch` binds to.
 */
let currentRequest: Request;
let responseHeaders: Headers;
let recorded: RecordedFetch[];
let nextResponse: Response;

function getRequest(): Request {
  return currentRequest;
}

function getResponseHeaders(): Headers {
  return responseHeaders;
}

function setResponseHeader(name: string, value: string | string[]): void {
  responseHeaders.delete(name);
  for (const entry of Array.isArray(value) ? value : [value]) responseHeaders.append(name, entry);
}

mock.module('@tanstack/react-start/server', () => ({ getRequest, getResponseHeaders, setResponseHeader }));

const { createServerFetch } = await import('./server-fetch');
const { createSsrTransport, resolveBackendOrigin } = await import('./ssr-transport');

const originalFetch = globalThis.fetch;
const { API_ORIGIN, SERVER_URL } = process.env;

function inbound(headers: Record<string, string> = {}): Request {
  return new Request('http://web.internal/', { headers });
}

function sentHeaders(index = 0): Record<string, string> {
  return recorded[index]?.init.headers as Record<string, string>;
}

beforeEach(() => {
  recorded = [];
  responseHeaders = new Headers();
  nextResponse = Response.json({ ok: true });
  // Clone per call: a loader firing several backend calls reuses one recorded `nextResponse`, and each read
  // consumes its body — the clone hands every call an independent, unconsumed stream.
  globalThis.fetch = ((url: string, init: RequestInit) => {
    recorded.push({ url, init });
    return Promise.resolve(nextResponse.clone());
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('createServerFetch (correlation id)', () => {
  it('should mint one correlation id and reuse it across every call in the same inbound request', async () => {
    currentRequest = inbound();
    const serverFetch = createServerFetch({ baseUrl: 'http://backend' });

    await serverFetch({ method: 'GET', path: '/a' });
    await serverFetch({ method: 'GET', path: '/b' });

    const first = sentHeaders(0)['x-correlation-id'];
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(sentHeaders(1)['x-correlation-id']).toBe(first as string);
  });

  it('should echo an inbound x-correlation-id rather than minting a fresh one', async () => {
    currentRequest = inbound({ 'x-correlation-id': 'corr-from-proxy' });
    const serverFetch = createServerFetch({ baseUrl: 'http://backend' });

    await serverFetch({ method: 'GET', path: '/a' });

    expect(sentHeaders()['x-correlation-id']).toBe('corr-from-proxy');
  });

  it('should let an explicit spec header override the correlation id', async () => {
    currentRequest = inbound();
    const serverFetch = createServerFetch({ baseUrl: 'http://backend' });

    await serverFetch({ method: 'GET', path: '/a', headers: { 'x-correlation-id': 'spec-wins' } });

    expect(sentHeaders()['x-correlation-id']).toBe('spec-wins');
  });
});

describe('createServerFetch (forwarded headers)', () => {
  it('should forward x-forwarded-for and accept-language when the inbound request carries them', async () => {
    currentRequest = inbound({ 'x-forwarded-for': '203.0.113.7', 'accept-language': 'fr-CH' });
    const serverFetch = createServerFetch({ baseUrl: 'http://backend' });

    await serverFetch({ method: 'GET', path: '/a' });

    expect(sentHeaders()['x-forwarded-for']).toBe('203.0.113.7');
    expect(sentHeaders()['accept-language']).toBe('fr-CH');
  });

  it('should omit forwarded headers the inbound request does not carry', async () => {
    currentRequest = inbound();
    const serverFetch = createServerFetch({ baseUrl: 'http://backend' });

    await serverFetch({ method: 'GET', path: '/a' });

    expect(sentHeaders()).not.toHaveProperty('x-forwarded-for');
    expect(sentHeaders()).not.toHaveProperty('accept-language');
  });
});

describe('resolveBackendOrigin', () => {
  afterEach(() => {
    if (API_ORIGIN === undefined) delete process.env.API_ORIGIN;
    else process.env.API_ORIGIN = API_ORIGIN;
    if (SERVER_URL === undefined) delete process.env.SERVER_URL;
    else process.env.SERVER_URL = SERVER_URL;
  });

  it('should prefer API_ORIGIN over every other source', () => {
    process.env.API_ORIGIN = 'http://api.internal';
    process.env.SERVER_URL = 'http://legacy.internal';
    expect(resolveBackendOrigin('http://fallback')).toBe('http://api.internal');
  });

  it('should fall back to SERVER_URL when API_ORIGIN is unset', () => {
    delete process.env.API_ORIGIN;
    process.env.SERVER_URL = 'http://legacy.internal';
    expect(resolveBackendOrigin('http://fallback')).toBe('http://legacy.internal');
  });

  it('should use the supplied fallback when neither env var is set', () => {
    delete process.env.API_ORIGIN;
    delete process.env.SERVER_URL;
    expect(resolveBackendOrigin('http://fallback')).toBe('http://fallback');
  });

  it('should use the platform default when nothing else names an origin', () => {
    delete process.env.API_ORIGIN;
    delete process.env.SERVER_URL;
    expect(resolveBackendOrigin()).toBe('http://localhost:8080');
  });
});

describe('createSsrTransport', () => {
  afterEach(() => {
    if (API_ORIGIN === undefined) delete process.env.API_ORIGIN;
    else process.env.API_ORIGIN = API_ORIGIN;
    if (SERVER_URL === undefined) delete process.env.SERVER_URL;
    else process.env.SERVER_URL = SERVER_URL;
  });

  it('should reach the resolved backend origin', async () => {
    delete process.env.SERVER_URL;
    process.env.API_ORIGIN = 'http://api.internal';
    currentRequest = inbound();

    const { serverFetch } = createSsrTransport();
    await serverFetch({ method: 'GET', path: '/ping' });

    expect(recorded[0]?.url).toBe('http://api.internal/ping');
  });

  it('should honour the fallback origin when no env var is set', async () => {
    delete process.env.API_ORIGIN;
    delete process.env.SERVER_URL;
    currentRequest = inbound();

    const { serverFetch } = createSsrTransport({ fallback: 'http://dev.local:9091' });
    await serverFetch({ method: 'GET', path: '/ping' });

    expect(recorded[0]?.url).toBe('http://dev.local:9091/ping');
  });
});
