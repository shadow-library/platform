import { expect, test } from '@playwright/test';

import { apiContext, mutate, requireProductUrl, storageStateFor } from '../../lib';

/**
 * `/api/v1/*` is default-deny (a route with no auth decorator 403s `SEC_003`), so the two ends are exercised: no credential (401 `IAM_001`), and a credential that does not
 * exist for this app (`user1`/`user2` never get a pulse session: Pulse is `INTERNAL` and identity denies the OIDC hop to a non-privileged account).
 */
test.describe('security', () => {
  test.beforeEach(() => requireProductUrl('pulse'));

  test('should 401 IAM_001 for an unauthenticated GET /api/v1/templates', async () => {
    const ctx = await apiContext('pulse');
    const response = await ctx.get('/api/v1/templates');
    expect(response.status()).toBe(401);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('IAM_001');
  });

  /**
   * `user1`'s storage state has no `__Host-shadow-session` for pulse (`auth.setup.ts` never mints one), so it carries no pulse credential and 401s like a guest, not a 403: there
   * is no session to check a permission against.
   */
  test('should 401 IAM_001 for user1 (the setup never mints this persona a pulse session) GET /api/v1/templates', async () => {
    const ctx = await apiContext('pulse', 'user1');
    const response = await ctx.get('/api/v1/templates');
    expect(response.status()).toBe(401);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('IAM_001');
  });

  test('should redirect a guest browser visiting /templates toward a login surface', async ({ page }) => {
    const url = requireProductUrl('pulse');
    await page.goto(`${url}/templates`);
    await expect(page).toHaveURL(/\/login/i, { timeout: 20_000 });
  });

  /**
   * `POST /api/v1/notifications` is `@RequireScope('notifications:send')`, declared `principalType: 'SERVICE'` and granted only to service clients, never a pulse user role.
   * `AuthGuard.authorize()` tests the scope against `principal.scopes` whether the principal came from a bearer or a session, so even the bootstrap admin can never satisfy it.
   * The console sends through its own permission-gated route (see `send-delivery.spec.ts`).
   */
  test('should 403 IAM_002 for admin (a user session can never hold the service-only notifications:send scope) POST /api/v1/notifications', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const response = await mutate(ctx, 'post', '/api/v1/notifications', { data: { templateKey: 'auth.register.otp', recipients: { email: 'e2e.pulse.probe@shadow-apps.test' } } });
    expect(response.status()).toBe(403);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('IAM_002');
  });

  /** `GET /api/v1/notifications/messages` is gated by `@EnableIf(app.stage === 'dev')` as well as `pulse:messages:read`, which only `PulseAdmin` carries. */
  test('should allow admin GET /api/v1/notifications/messages in this (dev-stage) deployment', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const response = await ctx.get('/api/v1/notifications/messages?limit=3');
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { total: number; limit: number; offset: number; items: unknown[] };
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe('number');
  });

  test.describe('as admin', () => {
    test.use({ storageState: storageStateFor('admin') });

    /**
     * `MessageLog.tsx` gates on the build-time Vite flag `import.meta.env.DEV`, not the server's `APP_STAGE`, so the page is the unavailable notice (production build) or the
     * live table (dev build); `/logs` must reach the page either way.
     */
    test('should reach the Message Log page at /logs, the path the nav rail links to', async ({ page }, testInfo) => {
      const url = requireProductUrl('pulse');
      await page.goto(`${url}/logs`);
      await expect(page.getByText('Message Log is unavailable').or(page.getByRole('table'))).toBeVisible({ timeout: 20_000 });
      const unavailable = await page.getByText('Message Log is unavailable').isVisible();
      testInfo.annotations.push({ type: 'observed-state', description: unavailable ? 'unavailable (production build)' : 'live table (dev build)' });
    });
  });
});
