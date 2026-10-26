import { Inject, Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { type WebSearchToolSpec } from '@modules/catalog';
import { APP_NAME } from '@server/constants';

import { PROVIDER_FETCH } from './provider-client.service';
import { type ProviderFetch } from './provider.types';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  /** How old the page is, as the search engine words it ("2 days ago") */
  age?: string;
}

/** A search that answered nothing usable; `reason` is shown to the model, so it never carries a key, the request or a raw body */
export class WebSearchError extends Error {
  constructor(readonly reason: string) {
    super(`Web search failed: ${reason}`);
    this.name = 'WebSearchError';
  }
}

const SEARCH_TIMEOUT_MS = 10_000;
const MAX_QUERY_LENGTH = 400;
const BRAVE_PATH = '/res/v1/web/search';

const BRAVE_FAILURES: Readonly<Record<number, string>> = {
  401: 'the search key was refused',
  403: 'the search key is not allowed this search',
  422: 'the search engine could not read that query',
  429: 'the search engine is rate limiting this server',
};

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// Brave marks the matched words with <strong> and escapes entities; the model reads plain text.
function plain(value: unknown): string {
  return text(value)
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function braveResults(body: unknown): WebSearchResult[] {
  const results = (body as { web?: { results?: unknown } } | null)?.web?.results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((entry: unknown) => {
    const record = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
    const url = text(record['url']);
    if (!/^https?:\/\//i.test(url)) return [];
    const age = text(record['age']);
    return [{ title: plain(record['title']) || url, url, snippet: plain(record['description']), ...(age ? { age } : {}) }];
  });
}

function mockResults(query: string, count: number): WebSearchResult[] {
  return Array.from({ length: count }, (_, index) => ({
    title: `Result ${index + 1} for ${query}`,
    url: `https://search.mock/${index + 1}?q=${encodeURIComponent(query)}`,
    snippet: `A mock page about ${query}.`,
  }));
}

/** Runs the catalog's web search tool against its engine; never follows a redirect, which would carry the key away from its origin */
@Injectable()
export class WebSearchClient {
  private readonly logger = Logger.getLogger(APP_NAME, WebSearchClient.name);

  constructor(@Inject(PROVIDER_FETCH) private readonly fetcher: ProviderFetch) {}

  async search(spec: WebSearchToolSpec, apiKey: string | undefined, query: string, signal?: AbortSignal): Promise<WebSearchResult[]> {
    const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH);
    if (!trimmed) throw new WebSearchError('the query was empty');
    if (spec.kind === 'mock') return mockResults(trimmed, spec.results);
    if (!apiKey) throw new WebSearchError('no search key is configured');
    return this.brave(spec, apiKey, trimmed, signal);
  }

  private async brave(spec: WebSearchToolSpec, apiKey: string, query: string, signal: AbortSignal | undefined): Promise<WebSearchResult[]> {
    const params = new URLSearchParams({ q: query, count: String(spec.results), safesearch: 'moderate', text_decorations: 'false' });
    const url = `${spec.url.replace(/\/+$/, '')}${BRAVE_PATH}?${params}`;
    const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: 'GET',
        headers: { accept: 'application/json', 'x-subscription-token': apiKey },
        redirect: 'manual',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch {
      throw new WebSearchError(timeout.aborted ? 'the search engine did not answer in time' : 'the search engine could not be reached');
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      this.logger.warn('Web search refused', { status: response.status });
      throw new WebSearchError(BRAVE_FAILURES[response.status] ?? `the search engine answered ${response.status}`);
    }
    const body: unknown = await response.json().catch(() => null);
    return braveResults(body).slice(0, spec.results);
  }
}
