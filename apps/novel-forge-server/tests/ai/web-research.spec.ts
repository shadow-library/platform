import { describe, expect, it } from 'bun:test';
import { Config } from '@shadow-library/common';

import { type AddressLookup, assertPublicUrl, braveSearch, fetchPage, htmlToText, isPrivateAddress, linksIn, pageKey, WebResearchService } from '@modules/ai/web';

const PUBLIC: AddressLookup = async () => [{ address: '93.184.216.34' }];

function setConfig(key: string, value: unknown): void {
  (Config as unknown as { cache: Map<string, unknown> })['cache'].set(key, value);
}

function respond(body: string, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(body, { status: init.status ?? 200, headers: init.headers ?? { 'content-type': 'text/html; charset=utf-8' } });
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    return (err as Error).message;
  }
  return 'resolved';
}

describe('htmlToText', () => {
  it('should keep the readable text, its headings and list items, and drop scripts, styles and page chrome', () => {
    const page = htmlToText(`<html><head><title>The  Ascend &amp; after</title><style>p{}</style></head><body>
      <nav><a href="/">Home</a></nav>
      <h1>Survival</h1><p>Water first,&nbsp;then <b>shelter</b>.</p>
      <ul><li>Boil it</li><li>Store it</li></ul>
      <script>alert('x')</script><footer>© site</footer>
    </body></html>`);

    expect(page.title).toBe('The Ascend & after');
    expect(page.text).toBe('# Survival\nWater first, then shelter.\n\n- Boil it\n- Store it');
  });

  it('should decode numeric entities and leave an unknown one as written', () => {
    expect(htmlToText('<p>&#8220;Run&#x201D; &bogus;</p>').text).toBe('“Run” &bogus;');
  });
});

describe('assertPublicUrl', () => {
  it('should refuse anything that could reach inside the cluster or the host', async () => {
    const refused = [
      'http://localhost/admin',
      'http://127.0.0.1/',
      'http://10.0.0.8/',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/',
      'http://postgres.system.svc.cluster.local/',
      'http://metadata.google.internal/',
      'https://example.com:8443/',
      'https://user:pass@example.com/',
      'file:///etc/passwd',
      'not a url',
    ];

    for (const url of refused) expect(await refusal(assertPublicUrl(url, PUBLIC))).toStartWith('That page was not fetched');
  });

  it('should refuse a public-looking name that resolves inside the cluster, and one that does not resolve', async () => {
    expect(await refusal(assertPublicUrl('https://rebind.example/', async () => [{ address: '93.184.216.34' }, { address: '10.43.0.12' }]))).toContain('not on the public web');
    expect(await refusal(assertPublicUrl('https://nowhere.example/', async () => []))).toContain('does not resolve');
  });

  it('should accept a public page on a standard port', async () => {
    expect((await assertPublicUrl('https://example.com/a?b=1', PUBLIC)).href).toBe('https://example.com/a?b=1');
  });

  it('should treat IPv4-mapped and unique-local IPv6 addresses as private', () => {
    expect(isPrivateAddress('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateAddress('fd12::1')).toBe(true);
    expect(isPrivateAddress('2606:4700::1111')).toBe(false);
  });
});

describe('braveSearch', () => {
  it('should send the key and the query, and return plain-text results with their age', async () => {
    const seen: { url: string; headers: Headers }[] = [];
    const results = await braveSearch('apocalypse novel openings', {
      apiKey: 'key-1',
      count: 8,
      timeoutMs: 1000,
      fetch: async (input, init) => {
        seen.push({ url: String(input), headers: new Headers(init?.headers) });
        const body = {
          web: {
            results: [
              { title: 'How <strong>apocalypse</strong> novels open', url: 'https://example.com/openings', description: 'Day <strong>one</strong> matters.', age: '2 days ago' },
              { title: 'No link', url: 'javascript:alert(1)' },
            ],
          },
        };
        return respond(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
      },
    });

    expect(seen[0]?.url).toContain('q=apocalypse+novel+openings');
    expect(seen[0]?.headers.get('x-subscription-token')).toBe('key-1');
    expect(results).toEqual([{ title: 'How apocalypse novels open', url: 'https://example.com/openings', snippet: 'Day one matters.', age: '2 days ago' }]);
  });

  it('should say why the engine refused, in words the chat model can act on', async () => {
    const search = (status: number) => braveSearch('x', { apiKey: 'k', count: 1, timeoutMs: 1000, fetch: async () => respond('', { status }) });

    expect(await refusal(search(401))).toBe('Web search failed: the Brave Search API key was refused');
    expect(await refusal(search(429))).toContain('rate limiting');
    expect(await refusal(search(500))).toBe('Web search failed: the search engine answered 500');
  });
});

describe('fetchPage', () => {
  const options = (fetch: (input: string | URL) => Promise<Response>, resolve: AddressLookup = PUBLIC) => ({ fetch, resolve, timeoutMs: 1000, maxBytes: 1_000_000 });

  it('should follow a redirect to a public page and report where it ended up', async () => {
    const page = await fetchPage(
      'https://example.com/old',
      options(async input => (String(input).endsWith('/old') ? respond('', { status: 301, headers: { location: '/new' } }) : respond('<title>New</title><p>Here.</p>'))),
    );

    expect(page).toEqual({ url: 'https://example.com/new', title: 'New', text: 'Here.' });
  });

  it('should check every redirect hop, so a public page cannot bounce the fetch into the cluster', async () => {
    const fetched: string[] = [];
    const hop = fetchPage(
      'https://example.com/',
      options(async input => {
        fetched.push(String(input));
        return respond('', { status: 302, headers: { location: 'http://10.43.0.5/admin' } });
      }),
    );

    expect(await refusal(hop)).toContain('not on the public web');
    expect(fetched).toEqual(['https://example.com/']);
  });

  it('should read plain text and refuse what is not a web page', async () => {
    expect(
      (
        await fetchPage(
          'https://example.com/a.txt',
          options(async () => respond('one\n\n\n\ntwo', { headers: { 'content-type': 'text/plain' } })),
        )
      ).text,
    ).toBe('one\n\ntwo');
    expect(
      await refusal(
        fetchPage(
          'https://example.com/a.pdf',
          options(async () => respond('%PDF', { headers: { 'content-type': 'application/pdf' } })),
        ),
      ),
    ).toContain('application/pdf, not a web page');
    expect(
      await refusal(
        fetchPage(
          'https://example.com/gone',
          options(async () => respond('', { status: 404 })),
        ),
      ),
    ).toContain('answered 404');
  });

  it('should stop reading a page past its size cap', async () => {
    const page = await fetchPage('https://example.com/', { ...options(async () => respond(`<p>${'a'.repeat(5000)}</p>`)), maxBytes: 100 });

    expect(page.text.length).toBeLessThan(5000);
  });
});

describe('WebResearchService', () => {
  it('should refuse to search without a Brave key', async () => {
    setConfig('ai.web-search.brave.api.key', undefined);

    expect(await refusal(new WebResearchService().search('x'))).toBe('Web search is not configured — set AI_WEB_SEARCH_BRAVE_API_KEY');
  });

  describe('modeFor', () => {
    function gateway(answer: (url: string) => Promise<Response>) {
      setConfig('ai.openrouter.api.url', 'http://gateway:7431/v1/');
      const asked: string[] = [];
      const service = new WebResearchService();
      service.fetcher = async input => (asked.push(String(input)), answer(String(input)));
      return { service, asked };
    }

    it('should hand the web to a model the gateway runs with its own search, asking once a minute', async () => {
      const { service, asked } = gateway(async () =>
        respond(JSON.stringify({ model: 'anthropic/claude-sonnet-5', native: true }), { headers: { 'content-type': 'application/json' } }),
      );
      let now = 0;
      service.now = () => now;

      expect(await service.modeFor('anthropic/claude-sonnet-5')).toBe('native');
      expect(await service.modeFor('anthropic/claude-sonnet-5')).toBe('native');
      now = 61_000;
      await service.modeFor('anthropic/claude-sonnet-5');

      expect(asked).toEqual(['http://gateway:7431/v1/web-tools?model=anthropic%2Fclaude-sonnet-5', 'http://gateway:7431/v1/web-tools?model=anthropic%2Fclaude-sonnet-5']);
    });

    it('should fall back to Brave, or to no web without its key, wherever the gateway says no or cannot answer', async () => {
      setConfig('ai.web-search.brave.api.key', 'brave-key');
      expect(await gateway(async () => respond(JSON.stringify({ native: false }), { headers: { 'content-type': 'application/json' } })).service.modeFor('m')).toBe('brave');
      expect(await gateway(async () => respond('not found', { status: 404 })).service.modeFor('m')).toBe('brave');
      expect(await gateway(() => Promise.reject(new Error('refused'))).service.modeFor('m')).toBe('brave');
      setConfig('ai.web-search.brave.api.key', undefined);
      expect(await gateway(async () => respond('', { status: 404 })).service.modeFor('m')).toBe('off');
    });
  });

  it('should let a turn fetch the links the author wrote, without their fragment or trailing punctuation', () => {
    const turn = new WebResearchService().forTurn(['Read https://example.com/guide#part-2, then (https://example.org/x).']);

    expect([...turn.fetchable]).toEqual(['https://example.com/guide', 'https://example.org/x']);
  });

  it('should name a page by its address without the fragment', () => {
    expect(pageKey('https://example.com/a#b')).toBe('https://example.com/a');
    expect(linksIn('no links here')).toEqual([]);
  });
});
