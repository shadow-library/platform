import { existsSync } from 'node:fs';

import { type APIRequestContext, type APIResponse, request } from '@playwright/test';

import { clientIpHeaders } from './client-ip';
import { type ProductKey, requireProductUrl } from './env';
import { type LoginPersona, storageStateFor } from './personas';

/** A mutating HTTP method — the ones the CSRF double-submit guard applies to. */
type MutationMethod = 'post' | 'put' | 'patch' | 'delete';

export interface ApiContextOptions {
  /** Sent as `X-Forwarded-For` on every request, so identity charges this address's rate limits. */
  clientIp?: string;
}

export interface MutateOptions {
  /** JSON body sent with the request. */
  data?: unknown;
  /** Extra headers merged over the CSRF header. */
  headers?: Record<string, string>;
  /** The GET path used to mint the `csrf-token` cookie before the mutation. Defaults to the session endpoint. */
  csrfSeedPath?: string;
}

export interface PollWindow {
  /** Total time to keep polling before giving up. Defaults to 5 minutes — the per-call AI budget in dev. */
  timeoutMs?: number;
  /** Delay between polls. */
  intervalMs?: number;
}

/** An `APIRequestContext` for `product`; without `persona`'s storage state (setup skipped) it is created unauthenticated, so the caller's own auth assertion fails. */
export async function apiContext(product: ProductKey, persona?: LoginPersona, options: ApiContextOptions = {}): Promise<APIRequestContext> {
  const baseURL = requireProductUrl(product);
  const statePath = persona ? storageStateFor(persona) : undefined;
  const storageState = statePath && existsSync(statePath) ? statePath : undefined;
  const extraHTTPHeaders = options.clientIp ? clientIpHeaders(options.clientIp) : undefined;
  return request.newContext({ baseURL, ignoreHTTPSErrors: true, storageState, extraHTTPHeaders });
}

/**
 * The `csrf-token` cookie's token half for `host`. The cookie value is `expiry(radix36):hex` and the server compares `x-csrf-token` against the `hex` half alone
 * (`CSRFTokenService.validateToken`). A persona's storage state holds one `csrf-token` per app, so the lookup is scoped to the host.
 */
async function readCsrfToken(ctx: APIRequestContext, host: string): Promise<string | undefined> {
  const { cookies } = await ctx.storageState();
  const cookie = cookies.find(c => c.name === 'csrf-token' && c.domain.replace(/^\./, '') === host);
  return cookie?.value.split(':')[1];
}

/**
 * The double-submit header for `ctx`, minting the token by GETting `seedPath` first. Take it once and reuse it for concurrent mutations: each seeding GET
 * reissues the cookie, so a request racing another's reissue would echo a token the jar no longer holds and be refused.
 * CSRF is only issued and enforced once the request carries a session cookie, so this is a no-op on an unauthenticated context.
 */
export async function csrfHeaders(ctx: APIRequestContext, seedPath = '/api/auth/session'): Promise<Record<string, string>> {
  const seed = await ctx.get(seedPath);
  const token = await readCsrfToken(ctx, new URL(seed.url()).hostname);
  return token ? { 'x-csrf-token': token } : {};
}

export async function mutate(ctx: APIRequestContext, method: MutationMethod, url: string, options: MutateOptions = {}): Promise<APIResponse> {
  const headers = { ...(await csrfHeaders(ctx, options.csrfSeedPath)), ...options.headers };
  return ctx[method](url, { headers, ...(options.data === undefined ? {} : { data: options.data }) });
}

/** Returns the last result whether or not `done` accepted it, so a caller asserts on the settled value instead of getting a thrown timeout. */
export async function pollUntil<T>(probe: () => Promise<T>, done: (value: T) => boolean, options: PollWindow = {}): Promise<T> {
  const intervalMs = options.intervalMs ?? 2_000;
  const deadline = Date.now() + (options.timeoutMs ?? 300_000);

  for (;;) {
    const value = await probe();
    if (done(value) || Date.now() >= deadline) return value;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}
