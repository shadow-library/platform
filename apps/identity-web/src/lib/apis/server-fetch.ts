/**
 * Importing npm packages
 */
import { getRequest, getResponseHeaders, setResponseHeader } from '@tanstack/react-start/server';

/**
 * Importing user defined packages
 */
import { type ApiResult, type ErrorResponseDto, type QueryValue } from './api-request';

/**
 * Defining types
 *
 * The server-only transport for the identity API. Every identity endpoint is reached through a
 * TanStack Start server function, and every one of those handlers goes through `serverFetch`. It runs
 * only on the Start server — for the initial SSR document and for the client-invoked server-function
 * RPC alike — so it is the single place that (a) forwards the caller's session cookie to the identity
 * server, (b) replays the CSRF double-submit token, and (c) relays the backend's `Set-Cookie` headers
 * (session, refreshed CSRF) back to the browser. It is imported only from server-function handlers, so
 * the TanStack Start plugin strips it — and this server-only import — from the browser bundle.
 */

export interface ServerFetchSpec {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path under `/api/v1`, e.g. `/me` or `/me/sessions/${id}`. */
  path: string;
  query?: Record<string, QueryValue | undefined | null>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Non-2xx statuses whose typed body should resolve instead of failing (interactive auth flows). */
  modeled?: number[];
}

/**
 * Declaring the constants
 */
const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:9091';
const BASE_URL = `${SERVER_URL}/api/v1`;
const CSRF_COOKIE = 'csrf-token';
const CSRF_HEADER = 'x-csrf-token';
const CSRF_TTL_SECONDS = 3600;

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
 * The identity server's CSRF middleware only compares the `csrf-token` cookie against the
 * `x-csrf-token` header (it does not require a server-minted value), and refreshes the cookie on every
 * cookied response. Requests now originate from this Start server rather than the browser, so we
 * satisfy the double-submit ourselves: echo the token from the forwarded cookie, or mint a fresh
 * `expiry:token` pair (the format the backend and old browser client share) when there is none.
 */
interface Csrf {
  token: string;
  cookieHeader: string;
  /** Set when we minted a token the backend hasn't seen — persisted to the browser so it echoes back. */
  mintedValue?: string;
}

function ensureCsrf(cookieHeader: string): Csrf {
  const match = cookieHeader.match(/(?:^|;\s*)csrf-token=([^;]+)/);
  if (match?.[1]) {
    const value = decodeURIComponent(match[1]);
    const colon = value.indexOf(':');
    const expiry = colon === -1 ? '' : value.slice(0, colon);
    const token = colon === -1 ? value : value.slice(colon + 1);
    if (token && (!expiry || parseInt(expiry, 36) > Date.now())) return { token, cookieHeader };
  }
  const token = randomHex(16);
  const mintedValue = `${(Date.now() + CSRF_TTL_SECONDS * 1000).toString(36)}:${token}`;
  const cookie = `${CSRF_COOKIE}=${mintedValue}`;
  return { token, cookieHeader: cookieHeader ? `${cookieHeader}; ${cookie}` : cookie, mintedValue };
}

/**
 * Relays the backend's `Set-Cookie` headers to the browser response, de-duped by cookie name (the last
 * value wins) so repeated CSRF refreshes across a multi-query loader don't bloat the response. Uses the
 * raw cookie strings verbatim to preserve `__Host-`/`Secure`/`HttpOnly`/`SameSite` attributes exactly.
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
 * Declaring the transport
 */
export async function serverFetch<T>(spec: ServerFetchSpec): Promise<ApiResult<T>> {
  const incomingCookie = getRequest().headers.get('cookie') ?? '';
  const csrf = ensureCsrf(incomingCookie);

  const params = new URLSearchParams();
  if (spec.query) {
    for (const [key, value] of Object.entries(spec.query)) {
      if (value !== undefined && value !== null) params.set(key, String(value));
    }
  }
  const queryString = params.toString();
  const url = `${BASE_URL}${spec.path}${queryString ? `?${queryString}` : ''}`;

  const headers: Record<string, string> = { accept: 'application/json', cookie: csrf.cookieHeader, [CSRF_HEADER]: csrf.token, ...spec.headers };
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
  if (csrf.mintedValue && !relayed.some(cookie => cookieName(cookie) === CSRF_COOKIE)) {
    relayed.push(`${CSRF_COOKIE}=${csrf.mintedValue}; Path=/; Max-Age=${CSRF_TTL_SECONDS}; SameSite=Lax`);
  }
  relaySetCookies(relayed);

  const payload = await parseBody(response);
  if (response.ok || spec.modeled?.includes(response.status)) return { ok: true, data: payload as T };

  const envelope = (payload ?? {}) as Partial<ErrorResponseDto>;
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
}
