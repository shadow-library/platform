import { type AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';

import { htmlToText, tidyText } from './html-text';
import { type AddressLookup, assertPublicUrl, type Fetcher } from './web-address';

export interface WebPage {
  /** Where the page ended up after redirects. */
  url: string;
  title: string | null;
  text: string;
}

export interface PageFetchOptions {
  fetch: Fetcher;
  resolve: AddressLookup;
  timeoutMs: number;
  maxBytes: number;
}

const MAX_REDIRECTS = 5;
const HTML_TYPES = new Set(['text/html', 'application/xhtml+xml']);
const USER_AGENT = 'Mozilla/5.0 (compatible; NovelForgeResearch/1.0)';

function refused(reason: string): AppError {
  return AppErrorCode.AI_021.create({ reason });
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const kept = value.subarray(0, maxBytes - bytes);
    bytes += kept.byteLength;
    text += decoder.decode(kept, { stream: true });
    if (bytes >= maxBytes) {
      await reader.cancel();
      break;
    }
  }
  return text + decoder.decode();
}

/**
 * Fetches a public page and returns its readable text. Redirects are followed by hand so every hop passes the same public-address check
 * as the first; anything that is not an HTML or plain-text page is refused rather than read.
 */
export async function fetchPage(raw: string, options: PageFetchOptions): Promise<WebPage> {
  const signal = AbortSignal.timeout(options.timeoutMs);
  let url = await assertPublicUrl(raw, options.resolve);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await options
      .fetch(url, { redirect: 'manual', signal, headers: { accept: 'text/html,application/xhtml+xml,text/plain;q=0.9', 'user-agent': USER_AGENT } })
      .catch(() => {
        throw refused('the site could not be reached in time');
      });

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw refused(`the site answered ${response.status} without saying where to go`);
      url = await assertPublicUrl(new URL(location, url).href, options.resolve);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw refused(`the site answered ${response.status}`);
    }

    const type = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    if (!HTML_TYPES.has(type) && type !== 'text/plain') {
      await response.body?.cancel();
      throw refused(`it is ${type || 'of an unknown type'}, not a web page`);
    }
    const body = await readCapped(response, options.maxBytes);
    if (type === 'text/plain') return { url: url.href, title: null, text: tidyText(body) };
    return { url: url.href, ...htmlToText(body) };
  }
  throw refused('it redirected too many times');
}
