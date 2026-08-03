/**
 * Importing npm packages
 */
import { type BrowserContext, expect, type Page, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { requireProductUrl, storageStateFor } from '../../lib';

/**
 * Defining types
 */
interface AppUnderTest {
  readonly label: string;
  readonly product: 'novelForge' | 'pulse' | 'webNovel' | 'identity';
  readonly storage: 'user1' | 'admin';
  readonly authedPath: string;
  /** A same-shell, client-side navigation (no reload) the user performs after the session dies. */
  readonly clickThrough: (page: Page) => Promise<void>;
}

/**
 * Declaring the constants
 *
 * Scenario: the app is loaded and hydrated, then the session ends server-side (idle/absolute TTL or a revoke).
 * The question is whether the next thing the user does lands them on a login screen rather than a shell that
 * keeps rendering with auth errors. We simulate the expiry by clearing every cookie on the context (the server
 * answers 401 to the next authenticated request); we clear identity's central `__Host-sid` too, so the OIDC hop
 * can't silently re-authenticate and hide the redirect.
 *
 * Two paths matter and they behave differently across the apps:
 *   - CLIENT-SIDE navigation (clicking a link inside the mounted shell, no document reload). Only an in-shell
 *     session guard re-validates here — the route-entry `beforeLoad` gate does not re-run for a reused layout
 *     match. Novel Forge and Pulse bind `@shadow-library/web`'s `useSessionGuard` on their authed shell, so they
 *     bounce; the reader and the identity portal do not run that guard, so a client-side hop keeps rendering
 *     (from warm cache / device-local data) instead of redirecting. See the note on the second block.
 *   - FULL reload / fresh route entry. Every app's `beforeLoad` gate runs and bounces to login. This is the
 *     safety net that guarantees no app is *stuck* — a reload always recovers to login.
 */

/** A login destination: a consumer app's own `/login` shim or identity's hosted login/authorize surface. */
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
    // The identity portal binds the same `useSessionGuard` (added alongside this suite), so a client-side hop
    // between portal pages after expiry bounces to login instead of rendering the cached account page.
    label: 'Identity portal',
    product: 'identity',
    storage: 'user1',
    authedPath: '/account',
    clickThrough: page => page.getByRole('link', { name: 'Security' }).first().click(),
  },
];

/**
 * Web Novel deliberately does NOT run the in-shell guard: it is an offline-first reader, so `/library` and
 * `/history` are expected to keep rendering device-local data when the session ends rather than force a login
 * redirect mid-use. The guarantee we still pin is that a full reload re-runs the route gate and recovers to
 * login, so the reader is never trapped.
 */
const GATE_ONLY_APPS: readonly { label: string; product: AppUnderTest['product']; storage: AppUnderTest['storage']; authedPath: string }[] = [
  { label: 'Web Novel /library (offline-first, by design)', product: 'webNovel', storage: 'user1', authedPath: '/library' },
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
   * The reader does NOT run the in-shell guard (by design — it is offline-first), so a purely client-side hop
   * after expiry keeps rendering device-local data rather than redirecting. That is not a stuck-on-error state —
   * the server still rejects every real request — but it is not a proactive bounce either. What this block pins
   * down is the guarantee that always holds: on a full reload / fresh route entry the `beforeLoad` gate
   * re-validates and lands the user on login, so the reader is never trapped.
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
