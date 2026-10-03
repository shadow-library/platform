import { AppErrorCode } from '@server/classes';

import { tidyText } from './html-text';
import { type Fetcher } from './web-address';

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  /** How old the page is, as the search engine words it ("2 days ago"), when it knows. */
  age?: string;
}

export interface BraveSearchOptions {
  apiKey: string;
  count: number;
  fetch: Fetcher;
  timeoutMs: number;
}

const BRAVE_WEB_SEARCH = 'https://api.search.brave.com/res/v1/web/search';

const FAILURE: Readonly<Record<number, string>> = {
  401: 'the Brave Search API key was refused',
  403: 'the Brave Search API key is not allowed this search',
  422: 'the search engine could not read that query',
  429: 'the search engine is rate limiting this server — try fewer searches',
};

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// Brave marks the matched words in titles and descriptions with <strong>; the model reads plain text.
function plain(value: unknown): string {
  return tidyText(text(value).replace(/<[^>]*>/g, ''));
}

function resultsOf(body: unknown): unknown[] {
  if (typeof body !== 'object' || body === null) return [];
  const web = (body as { web?: unknown }).web;
  if (typeof web !== 'object' || web === null) return [];
  const results = (web as { results?: unknown }).results;
  return Array.isArray(results) ? results : [];
}

function toResult(entry: unknown): WebResult | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const record = entry as Record<string, unknown>;
  const url = text(record['url']);
  if (!/^https?:\/\//i.test(url)) return null;
  const age = text(record['age']);
  return { title: plain(record['title']) || url, url, snippet: plain(record['description']), ...(age ? { age } : {}) };
}

export async function braveSearch(query: string, options: BraveSearchOptions): Promise<WebResult[]> {
  const url = `${BRAVE_WEB_SEARCH}?${new URLSearchParams({ q: query, count: String(options.count), safesearch: 'moderate', text_decorations: 'false' })}`;
  const response = await options
    .fetch(url, { headers: { accept: 'application/json', 'x-subscription-token': options.apiKey }, signal: AbortSignal.timeout(options.timeoutMs) })
    .catch(() => {
      throw AppErrorCode.AI_020.create({ reason: 'the search engine could not be reached' });
    });
  if (!response.ok) throw AppErrorCode.AI_020.create({ reason: FAILURE[response.status] ?? `the search engine answered ${response.status}` });
  const body: unknown = await response.json().catch(() => null);
  return resultsOf(body)
    .map(toResult)
    .filter(result => result !== null);
}
