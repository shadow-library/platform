import { existsSync, readFileSync } from 'node:fs';

import { type APIRequestContext, type APIResponse, type Browser, type BrowserContext, expect, test } from '@playwright/test';

import { type LoginPersona, storageStateFor } from '../../lib';

type MutationMethod = 'post' | 'put' | 'patch' | 'delete';

interface StoredCookie {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
}

export interface ScopedMutateOptions {
  data?: unknown;
  /** Extra headers merged over the CSRF header. */
  headers?: Record<string, string>;
  /** The GET path (relative to `baseUrl`) that mints/refreshes the `csrf-token` cookie for this origin. */
  seedPath?: string;
}

/**
 * Cross-app helpers: an identity login scripted over an arbitrary request context (so a fresh browser context can be signed in for SSO), and a CSRF double-submit
 * scoped to one origin. After SSO a context carries a `csrf-token` cookie per origin, and `lib`'s `mutate` takes the first it finds, which the target origin may not validate.
 */

function hostOf(baseUrl: string): string {
  return new URL(baseUrl).host;
}

/**
 * Runs the password login flow over `ctx`, leaving `__Host-sid` + `isLoggedIn` in its jar. Spends one `login/init` of the 20/hour limit and asserts `COMPLETED` so a
 * misconfigured account fails here.
 */
export async function loginIdentity(ctx: APIRequestContext, identityUrl: string, email: string, password: string): Promise<void> {
  const init = await ctx.post(`${identityUrl}/api/v1/auth/login/init`, { data: { identifier: email } });
  // The 20/hour `login/init` limit is shared across the suite, so a 429 is an environment condition: skip, don't fail.
  test.skip(init.status() === 429, `identity login/init is rate-limited (429) for ${email} — 20/hour cap reached; re-run after the window resets`);
  expect(init.status(), `login/init for ${email}`).toBe(200);
  const initBody = (await init.json()) as { flowId: string; status: string };
  expect(initBody.status, `expected a password prompt for ${email}`).toBe('AWAITING_PASSWORD');

  const verify = await ctx.post(`${identityUrl}/api/v1/auth/challenge/verify`, { data: { flowId: initBody.flowId, password } });
  expect(verify.status(), `challenge/verify for ${email}`).toBe(200);
  const verifyBody = (await verify.json()) as { status: string };
  expect(verifyBody.status, `expected COMPLETED login for ${email}`).toBe('COMPLETED');
}

const APP_SESSION_COOKIE = '__Host-shadow-session';

function appSessionHandleForHost(cookies: StoredCookie[], host: string): string | undefined {
  return cookies.find(c => c.name === APP_SESSION_COOKIE && (c.domain === host || c.domain === `.${host}`))?.value;
}

function csrfTokenForHost(cookies: StoredCookie[], host: string): string | undefined {
  const cookie = cookies.find(c => c.name === 'csrf-token' && (c.domain === host || c.domain === `.${host}`));
  return cookie?.value.split(':')[1];
}

/**
 * A mutating request with the double-submit CSRF token of `baseUrl`'s own origin (seeded by GETting `seedPath`), never a sibling app's. Use instead of `lib`'s `mutate` when the
 * context may hold cookies for several origins.
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
 * A browser context for `persona`, signed in at `baseUrl` and acting inside `organisationId`. Switching organisation rotates the app-session handle, so this mints a
 * fresh app session over the persona's identity cookies and switches that one, leaving the saved storage state untouched. The handle must have changed before anything
 * rotates it, or the switch would kill the saved session for every other spec.
 */
export async function organisationBoundContext(browser: Browser, persona: LoginPersona, baseUrl: string, organisationId: string): Promise<BrowserContext> {
  const statePath = storageStateFor(persona);
  const context = await browser.newContext({ storageState: existsSync(statePath) ? statePath : undefined, ignoreHTTPSErrors: true });
  const host = hostOf(baseUrl);
  const saved = appSessionHandleForHost((await context.storageState()).cookies as StoredCookie[], host);

  const page = await context.newPage();
  try {
    // `page.goto` resolves on an HTTP error too, and the loaded storage state already carries a working handle, so only a changed handle proves a second session was minted.
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

/** Reads a cookie's value from `persona`'s saved storage state, to smuggle one origin's opaque handle onto another. */
export function cookieFromStorageState(persona: LoginPersona, name: string, domain: string): string {
  const state = JSON.parse(readFileSync(storageStateFor(persona), 'utf8')) as { cookies: StoredCookie[] };
  const cookie = state.cookies.find(c => c.name === name && c.domain === domain);
  if (!cookie) throw new Error(`cookie ${name} for ${domain} not found in ${persona}'s storage state — was the seed/setup run?`);
  return cookie.value;
}
