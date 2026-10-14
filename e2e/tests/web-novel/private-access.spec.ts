/**
 * Importing npm packages
 */
import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { findApplicationIdByName, identityDb, readSeedManifest, requireProductUrl } from '../../lib';
import { expect, test } from './fixtures';
import { followRedirect, readAccessMode, WEB_NOVEL_SESSION_COOKIE } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Web Novel's pre-launch posture is two independent layers: identity admits only platform-organisation members (the application is
 * INTERNAL) and `AUTH_ACCESS_MODE=private` makes every route require a session. This spec pins both ends and is skipped when the
 * deployment has been opened up — a public Web Novel is covered by the rest of the suite's mode-aware assertions. The access
 * endpoint is the SDK's own, so it answers anonymously in either mode.
 */
const WEB_NOVEL_APPLICATION = 'web-novel';

async function requirePrivateMode(guest: APIRequestContext): Promise<void> {
  test.skip((await readAccessMode(guest)) !== 'private', 'Web Novel is in public mode on this deployment');
}

test.describe('web-novel private access: anonymous callers', () => {
  const { webNovel } = readSeedManifest();

  test('should report the private access mode to an anonymous caller', async ({ webNovel: harness }) => {
    const guest = await harness.guest();
    await requirePrivateMode(guest);
    const response = await guest.get('/api/auth/access');
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ mode: 'private' });
  });

  for (const path of ['/api/novels', `/api/novels/${webNovel.publicSlug}`, `/api/novels/${webNovel.publicSlug}/chapters/1`, `/api/novels/${webNovel.publicSlug}/wiki`]) {
    test(`should 401 IAM_001 for an anonymous GET ${path.replace(webNovel.publicSlug, ':slug')}`, async ({ webNovel: harness }) => {
      const guest = await harness.guest();
      await requirePrivateMode(guest);
      const response = await guest.get(path);
      expect(response.status()).toBe(401);
      expect(((await response.json()) as { code?: string }).code).toBe('IAM_001');
      expect(response.headers()['cache-control'] ?? '', 'a refusal must never be shared-cacheable').not.toContain('public');
    });
  }

  for (const path of ['/', '/browse', `/novels/${webNovel.publicSlug}`, `/read/${webNovel.publicSlug}/1`, '/library']) {
    test(`should redirect an anonymous request for ${path.replace(webNovel.publicSlug, ':slug')} to login before any markup ships`, async ({ webNovel: harness }) => {
      const guest = await harness.guest();
      await requirePrivateMode(guest);
      const response = await guest.get(path, { maxRedirects: 0 });
      expect([302, 307]).toContain(response.status());
      const location = new URL(response.headers()['location'] ?? '', requireProductUrl('webNovel'));
      expect(location.pathname).toBe('/login');
      if (path !== '/') expect(location.searchParams.get('returnTo'), 'the login remembers where the reader was headed').toBe(path);
    });
  }

  test('should leave an anonymous browser on the login route after navigating to the reader', async ({ page, webNovel: harness }) => {
    await requirePrivateMode(await harness.guest());
    await page.goto(`${requireProductUrl('webNovel')}/`);
    await expect(page).toHaveURL(/\/login/i, { timeout: 20_000 });
  });

  test('should render /login noindex and without the guest button', async ({ page, webNovel: harness }) => {
    await requirePrivateMode(await harness.guest());
    await page.goto(`${requireProductUrl('webNovel')}/login`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.getByText(/keep reading as guest/i)).toHaveCount(0);
  });

  test('should keep the sign-in routes reachable so a private reader can still log in', async ({ webNovel: harness }) => {
    const guest = await harness.guest();
    const login = await guest.get('/api/auth/login?return_to=/', { maxRedirects: 0 });
    expect(login.status()).toBe(302);
    expect(new URL(login.headers()['location'] as string).origin).toBe(new URL(requireProductUrl('identity')).origin);

    const loginPage = await guest.get('/login', { maxRedirects: 0 });
    expect(loginPage.status(), 'the login route sits outside the gate').toBeLessThan(300);
  });
});

test.describe('web-novel private access: admission', () => {
  test('should admit a platform member and serve the catalog to the session it receives', async ({ webNovel }) => {
    await requirePrivateMode(await webNovel.guest());
    const { ctx, handle } = await webNovel.signIn(await webNovel.reader('admitted'));
    expect(handle).toBeTruthy();
    expect((await ctx.get('/api/novels')).status()).toBe(200);
  });

  test('should refuse a signed-in user outside the platform organisation any web-novel session', async ({ webNovel }) => {
    await requirePrivateMode(await webNovel.guest());
    const applicationId = await findApplicationIdByName(WEB_NOVEL_APPLICATION);
    const [row] = await identityDb()<{ visibility: string }[]>`SELECT visibility::text FROM applications WHERE id = ${applicationId}`;
    expect(row?.visibility, 'flip web-novel to INTERNAL in the identity admin panel; the seed only applies it at creation').toBe('INTERNAL');

    const outsider = await webNovel.reader('outsider', { platformMember: false });
    const ctx = await webNovel.preLogin(outsider);
    const authorize = await followRedirect(ctx, '/api/auth/login?return_to=/');

    const refused = await ctx.get(authorize.href, { maxRedirects: 0 });
    expect(refused.status()).toBe(302);
    const location = new URL(refused.headers()['location'] as string, authorize);
    expect(location.origin + location.pathname, 'identity answers an INTERNAL application as one it has never heard of').toBe(
      `${new URL(requireProductUrl('identity')).origin}/invalid-request`,
    );
    expect(location.searchParams.get('error')).toBe('invalid_client');
    expect(location.searchParams.has('code'), 'no authorization code is issued').toBe(false);

    expect((await ctx.get('/api/auth/session')).status(), 'no web-novel session exists').toBe(401);
    const { cookies } = await ctx.storageState();
    expect(cookies.find(cookie => cookie.name === WEB_NOVEL_SESSION_COOKIE)).toBeUndefined();
  });
});
