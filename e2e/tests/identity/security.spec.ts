/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, requireProductUrl, storageStateFor } from '../../lib';
import { expectErrorCode } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Security boundaries: the SSR session gate on portal/console routes, admin authorization enforced by the
 * server per endpoint (not re-implemented in the UI), and the open-redirect guard on `returnTo`. The
 * authorization checks assert both sides of the boundary — a non-admin is refused (API 403 and no data in the
 * UI) and an admin succeeds (positive control) — so a green result can't come from the endpoint being broken.
 */

/** Portal/console routes that must bounce an unauthenticated visitor to the login surface before rendering anything. */
const GATED_PATHS = ['/account', '/account/security', '/console'];

/** A seeded email that would appear if the admin user directory ever rendered — its absence proves no data leaked to a non-admin. */
const SEEDED_ADMIN_EMAIL = 'admin@shadow-apps.com';

test.describe('identity security — unauthenticated gates', () => {
  for (const path of GATED_PATHS) {
    test(`should redirect an unauthenticated visitor from ${path} to /login`, async ({ page }) => {
      const identityUrl = requireProductUrl('identity');
      await page.goto(`${identityUrl}${path}`);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});

test.describe('identity security — admin authorization', () => {
  test('should forbid a non-admin the admin users API with 403 ADM_001', async () => {
    const ctx = await apiContext('identity', 'user2');
    try {
      const response = await ctx.get('/api/v1/admin/users');
      expect(response.status()).toBe(403);
      await expectErrorCode(response, 'ADM_001');
    } finally {
      await ctx.dispose();
    }
  });

  test('should allow an admin to search the admin users API (positive control)', async () => {
    const ctx = await apiContext('identity', 'admin');
    try {
      // A read-only search needs the usersRead permission but not step-up elevation, so it succeeds without any
      // MFA dance — the positive control proving the 403 above is authorization, not a broken endpoint.
      const response = await ctx.get('/api/v1/admin/users?email=e2e&limit=5');
      expect(response.status()).toBe(200);
      const body = (await response.json()) as { items: unknown[] };
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items.length).toBeGreaterThan(0);
    } finally {
      await ctx.dispose();
    }
  });
});

test.describe('identity security — non-admin console UI', () => {
  test.use({ storageState: storageStateFor('user2') });

  test('should not show the platform user directory to a non-admin on /console', async ({ page }) => {
    const identityUrl = requireProductUrl('identity');
    // The console session gate only checks that a session exists; authorization is per-endpoint on the server.
    // So a non-admin can open /console, but its admin-scoped queries 403 — the directory must come back empty,
    // never leaking another account's details.
    await page.goto(`${identityUrl}/console/users`);
    await expect(page).toHaveURL(/\/console\/users/);
    await expect(page.getByText(SEEDED_ADMIN_EMAIL)).toHaveCount(0);
  });
});

test.describe('identity security — open redirect', () => {
  test('should not follow an off-origin returnTo when the login page loads', async ({ page }) => {
    const identityUrl = requireProductUrl('identity');
    // `returnTo` is only ever honored when it starts with '/', so an absolute off-origin URL must be ignored.
    // Even without signing in, loading the login page must not navigate to the attacker origin.
    await page.goto(`${identityUrl}/login?returnTo=https://evil.example.com`);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(page.url().startsWith(identityUrl), 'must stay on the identity origin').toBe(true);
    expect(page.url()).not.toContain('evil.example.com/');
  });
});
