/**
 * Importing npm packages
 */
import { existsSync, readFileSync } from 'node:fs';

import { type APIRequestContext, type APIResponse, type Browser, type BrowserContext, expect, test } from '@playwright/test';

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

/** The opaque app-session handle every Shadow app issues; its value is the session, so a new session is a new value. */
const APP_SESSION_COOKIE = '__Host-shadow-session';

/** Reads the app-session handle `host` issued, out of a jar that may hold one per origin. */
function appSessionHandleForHost(cookies: StoredCookie[], host: string): string | undefined {
  return cookies.find(c => c.name === APP_SESSION_COOKIE && (c.domain === host || c.domain === `.${host}`))?.value;
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

/**
 * A browser context for `persona`, signed in to the app at `baseUrl` and acting inside `organisationId`. A user's
 * organisation travels in the app session and switching it rotates the session handle, so this mints a *fresh*
 * app session over the persona's identity cookies and switches that one — leaving the persona's saved storage
 * state, which the rest of the suite keeps using, untouched. That separation is asserted, not assumed: the
 * handle must have *changed* before anything rotates it. A missing storage state is not loaded (mirroring
 * `apiContext`), so a skipped setup project fails on the assertions below rather than on an ENOENT.
 */
export async function organisationBoundContext(browser: Browser, persona: LoginPersona, baseUrl: string, organisationId: string): Promise<BrowserContext> {
  const statePath = storageStateFor(persona);
  const context = await browser.newContext({ storageState: existsSync(statePath) ? statePath : undefined, ignoreHTTPSErrors: true });
  const host = hostOf(baseUrl);
  const saved = appSessionHandleForHost((await context.storageState()).cookies as StoredCookie[], host);

  const page = await context.newPage();
  try {
    // `page.goto` resolves on an HTTP error as readily as on a success, and the loaded storage state already
    // carries a working handle — so a hop that quietly failed still answers `/api/auth/session` with a 200, off
    // the persona's *saved* session, which the switch below would then rotate and kill for every other spec.
    // Only a handle that changed proves a second session was minted.
    const navigation = await page.goto(`${baseUrl}/api/auth/login?return_to=/`);
    const minted = appSessionHandleForHost((await context.storageState()).cookies as StoredCookie[], host);
    const detail = `goto ${navigation?.status()}, landed on ${page.url()}`;
    expect(minted, `the OIDC hop should leave ${persona} an app session on ${host} (${detail})`).toBeTruthy();
    expect(minted, `the OIDC hop should mint ${persona} a *new* app session, not reuse the saved one (${detail})`).not.toBe(saved);
  } finally {
    await page.close();
  }

  const switched = await scopedMutate(context.request, baseUrl, 'post', '/api/auth/organisation', { data: { organisationId } });
  expect(switched.status(), `switching ${persona}'s session into organisation ${organisationId} — body ${await switched.text()}`).toBe(200);
  return context;
}

/** Reads a single cookie's value out of `persona`'s saved storage state — used to smuggle one origin's opaque handle onto another. */
export function cookieFromStorageState(persona: LoginPersona, name: string, domain: string): string {
  const state = JSON.parse(readFileSync(storageStateFor(persona), 'utf8')) as { cookies: StoredCookie[] };
  const cookie = state.cookies.find(c => c.name === name && c.domain === domain);
  if (!cookie) throw new Error(`cookie ${name} for ${domain} not found in ${persona}'s storage state — was the seed/setup run?`);
  return cookie.value;
}
