import { existsSync, mkdirSync } from 'node:fs';

import { expect, type Page, request, test as setup } from '@playwright/test';

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
 * Produces one `storageState` file per login persona so real specs never drive the login UI. The identity session is minted in the database
 * (`createIdentitySession`) rather than through `login/init` -> `challenge/verify`, which spends the 20/hour per-IP `login/init` budget and cannot finish for an
 * account with a passkey enrolled (the dev bootstrap admin has one). A headless `GET <app>/api/auth/login` per app then rides that session through the OIDC hop.
 * Interactive login is covered by `identity/login.spec.ts`.
 *
 * Resumable: a saved state that still answers `GET /api/auth/session` with 200 for every app the persona needs is kept, so re-runs do not pile up sessions.
 *
 * Per persona: the two ordinary users get Novel Forge, Web Novel and Memoir; the viewer is a Web Novel reader with no data and no grant. Web Novel is INTERNAL,
 * so every persona with a session there is seeded into the platform organisation. Only the admin drives Pulse, so only it is minted a Pulse session.
 */
const PERSONA_APPS: Record<LoginPersona, ProductKey[]> = {
  user1: ['novelForge', 'webNovel', 'memoir'],
  user2: ['novelForge', 'webNovel', 'memoir'],
  viewer: ['webNovel'],
  admin: ['pulse'],
};

function configuredApps(persona: LoginPersona): { product: ProductKey; url: string }[] {
  return PERSONA_APPS[persona].flatMap(product => {
    const url = getProductUrl(product);
    return url ? [{ product, url }] : [];
  });
}

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
 * The assurance level a real sign-in leaves: the admin completes a passkey (AAL2), users sign in with a password alone (AAL1). No elevation window, as a reused state is long
 * past ten minutes.
 */
const PERSONA_AAL: Record<LoginPersona, SessionAal> = { user1: 'AAL1', user2: 'AAL1', viewer: 'AAL1', admin: 'AAL2' };

/** Mints every app session `persona` needs and saves the storage state unless a valid one exists; identity's `__Host-sid` short-circuits each app's login prompt. */
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
