/**
 * Importing npm packages
 */
import { readFileSync } from 'node:fs';

import { type APIRequestContext, type APIResponse, expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { type LoginPersona, storageStateFor } from '../../lib';

/**
 * Defining types
 */

/** A mutating HTTP method — the ones the CSRF double-submit guard applies to once a cookie is present. */
type MutationMethod = 'post' | 'put' | 'patch' | 'delete';

interface StoredCookie {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
}

export interface ScopedMutateOptions {
  /** JSON body. */
  data?: unknown;
  /** Extra headers merged over the CSRF header. */
  headers?: Record<string, string>;
  /** The GET path (relative to `baseUrl`) that mints/refreshes the `csrf-token` cookie for this origin. */
  seedPath?: string;
}

/**
 * Declaring the constants
 *
 * Shared helpers for the cross-app specs. They exist here rather than in `lib/` because the ownership split for
 * this work keeps every cross-app-only helper inside this directory. The two things a cross-app spec needs that
 * the shared `lib` doesn't already give it: an identity login scripted over an arbitrary request context (so a
 * *fresh* browser context can be signed in for the SSO flow), and a CSRF double-submit that is scoped to a single
 * origin — after SSO a browser context carries a `csrf-token` cookie for several origins at once, and the shared
 * `mutate` picks the first one it finds, which is not necessarily the one the target origin will validate against.
 */

/** The origin host of `baseUrl`, used to select the right `csrf-token` cookie out of a multi-origin jar. */
function hostOf(baseUrl: string): string {
  return new URL(baseUrl).host;
}

/**
 * Runs identity's password login flow (`login/init` → `challenge/verify`) over `ctx`, leaving `__Host-sid` +
 * `isLoggedIn` in that context's cookie jar. Each call spends one `login/init` against identity's 20/hour limit,
 * so callers keep these to a minimum. Asserts the flow reaches `COMPLETED` so a misconfigured account fails here
 * with a pointed message rather than downstream.
 */
export async function loginIdentity(ctx: APIRequestContext, identityUrl: string, email: string, password: string): Promise<void> {
  const init = await ctx.post(`${identityUrl}/api/v1/auth/login/init`, { data: { identifier: email } });
  // Identity caps login/init at 20/hour per identifier/IP. A run that has exhausted that quota should skip cleanly
  // rather than fail — the rate limit is shared across the whole suite, so a 429 here is an environment condition,
  // not a defect in what this spec asserts (the infra guidance: treat an unexpected 429 as a skip).
  test.skip(init.status() === 429, `identity login/init is rate-limited (429) for ${email} — 20/hour cap reached; re-run after the window resets`);
  expect(init.status(), `login/init for ${email}`).toBe(200);
  const initBody = (await init.json()) as { flowId: string; status: string };
  expect(initBody.status, `expected a password prompt for ${email}`).toBe('AWAITING_PASSWORD');

  const verify = await ctx.post(`${identityUrl}/api/v1/auth/challenge/verify`, { data: { flowId: initBody.flowId, password } });
  expect(verify.status(), `challenge/verify for ${email}`).toBe(200);
  const verifyBody = (await verify.json()) as { status: string };
  expect(verifyBody.status, `expected COMPLETED login for ${email}`).toBe('COMPLETED');
}

/** Reads the token half (`expiry:hex` → `hex`) of the `csrf-token` cookie whose domain matches `host`, if present. */
function csrfTokenForHost(cookies: StoredCookie[], host: string): string | undefined {
  const cookie = cookies.find(c => c.name === 'csrf-token' && (c.domain === host || c.domain === `.${host}`));
  return cookie?.value.split(':')[1];
}

/**
 * A mutating request carrying the double-submit CSRF token for `baseUrl`'s own origin. It seeds the `csrf-token`
 * cookie by GETting `seedPath` on that origin, then echoes the token half of exactly that origin's cookie — never
 * a sibling app's — in `x-csrf-token`. Use this instead of `lib`'s `mutate` whenever the context may hold cookies
 * for more than one origin (any post-SSO browser context).
 */
export async function scopedMutate(ctx: APIRequestContext, baseUrl: string, method: MutationMethod, path: string, options: ScopedMutateOptions = {}): Promise<APIResponse> {
  const host = hostOf(baseUrl);
  await ctx.get(`${baseUrl}${options.seedPath ?? '/api/auth/session'}`);
  const { cookies } = await ctx.storageState();
  const token = csrfTokenForHost(cookies as StoredCookie[], host);
  const headers = { ...(token ? { 'x-csrf-token': token } : {}), ...options.headers };
  return ctx[method](`${baseUrl}${path}`, { headers, ...(options.data === undefined ? {} : { data: options.data }) });
}

/** Reads a single cookie's value out of `persona`'s saved storage state — used to smuggle one origin's opaque handle onto another. */
export function cookieFromStorageState(persona: LoginPersona, name: string, domain: string): string {
  const state = JSON.parse(readFileSync(storageStateFor(persona), 'utf8')) as { cookies: StoredCookie[] };
  const cookie = state.cookies.find(c => c.name === name && c.domain === domain);
  if (!cookie) throw new Error(`cookie ${name} for ${domain} not found in ${persona}'s storage state — was the seed/setup run?`);
  return cookie.value;
}
