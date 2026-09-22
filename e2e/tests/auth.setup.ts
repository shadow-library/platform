/**
 * Importing npm packages
 */
import { existsSync, mkdirSync } from 'node:fs';

import { expect, type Page, request, test as setup } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  addIdentitySessionCookies,
  AUTH_DIR,
  createIdentitySession,
  getProductUrl,
  type LoginPersona,
  PERSONAS,
  type ProductKey,
  readSeedManifest,
  type SessionAal,
  storageStateFor,
} from '../lib';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * A Playwright `setup` project (the `chromium` project depends on it) that produces one `storageState` file per
 * login persona, so the real specs never drive the login UI. The identity session is minted in the database
 * (`createIdentitySession`) rather than through `login/init` → `challenge/verify`: that flow spends the 20/hour
 * per-IP `login/init` budget and cannot finish for an account with a passkey enrolled (the dev bootstrap admin has
 * one). A headless `GET <app>/api/auth/login` per app then rides that central session through the OIDC hop and
 * mints each app's `__Host-shadow-session` cookie. Interactive login itself is covered by `identity/login.spec.ts`.
 *
 * It is resumable: a saved storage state that still answers `GET /api/auth/session` with 200 for every app the
 * persona needs is kept untouched, so a re-run does not pile up sessions.
 *
 * Which apps each persona needs a session on: the two ordinary users get the consumer apps (Novel Forge, Web
 * Novel, and Memoir); Pulse is an INTERNAL ops console, so identity denies a non-privileged user a Pulse
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

/**
 * The assurance level a real sign-in would leave: the admin completes a passkey factor (AAL2), the users sign in with a password
 * alone (AAL1). No elevation window — a reused storage state is long past the ten minutes a fresh MFA login grants.
 */
const PERSONA_AAL: Record<LoginPersona, SessionAal> = { user1: 'AAL1', user2: 'AAL1', admin: 'AAL2' };

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

  const session = await createIdentitySession(readSeedManifest().users[persona].userId, { aal: PERSONA_AAL[persona], elevatedUntil: null });
  await addIdentitySessionCookies(page.context(), session);

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
