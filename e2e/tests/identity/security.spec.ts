import { apiContext, requireProductUrl, storageStateFor, useClientIp } from '../../lib';
import { expect, test } from './fixtures';
import { expectErrorCode } from './helpers';

/**
 * Security boundaries: the SSR session gate on portal/console routes, per-endpoint server-side admin authorization, and the `returnTo` open-redirect guard. Authorization checks
 * assert both sides (a non-admin is refused, an admin succeeds) so green cannot come from a broken endpoint.
 */

/** Portal/console routes that must bounce an unauthenticated visitor to the login surface before rendering anything. */
const GATED_PATHS = ['/account', '/account/security', '/console'];

/** A seeded email that would appear if the admin user directory ever rendered — its absence proves no data leaked to a non-admin. */
const SEEDED_ADMIN_EMAIL = 'admin@shadow-apps.com';

test.beforeEach(async ({ context, identity }) => {
  await useClientIp(context, identity.clientIp);
});

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
  test('should forbid a non-admin the admin users API with 403 ADM_001', async ({ identity }) => {
    const ctx = await apiContext('identity', 'user2', { clientIp: identity.clientIp });
    try {
      const response = await ctx.get('/api/v1/admin/users');
      expect(response.status()).toBe(403);
      await expectErrorCode(response, 'ADM_001');
    } finally {
      await ctx.dispose();
    }
  });

  test('should allow an admin to search the admin users API (positive control)', async ({ identity }) => {
    const ctx = await apiContext('identity', 'admin', { clientIp: identity.clientIp });
    try {
      // A read-only search needs `usersRead` but not step-up, so it succeeds: the positive control proving the 403 above is authorization, not a broken endpoint.
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
    // The console session gate only checks a session exists and authorization is per-endpoint, so a non-admin can open /console but its admin-scoped queries 403 and the
    // directory must come back empty.
    await page.goto(`${identityUrl}/console/users`);
    await expect(page).toHaveURL(/\/console\/users/);
    await expect(page.getByText(SEEDED_ADMIN_EMAIL)).toHaveCount(0);
  });
});

test.describe('identity security — open redirect', () => {
  test('should not follow an off-origin returnTo when the login page loads', async ({ page }) => {
    const identityUrl = requireProductUrl('identity');
    // `returnTo` is honored only when it starts with '/', so an absolute off-origin URL is ignored and the login page must not navigate to the attacker origin.
    await page.goto(`${identityUrl}/login?returnTo=https://evil.example.com`);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(page.url().startsWith(identityUrl), 'must stay on the identity origin').toBe(true);
    expect(page.url()).not.toContain('evil.example.com/');
  });

  test('should carry the parked authorize request from sign-in to sign-up and back', async ({ page }) => {
    const identityUrl = requireProductUrl('identity');
    const resume = `${identityUrl}/oauth2/authorize?client_id=e2e&response_type=code`;
    await page.goto(`${identityUrl}/login?return_to=${encodeURIComponent(resume)}`);

    await page.getByRole('link', { name: 'Create an account' }).first().click();
    await expect(page).toHaveURL(/\/register/);
    expect(new URL(page.url()).searchParams.get('return_to'), 'sign-up keeps the resume target').toBe(resume);

    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(new URL(page.url()).searchParams.get('return_to'), 'returning to sign-in keeps it too').toBe(resume);
  });
});
