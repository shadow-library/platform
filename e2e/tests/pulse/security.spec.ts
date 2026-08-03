/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, requireProductUrl, storageStateFor } from '../../lib';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Access-control coverage for pulse. `/api/v1/*` is default-deny (a route with no auth decorator 403s
 * `SEC_003`, per the report), so every real route carries an explicit `@RequirePermission`/`@RequireScope`;
 * these tests exercise the two ends of that: no credential at all (401 `IAM_001`), and a credential that
 * simply doesn't exist for this app (`user1`/`user2` never receive a pulse session — Pulse is an
 * `INTERNAL`-visibility app and identity denies the OIDC hop for a non-privileged account, which is identity's
 * own correct behaviour and is covered by the cross-app infra report, not re-asserted here).
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
   * `user1`'s saved storage state (`.auth/user1.json`) carries sessions for novel-forge and web-novel only —
   * no `__Host-shadow-session` cookie is scoped to `pulse.shadow-apps.test`, because identity never grants an
   * ordinary account a pulse app-session in the first place (per `e2e/lib`'s seed manifest notes). A pulse
   * `APIRequestContext` built with the `user1` persona therefore carries no pulse credential at all, and this
   * assertion is the API-level mirror of that: it 401s exactly like a guest, not a 403 for lacking a specific
   * permission — there is no session to check a permission against.
   */
  test('should 401 IAM_001 for user1 (no pulse session exists for this persona) GET /api/v1/templates', async () => {
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
   * `POST /api/v1/notifications` is `@RequireScope('notifications:send')`, and that scope is declared
   * `principalType: 'SERVICE'` and granted solely to the `identity-server` service client
   * (`apps/identity-server/src/.../ecosystem-seed.constants.ts:157-161,180,219`) — no pulse user role
   * (`PulseViewer`/`PulseOperator`/`PulseAdmin`) is ever granted it, and `AuthGuard.authorize()`'s scope check
   * (`packages/auth/src/module/auth-guard.ts:113`) is a plain membership test against `principal.scopes`
   * regardless of whether the principal came from a bearer token or a session cookie. So even the bootstrap
   * admin — who holds every `pulse:*` permission there is — can never satisfy this route. See
   * `send-delivery.spec.ts` for the fuller writeup and the resulting `/send` UI implication.
   */
  test('should 403 IAM_002 for admin (a user session can never hold the service-only notifications:send scope) POST /api/v1/notifications', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const response = await ctx.post('/api/v1/notifications', { data: { templateKey: 'auth.register.otp', recipients: { email: 'e2e.pulse.probe@shadow-apps.test' } } });
    expect(response.status()).toBe(403);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('IAM_002');
  });

  /**
   * `GET /api/v1/notifications/messages` is gated by `@EnableIf(() => Config.get('app.stage') === 'dev')` in
   * addition to `pulse:logs:read` — confirmed live against the deployed API (`APP_STAGE` on this cluster is
   * `dev`): a 200 with the paginated shape, not a 404. `PulseAdmin` (admin's role) carries `logsRead`.
   */
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
     * `MessageLog.tsx:42` gates on `import.meta.env.DEV` — a **build-time** Vite flag baked into the bundle, not
     * the server's runtime `APP_STAGE`. The deployed pulse-web image is a production build (`vite build`), so the
     * plan was to assert `import.meta.env.DEV` is `false` there and observe the EmptyState. In practice the route
     * itself is unreachable on this deployment, which is the app bug worth flagging instead: the file route is
     * registered at `/_app/logs/` (trailing slash), so `/logs` (no slash) 404s — confirmed live,
     * `curl -I https://pulse.shadow-apps.test/logs` → `404`. But `/logs/` *itself* 307s back to `/logs` (`curl -I
     * .../logs/` → `location: /logs`), which then 404s — a redirect loop that dead-ends either way, with or
     * without the admin session (confirmed both authenticated and as guest). `/logs` is reachable from the nav
     * rail (`Layout/index.tsx`'s `NAV` config links to `/logs`, no trailing slash) — so a real operator clicking
     * "Message Log" in the sidebar hits this same 404. Not something a test workaround (e.g. a different path)
     * can route around, since no path reaches the page at all.
     */
    test.fixme('/logs is unreachable in this deployment (app bug: TanStack Start route registered at /_app/logs/ but /logs redirects to /logs, which 404s — a redirect loop; the nav rail itself links to /logs with no trailing slash, so this is not an e2e-only path)', async ({
      page,
    }, testInfo) => {
      const url = requireProductUrl('pulse');
      await page.goto(`${url}/logs`);
      await expect(page.getByText('Message Log is unavailable').or(page.getByRole('table'))).toBeVisible({ timeout: 20_000 });
      const unavailable = await page.getByText('Message Log is unavailable').isVisible();
      testInfo.annotations.push({ type: 'observed-state', description: unavailable ? 'unavailable (production build)' : 'live table (dev build)' });
    });
  });
});
