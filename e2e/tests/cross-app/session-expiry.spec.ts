import { type BrowserContext, expect, type Page, test } from '@playwright/test';

import { requireProductUrl, storageStateFor } from '../../lib';

interface AppUnderTest {
  readonly label: string;
  readonly product: 'novelForge' | 'pulse' | 'webNovel' | 'identity';
  readonly storage: 'user1' | 'admin';
  readonly authedPath: string;
  readonly clickThrough: (page: Page) => Promise<void>;
  readonly onlyWhenPrivate?: boolean;
}

/**
 * The app is loaded, then the session ends server-side; the next user action must land on a login screen, not a shell rendering auth errors. Expiry is simulated by clearing
 * every cookie, including identity's `__Host-sid` so the OIDC hop cannot silently re-authenticate.
 *  - Client-side navigation (no reload): only an in-shell `useSessionGuard` (`@shadow-library/web`) re-validates, since the route-entry `beforeLoad` gate does not re-run for a
 *    reused layout. Novel Forge, Pulse, the identity portal and a private Web Novel bind it and bounce; a public Web Novel does not.
 *  - Full reload: every app's `beforeLoad` gate bounces to login, so no app is ever stuck.
 */

const LOGIN_URL = /\/login\b|identity\.shadow-apps\.test\/(login|oauth2\/authorize)/;

const GUARDED_APPS: readonly AppUnderTest[] = [
  {
    label: 'Novel Forge',
    product: 'novelForge',
    storage: 'user1',
    authedPath: '/',
    clickThrough: page => page.getByRole('button', { name: 'Import novel' }).click(),
  },
  {
    label: 'Pulse',
    product: 'pulse',
    storage: 'admin',
    authedPath: '/',
    clickThrough: page => page.getByRole('link', { name: 'Templates' }).first().click(),
  },
  {
    label: 'Identity portal',
    product: 'identity',
    storage: 'user1',
    authedPath: '/account',
    clickThrough: page => page.getByRole('link', { name: 'Security' }).first().click(),
  },
  {
    label: 'Web Novel (private mode)',
    product: 'webNovel',
    storage: 'user1',
    authedPath: '/library',
    clickThrough: page => page.getByRole('link', { name: 'Browse' }).first().click(),
    onlyWhenPrivate: true,
  },
];

/**
 * Web Novel runs the in-shell guard only while private: a public Web Novel is an offline-first reader whose `/library` and `/history` keep rendering device-local data after the
 * session ends.
 */
const GATE_ONLY_APPS: readonly { label: string; product: AppUnderTest['product']; storage: AppUnderTest['storage']; authedPath: string }[] = [
  { label: 'Web Novel /library (any mode)', product: 'webNovel', storage: 'user1', authedPath: '/library' },
];

async function landAuthenticated(context: BrowserContext, baseUrl: string, authedPath: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${baseUrl}${authedPath}`);
  await page.waitForLoadState('networkidle');
  await expect(page, 'precondition: the authenticated page must load before we expire the session').not.toHaveURL(LOGIN_URL);
  return page;
}

test.describe('session expiry — in-shell guard bounces on a mid-session client-side navigation', () => {
  for (const app of GUARDED_APPS) {
    test(`should redirect to login without a reload — ${app.label}`, async ({ browser }) => {
      const baseUrl = requireProductUrl(app.product);
      const context = await browser.newContext({ storageState: storageStateFor(app.storage), ignoreHTTPSErrors: true });
      try {
        if (app.onlyWhenPrivate) {
          const access = await context.request.get(`${baseUrl}/api/auth/access`);
          test.skip(((await access.json()) as { mode?: string }).mode !== 'private', `${app.label} runs no in-shell guard while public`);
        }
        const page = await landAuthenticated(context, baseUrl, app.authedPath);
        await context.clearCookies();
        await app.clickThrough(page); // client-side navigation inside the mounted shell
        await page.waitForURL(LOGIN_URL, { timeout: 30_000 });
        expect(page.url(), `${app.label} must bounce to login when the session dies mid-use`).toMatch(LOGIN_URL);
      } finally {
        await context.close();
      }
    });
  }
});

test.describe('session expiry — route-entry gate recovers to login on the next full load', () => {
  /**
   * A public Web Novel keeps rendering device-local data on a client-side hop after expiry (by design); what always holds is that a full reload re-runs the gate and lands on
   * login.
   */
  for (const app of GATE_ONLY_APPS) {
    test(`should redirect to login on reload after the session expired — ${app.label}`, async ({ browser }) => {
      const baseUrl = requireProductUrl(app.product);
      const context = await browser.newContext({ storageState: storageStateFor(app.storage), ignoreHTTPSErrors: true });
      try {
        const page = await landAuthenticated(context, baseUrl, app.authedPath);
        await context.clearCookies();
        await page.reload(); // fresh route entry re-runs the gate
        await page.waitForURL(LOGIN_URL, { timeout: 30_000 });
        expect(page.url(), `${app.label} must recover to login on a reload`).toMatch(LOGIN_URL);
      } finally {
        await context.close();
      }
    });
  }
});
