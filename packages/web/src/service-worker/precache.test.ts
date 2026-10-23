import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { PrecacheError, precacheUrls } from './precache';

const written = new Map<string, Response>();
const cache = { put: async (url: string, response: Response) => void written.set(url, response) } as unknown as Cache;

const realFetch = globalThis.fetch;
const OPAQUE_REDIRECT = { ok: false, status: 0, type: 'opaqueredirect' } as Response;
let responses: Record<string, Response>;
let redirectModes: (RequestRedirect | undefined)[];

beforeEach(() => {
  written.clear();
  redirectModes = [];
  (globalThis as { fetch: unknown }).fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    redirectModes.push(init?.redirect);
    return responses[url] ?? new Response('missing', { status: 404 });
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('precacheUrls', () => {
  it('should store every URL when each answers with its own document', async () => {
    responses = { '/': new Response('shell'), '/offline': new Response('offline') };

    await precacheUrls(cache, ['/', '/offline']);

    expect([...written.keys()]).toEqual(['/', '/offline']);
    expect(await written.get('/')?.text()).toBe('shell');
  });

  it('should reject a redirected shell without following it to the login page', async () => {
    responses = { '/': OPAQUE_REDIRECT, '/offline': new Response('offline') };

    const thrown = await precacheUrls(cache, ['/', '/offline']).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(PrecacheError);
    expect(thrown).toMatchObject({ url: '/', redirected: true });
    expect(redirectModes).toEqual(['manual', 'manual']);
    expect(written.size).toBe(0);
  });

  it('should reject a non-OK response like Cache.addAll does', async () => {
    responses = {};

    const thrown = await precacheUrls(cache, ['/']).catch((error: unknown) => error);

    expect(thrown).toMatchObject({ url: '/', status: 404, redirected: false });
    expect(written.size).toBe(0);
  });
});
