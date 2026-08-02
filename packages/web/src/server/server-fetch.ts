/**
 * Importing npm packages
 */
import { getRequest, getResponseHeaders, setResponseHeader } from '@tanstack/react-start/server';

/**
 * Importing user defined packages
 */
import { type ErrorResponse } from '../lib/api-error';
import { type ApiResult } from '../lib/api-result';
import { type CsrfConfig, csrfSetCookie, ensureCsrfToken, resolveCsrfConfig } from '../lib/csrf';
import { type ServerFetch, type ServerFetchSpec } from '../lib/transport';

/**
 * Defining types
 *
 * The server-only half of the isomorphic transport. In the browser an app calls the same-origin `/api/*`
 * directly — the ingress routes that prefix to the backend, so cookies and the CSRF double-submit work
 * natively. On the SSR pass there is no browser to do either: relative URLs have nothing to resolve
 * against, and the caller's cookies live on the inbound request rather than on this process. So this is the
 * single place that (a) reaches the backend by absolute origin, (b) forwards the caller's cookies and
 * chosen request headers, (c) satisfies the CSRF double-submit, and (d) relays the backend's `Set-Cookie`
 * headers back to the browser.
 *
 * This module imports `@tanstack/react-start/server`, so it must stay out of the client graph:
 * `createApiClient` only ever reaches it through a dynamic import the browser branch never invokes.
 */
export interface ServerFetchConfig {
  /** Prefix every `spec.path` is appended to. Under `createApiClient` this is the bare backend origin — the surface contributes the path prefix. */
  baseUrl: string;
  /** CSRF cookie/header/TTL overrides; the defaults match every Shadow backend. */
  csrf?: CsrfConfig;
  /**
   * Inbound request headers relayed to the backend. `user-agent` is forwarded by default because the
   * backend records it as the session's device — without it every session the backend mints records this
   * SSR runtime as the device instead of the real browser.
   * @default ['user-agent']
   */
  forwardHeaders?: string[];
}

/** The request/response contract is declared browser-side in `lib/transport` — see the note there for why — and surfaced here for apps that import it from `@shadow-library/web/server`. */
export type { ServerFetch, ServerFetchSpec };

/**
 * Declaring the constants
 */
const DEFAULT_FORWARD_HEADERS = ['user-agent'];

/** The cookie name portion of a raw `Set-Cookie` string, lowercased for case-insensitive de-duping. */
function cookieName(raw: string): string {
  const eq = raw.indexOf('=');
  return (eq === -1 ? raw : raw.slice(0, eq)).trim().toLowerCase();
}

/**
 * Relay the backend's `Set-Cookie` headers to the browser response, de-duped by cookie name (last wins) so
 * repeated CSRF refreshes across a multi-query loader don't bloat the response. Raw strings are used
 * verbatim to preserve `__Host-`/`Secure`/`HttpOnly`/`SameSite` attributes exactly.
 */
function relaySetCookies(incoming: string[]): void {
  if (incoming.length === 0) return;
  const headers = getResponseHeaders();
  const existing = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  const byName = new Map<string, string>();
  for (const cookie of [...existing, ...incoming]) byName.set(cookieName(cookie), cookie);
  setResponseHeader('set-cookie', [...byName.values()]);
}

// Some action endpoints answer 200 with an empty or non-JSON body — treat that as a void result.
async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Build a `serverFetch` bound to one backend. Apps do not call this directly — they hand it to
 * `createApiClient` as the SSR half of one transport, from a module the browser never imports.
 */
export function createServerFetch(config: ServerFetchConfig): ServerFetch {
  const csrf = resolveCsrfConfig(config.csrf);
  const forwardHeaders = config.forwardHeaders ?? DEFAULT_FORWARD_HEADERS;

  return async function serverFetch<T>(spec: ServerFetchSpec): Promise<ApiResult<T>> {
    const request = getRequest();
    const incomingCookie = request.headers.get('cookie') ?? '';

    // The backend compares the CSRF cookie against the header (double-submit) and does not require a
    // server-minted value. These requests originate here rather than in the browser, so the double-submit
    // is satisfied here too: echo the token from the forwarded cookie, or mint a pair and append it to the
    // cookie header we send, so both halves agree on this request as well as the next one.
    const token = ensureCsrfToken(incomingCookie, csrf);
    const cookieHeader = token.mintedValue ? [incomingCookie, `${csrf.cookie}=${token.mintedValue}`].filter(Boolean).join('; ') : incomingCookie;

    const params = new URLSearchParams();
    if (spec.query) {
      for (const [key, value] of Object.entries(spec.query)) {
        if (value !== undefined && value !== null) params.set(key, String(value));
      }
    }
    const queryString = params.toString();
    const url = `${config.baseUrl}${spec.path}${queryString ? `?${queryString}` : ''}`;

    const headers: Record<string, string> = { accept: 'application/json', cookie: cookieHeader, [csrf.header]: token.token };
    for (const name of forwardHeaders) {
      const value = request.headers.get(name);
      if (value) headers[name] = value;
    }
    Object.assign(headers, spec.headers);

    const init: RequestInit = { method: spec.method, headers, redirect: 'manual' };
    if (spec.signal) init.signal = spec.signal;
    if (spec.body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(spec.body);
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      // A cancelled or timed-out request propagates as-is so the caller reads it as a cancellation rather
      // than a failed request masquerading as a network error.
      if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) throw error;
      return { ok: false, failure: { status: -1, code: 'NETWORK_ERROR', type: 'NetworkError', message: 'Unable to reach the server' } };
    }

    const backendCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    const relayed = [...backendCookies];
    // If we minted a CSRF token the backend didn't echo back, persist it so the browser carries it next time.
    if (token.mintedValue && !relayed.some(cookie => cookieName(cookie) === csrf.cookie)) relayed.push(csrfSetCookie(token.mintedValue, csrf));
    relaySetCookies(relayed);

    const payload = await parseBody(response);
    if (response.ok || spec.modeled?.includes(response.status)) return { ok: true, data: payload as T };

    const envelope = (payload ?? {}) as Partial<ErrorResponse>;
    const retryAfter = response.headers.get('retry-after');
    return {
      ok: false,
      failure: {
        status: response.status,
        code: envelope.code ?? 'UNKNOWN_ERROR',
        type: envelope.type ?? 'UnknownError',
        message: envelope.message ?? `Request failed with status ${response.status}`,
        fields: envelope.fields,
        retryAfterSeconds: retryAfter ? parseInt(retryAfter, 10) : undefined,
      },
    };
  };
}
