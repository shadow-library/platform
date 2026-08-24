/**
 * Importing npm packages
 */
import { existsSync, mkdirSync } from 'node:fs';

import { type APIRequestContext, expect, type Page, request, test as setup } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { AUTH_DIR, getProductUrl, type LoginPersona, type PersonaAccount, PERSONAS, type ProductKey, requireProductUrl, storageStateFor } from '../lib';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * A Playwright `setup` project (the `chromium` project depends on it) that produces one `storageState` file per
 * login persona, so the real specs never drive the login UI. Authentication is entirely programmatic: the
 * identity flow (`login/init` → `challenge/verify`) is scripted over the page's own request context so the
 * resulting `__Host-sid` lands in the browser context, then a headless `GET <app>/api/auth/login` per app rides
 * that central session through the OIDC hop and mints each app's `__Host-shadow-session` cookie.
 *
 * It is deliberately resumable. `login/init` is rate-limited to 20/hour per identifier/IP, so before spending a
 * login this checks whether the saved storage state still answers `GET /api/auth/session` with 200 for every app
 * the persona needs — if so, it skips untouched. That makes re-running the suite cheap and keeps a flapping test
 * run from exhausting the rate limit.
 *
 * Which apps each persona needs a session on: the two ordinary users get the consumer apps (Novel Forge, Web
 * Novel, and Shadow Memoir); Pulse is an INTERNAL ops console, so identity denies a non-privileged user a Pulse
 * session (the OIDC hop returns without a session cookie) — only the admin drives it. The admin's identity
 * session is the `__Host-sid` the login flow already established, so Pulse is the only app session it needs
 * minted.
 */
const PERSONA_APPS: Record<LoginPersona, ProductKey[]> = {
  user1: ['novelForge', 'webNovel', 'memoir'],
  user2: ['novelForge', 'webNovel', 'memoir'],
  admin: ['pulse'],
};

/** The apps a persona needs that are actually configured this run (an opted-out product is dropped, not failed). */
function configuredApps(persona: LoginPersona): { product: ProductKey; url: string }[] {
  return PERSONA_APPS[persona].flatMap(product => {
    const url = getProductUrl(product);
    return url ? [{ product, url }] : [];
  });
}

/** True when the saved storage state still authenticates every required app — lets a re-run skip a fresh login. */
async function existingStateIsValid(persona: LoginPersona, apps: { url: string }[]): Promise<boolean> {
  const statePath = storageStateFor(persona);
  if (!existsSync(statePath)) return false;

  const ctx = await request.newContext({ storageState: statePath, ignoreHTTPSErrors: true });
  try {
    for (const { url } of apps) {
      const response = await ctx.get(`${url}/api/auth/session`);
      if (!response.ok()) return false;
    }
    return true;
  } finally {
    await ctx.dispose();
  }
}

/** Runs identity's password flow, leaving `__Host-sid` + `isLoggedIn` in the caller's cookie jar. */
async function establishIdentitySession(api: APIRequestContext, identityUrl: string, account: PersonaAccount): Promise<void> {
  const init = await api.post(`${identityUrl}/api/v1/auth/login/init`, { data: { identifier: account.email } });
  expect(init.ok(), `login/init failed for ${account.email}: ${init.status()}`).toBeTruthy();
  const initBody = (await init.json()) as { flowId: string; status: string };
  expect(initBody.status, `expected a password prompt for ${account.email}`).toBe('AWAITING_PASSWORD');

  const verify = await api.post(`${identityUrl}/api/v1/auth/challenge/verify`, { data: { flowId: initBody.flowId, password: account.password } });
  expect(verify.ok(), `challenge/verify failed for ${account.email}: ${verify.status()}`).toBeTruthy();
  const verifyBody = (await verify.json()) as { status: string };
  expect(verifyBody.status, `expected COMPLETED for ${account.email}`).toBe('COMPLETED');
}

/**
 * Establishes every app session `persona` needs and saves the storage state, unless a valid one already exists.
 * The identity central session is minted over `page.request` (which shares the browser context's cookies), then
 * each app's session is minted by navigating its login route — identity's `__Host-sid` short-circuits the prompt,
 * so the browser lands back on the app carrying `__Host-shadow-session`.
 */
async function authenticate(page: Page, persona: LoginPersona): Promise<void> {
  const account = PERSONAS[persona];
  const apps = configuredApps(persona);

  if (await existingStateIsValid(persona, apps)) return;

  const identityUrl = requireProductUrl('identity');
  await establishIdentitySession(page.request, identityUrl, account);

  for (const { product, url } of apps) {
    await page.goto(`${url}/api/auth/login?return_to=/`);
    const session = await page.request.get(`${url}/api/auth/session`);
    expect(session.ok(), `no ${product} session for ${account.email} after SSO: ${session.status()}`).toBeTruthy();
  }

  mkdirSync(AUTH_DIR, { recursive: true });
  await page.context().storageState({ path: storageStateFor(persona) });
}

setup.describe('authentication setup', () => {
  for (const persona of Object.keys(PERSONA_APPS) as LoginPersona[]) {
    setup(`should establish sessions for ${persona}`, async ({ page }) => {
      await authenticate(page, persona);
    });
  }
});
