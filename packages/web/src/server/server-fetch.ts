/**
 * Importing npm packages
 */
import { getRequest, getResponseHeaders, setResponseHeader } from '@tanstack/react-start/server';

/**
 * Importing user defined packages
 */
import { type ErrorResponse } from '../lib/api-error';
import { type ApiResult } from '../lib/api-result';

/**
 * Defining types
 *
 * The server-only transport for a Shadow backend. Every endpoint is reached through a TanStack Start server
 * function whose handler goes through this. It runs only on the Start server — for the initial SSR document
 * and for client-invoked server-function RPC alike — so it is the single place that (a) forwards the
 * caller's session cookie to the backend, (b) replays the CSRF double-submit token, and (c) relays the
 * backend's `Set-Cookie` headers (session, refreshed CSRF) back to the browser.
 */
export interface ServerFetchConfig {
  /** The backend origin + version prefix, e.g. `${SERVER_URL}/api/v1`. */
  baseUrl: string;
  /** Cookie the backend reads the CSRF token from. @default 'csrf-token' */
  csrfCookie?: string;
  /** Header the backend compares the CSRF token against. @default 'x-csrf-token' */
  csrfHeader?: string;
  /** Lifetime of a minted CSRF token. @default 3600 */
  csrfTtlSeconds?: number;
}

export interface ServerFetchSpec {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path under the configured `baseUrl`, e.g. `/me` or `/me/sessions/${id}`. */
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Non-2xx statuses whose typed body should resolve instead of failing (interactive auth flows). */
  modeled?: number[];
}

export type ServerFetch = <T>(spec: ServerFetchSpec) => Promise<ApiResult<T>>;

/**
 * Declaring the constants
 */
function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** The cookie name portion of a raw `Set-Cookie` string, lowercased for case-insensitive de-duping. */
function cookieName(raw: string): string {
  const eq = raw.indexOf('=');
  return (eq === -1 ? raw : raw.slice(0, eq)).trim().toLowerCase();
}

/**
 * Build a `serverFetch` bound to one backend. The returned function is what each server-function handler
 * calls; keep the returned value in a single module and import it across the app's `*.api.ts` files.
 */
export function createServerFetch(config: ServerFetchConfig): ServerFetch {
  const csrfCookie = config.csrfCookie ?? 'csrf-token';
  const csrfHeader = config.csrfHeader ?? 'x-csrf-token';
  const ttlSeconds = config.csrfTtlSeconds ?? 3600;
  const csrfPattern = new RegExp(`(?:^|;\\s*)${csrfCookie}=([^;]+)`);

  /**
   * The backend's CSRF middleware compares the cookie against the header (double-submit) and does not
   * require a server-minted value. Requests now originate from the Start server rather than the browser, so
   * we satisfy the double-submit ourselves: echo the token from the forwarded cookie, or mint a fresh
   * `expiry:token` pair (the format the backend shares) when there is none.
   */
  function ensureCsrf(cookieHeader: string): { token: string; cookieHeader: string; mintedValue?: string } {
    const match = cookieHeader.match(csrfPattern);
    if (match?.[1]) {
      const value = decodeURIComponent(match[1]);
      const colon = value.indexOf(':');
      const expiry = colon === -1 ? '' : value.slice(0, colon);
      const token = colon === -1 ? value : value.slice(colon + 1);
      if (token && (!expiry || parseInt(expiry, 36) > Date.now())) return { token, cookieHeader };
    }
    const token = randomHex(16);
    const mintedValue = `${(Date.now() + ttlSeconds * 1000).toString(36)}:${token}`;
    const cookie = `${csrfCookie}=${mintedValue}`;
    return { token, cookieHeader: cookieHeader ? `${cookieHeader}; ${cookie}` : cookie, mintedValue };
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

  return async function serverFetch<T>(spec: ServerFetchSpec): Promise<ApiResult<T>> {
    const incomingCookie = getRequest().headers.get('cookie') ?? '';
    const csrf = ensureCsrf(incomingCookie);

    const params = new URLSearchParams();
    if (spec.query) {
      for (const [key, value] of Object.entries(spec.query)) {
        if (value !== undefined && value !== null) params.set(key, String(value));
      }
    }
    const queryString = params.toString();
    const url = `${config.baseUrl}${spec.path}${queryString ? `?${queryString}` : ''}`;

    const headers: Record<string, string> = { accept: 'application/json', cookie: csrf.cookieHeader, [csrfHeader]: csrf.token, ...spec.headers };
    const init: RequestInit = { method: spec.method, headers, redirect: 'manual' };
    if (spec.body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(spec.body);
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch {
      return { ok: false, failure: { status: -1, code: 'NETWORK_ERROR', type: 'NetworkError', message: 'Unable to reach the server' } };
    }

    const backendCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    const relayed = [...backendCookies];
    // If we minted a CSRF token the backend didn't echo back, persist it so the browser carries it next time.
    if (csrf.mintedValue && !relayed.some(cookie => cookieName(cookie) === csrfCookie)) {
      relayed.push(`${csrfCookie}=${csrf.mintedValue}; Path=/; Max-Age=${ttlSeconds}; SameSite=Lax`);
    }
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
