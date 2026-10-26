import { describe, expect, it } from 'bun:test';

import { type WebSearchToolSpec } from '@modules/catalog/catalog.types';
import { WebSearchClient, WebSearchError } from '@modules/providers/web-search.client';

const BRAVE: WebSearchToolSpec = { kind: 'brave', url: 'https://api.search.brave.com/', maxSearches: 3, results: 2 };
const KEY = 'brave-key-0123456789';

function client(answer: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const requests: { url: string; init: RequestInit }[] = [];
  const search = new WebSearchClient(async (url, init) => (requests.push({ url, init }), answer(url, init)));
  return { search, requests };
}

const json = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function reasonOf(work: Promise<unknown>): Promise<string | undefined> {
  return work.then(
    () => undefined,
    (error: unknown) => (error instanceof WebSearchError ? error.reason : String(error)),
  );
}

describe('WebSearchClient', () => {
  it('should ask Brave with the key in its own header, never following a redirect, and read plain-text results', async () => {
    const results = [
      { title: 'The <strong>Lighthouse</strong>', url: 'https://example.test/a', description: 'Keepers &amp; lamps', age: '2 days ago' },
      { title: 'Not a page', url: 'javascript:alert(1)', description: '' },
      { title: '', url: 'https://example.test/b', description: 'Second' },
    ];
    const { search, requests } = client(json(200, { web: { results } }));

    expect(await search.search(BRAVE, KEY, '  lighthouse keepers ')).toEqual([
      { title: 'The Lighthouse', url: 'https://example.test/a', snippet: 'Keepers & lamps', age: '2 days ago' },
      { title: 'https://example.test/b', url: 'https://example.test/b', snippet: 'Second' },
    ]);
    const [request] = requests;
    expect(request?.url).toStartWith('https://api.search.brave.com/res/v1/web/search?');
    expect(new URL(request?.url ?? '').searchParams.get('q')).toBe('lighthouse keepers');
    expect(new URL(request?.url ?? '').searchParams.get('count')).toBe('2');
    expect(request?.init).toMatchObject({ method: 'GET', redirect: 'manual', headers: { 'x-subscription-token': KEY } });
  });

  it('should name why Brave refused, without the key or the body', async () => {
    for (const [status, reason] of [
      [401, 'the search key was refused'],
      [429, 'the search engine is rate limiting this server'],
      [302, 'the search engine answered 302'],
    ] as const) {
      const { search } = client(json(status, { error: KEY }));
      const refused = await reasonOf(search.search(BRAVE, KEY, 'lighthouse'));
      expect(refused).toBe(reason);
      expect(refused).not.toContain(KEY);
    }
  });

  it('should refuse a search with no key or no query before asking anyone', async () => {
    const { search, requests } = client(json(200, {}));

    expect(await reasonOf(search.search(BRAVE, undefined, 'lighthouse'))).toBe('no search key is configured');
    expect(await reasonOf(search.search(BRAVE, KEY, '   '))).toBe('the query was empty');
    expect(requests).toEqual([]);
  });

  it('should answer a mock search in process, as many results as the tool asks for', async () => {
    const { search, requests } = client(json(500, {}));

    expect(await search.search({ ...BRAVE, kind: 'mock', results: 3 }, undefined, 'lighthouse')).toHaveLength(3);
    expect(requests).toEqual([]);
  });
});
