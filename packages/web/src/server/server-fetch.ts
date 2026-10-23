import { getRequest, getResponseHeaders, setResponseHeader } from '@tanstack/react-start/server';

import { type ErrorResponse } from '../lib/api-error';
import { type ApiResult } from '../lib/api-result';
import { type CsrfConfig, csrfSetCookie, ensureCsrfToken, resolveCsrfConfig } from '../lib/csrf';
import { type ServerFetch, type ServerFetchSpec } from '../lib/transport';

export interface ServerFetchConfig {
  /** Prefix every `spec.path` is appended to; under `createApiClient` this is the bare backend origin, as the surface contributes the path prefix. */
  baseUrl: string;
  /** CSRF cookie/header/TTL overrides; the defaults match every Shadow backend. */
  csrf?: CsrfConfig;
  /**
   * Inbound request headers relayed to the backend so it attributes device, locale and client IP to the real client rather than this SSR runtime.
   * @default ['user-agent', 'accept-language', 'x-forwarded-for']
   */
  forwardHeaders?: string[];
}

export type { ServerFetch, ServerFetchSpec };

const DEFAULT_FORWARD_HEADERS = ['user-agent', 'accept-language', 'x-forwarded-for'];

/** Propagated by this web tier and every backend so an SSR call joins the backend's logs for that request. */
const CORRELATION_HEADER = 'x-correlation-id';

/** One id per inbound request, shared by every `serverFetch` of a multi-query loader; weakly keyed so it is collected with the request. */
const correlationIds = new WeakMap<Request, string>();

function correlationId(request: Request): string {
  const inbound = request.headers.get(CORRELATION_HEADER);
  if (inbound) return inbound;
  const existing = correlationIds.get(request);
  if (existing) return existing;
  const minted = crypto.randomUUID();
  correlationIds.set(request, minted);
  return minted;
}

function cookieName(raw: string): string {
  const eq = raw.indexOf('=');
  return (eq === -1 ? raw : raw.slice(0, eq)).trim().toLowerCase();
}

// De-duped by cookie name (last wins) so repeated CSRF refreshes don't bloat the response; raw strings keep `__Host-`/`Secure`/`SameSite` attributes intact.
function relaySetCookies(incoming: string[]): void {
  if (incoming.length === 0) return;
  const headers = getResponseHeaders();
  const existing = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  const byName = new Map<string, string>();
  for (const cookie of [...existing, ...incoming]) byName.set(cookieName(cookie), cookie);
  setResponseHeader('set-cookie', [...byName.values()]);
}

// Some action endpoints answer 200 with an empty or non-JSON body; that is a void result.
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
 * Server-only transport: reaches the backend by absolute origin, forwards the caller's cookies and headers, satisfies the CSRF double-submit and relays `Set-Cookie`.
 * Imports `@tanstack/react-start/server`, so it must stay out of the client graph.
 */
export function createServerFetch(config: ServerFetchConfig): ServerFetch {
  const csrf = resolveCsrfConfig(config.csrf);
  const forwardHeaders = config.forwardHeaders ?? DEFAULT_FORWARD_HEADERS;

  return async function serverFetch<T>(spec: ServerFetchSpec): Promise<ApiResult<T>> {
    const request = getRequest();
    const incomingCookie = request.headers.get('cookie') ?? '';

    // Double-submit: echo the token from the forwarded cookie, or mint one and append it to the cookie header so both halves agree.
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
    headers[CORRELATION_HEADER] = correlationId(request);
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
      if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) throw error;
      return { ok: false, failure: { status: -1, code: 'NETWORK_ERROR', type: 'NetworkError', message: 'Unable to reach the server' } };
    }

    const backendCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    const relayed = [...backendCookies];
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
