/**
 * Importing npm packages
 */
import { expect, request, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, fetchLatestOtp, mutate, pulseDb, requireProductUrl } from '../../lib';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * `POST /api/v1/notifications` is `@RequireScope('notifications:send')` — a scope declared `principalType:
 * 'SERVICE'` and granted, ecosystem-wide, to exactly one client: `identity-server`
 * (`apps/identity-server/.../ecosystem-seed.constants.ts:157-161,180,219`). `AuthGuard.authorize()`'s scope
 * check is a plain membership test against `principal.scopes` regardless of whether the principal resolved
 * from a bearer token or a session cookie (`packages/auth/src/module/auth-guard.ts:96-113`) — so there is no
 * session, including the bootstrap admin's, that can ever hold this scope. Confirmed live: `admin` POSTing a
 * well-formed body gets a flat `403 IAM_002` before the request ever reaches `NotificationService.send()`.
 *
 * That reshapes this file's "real interconnect proof" away from a direct forged call (impossible from e2e —
 * there's no identity-server service credential available to a host-side Playwright process either) and
 * toward the actual producer path: trigger a real identity action that makes identity itself call pulse with
 * its own service credential, then observe delivery from both sides' databases. This is a *stronger* proof
 * than a direct call would have been — it exercises the real M2M auth, not just template rendering.
 */

/** True when `templateKey` has a published version with at least one enabled channel — the send precondition. */
async function hasPublishedTemplate(templateKey: string): Promise<boolean> {
  const rows = await pulseDb()<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM templates t
    JOIN template_versions v ON v.template_id = t.id AND v.status = 'PUBLISHED'
    JOIN template_channel_settings s ON s.template_id = t.id AND s.is_enabled = true
    WHERE t.template_key = ${templateKey} AND t.is_active = true
  `;
  return (rows[0]?.count ?? 0) > 0;
}

test.describe('send + delivery', () => {
  test.beforeEach(() => requireProductUrl('pulse'));

  /**
   * The end-to-end interconnect proof: register a never-before-used email at identity, capture the OTP
   * identity enqueues (`notification_outbox`, `fetchLatestOtp`), and then confirm pulse actually delivered it
   * — a `notification_jobs` row reaching `SENT` (the `DEV` provider is the only one that really delivers) and
   * a `notification_messages` row whose rendered body contains the same code. This proves routing (the
   * catch-all `e2e-dev` rule), rendering (the code appears in the rendered text, not the raw `{{ code }}`),
   * and cross-service M2M auth (identity's own service token got through `RequireScope`) all at once.
   *
   * Skips (does not fail) if `auth.register.otp` has no published version — this deployment's pulse database
   * currently has **zero rows in `templates`** (confirmed via direct query and via a live `GET
   * /api/v1/templates` returning `{"total":0,...}`): `pulse-server-migrate`'s Kubernetes Job only runs Drizzle
   * migrations (`apps/pulse-server/src/migrate.ts`) — the separate, idempotent baseline seed
   * (`apps/pulse-server/tests/fixtures/seed.ts`, invoked via `bun scripts/db.ts apps/pulse-server seed`) is
   * never run as part of this deployment's rollout. Corroborated by live pulse-server logs: a real identity
   * `security.new-signin` notification 404s with `TPL_001 "Template not found"` right now. This is a
   * deployment/rollout gap, not application code — flagged here with hard evidence rather than "fixed" by
   * seeding data into a shared cluster from a test run.
   */
  test('should deliver a real registration OTP end-to-end through identity -> pulse -> DEV provider', async () => {
    test.skip(
      !(await hasPublishedTemplate('auth.register.otp')),
      'auth.register.otp has no published version — pulse baseline seed was never run for this deployment (see file-level doc comment)',
    );

    const identityCtx = await request.newContext({ baseURL: 'https://identity.shadow-apps.test', ignoreHTTPSErrors: true });
    const email = `e2e.send-delivery.${Date.now()}@shadow-apps.test`;

    const initResponse = await identityCtx.post('/api/v1/auth/register/init', { data: { email } });
    // register/init is rate-limited 5/hour per IP; repeated suite runs on one host exhaust it. The full
    // identity->pulse->DEV chain is also proven (rate-limit-free) by cross-app/notification-pipeline, so skip
    // rather than fail when the limit is hot.
    test.skip(initResponse.status() === 429, 'identity register/init rate-limited (5/hour per IP) — residue from repeated runs');
    expect(initResponse.status(), await initResponse.text()).toBe(200);

    const code = await pollForOtp(email, 'auth.register.otp');
    expect(code, `expected identity to enqueue an OTP for ${email}`).toBeTruthy();

    const message = await pollForDeliveredMessage(email, code as string);
    expect(message.renderedBody).toContain(code);

    await identityCtx.dispose();
  });

  test('should reject an empty recipients object with a schema validation error regardless of caller', async () => {
    // Deliberately anonymous: `recipients: {}` fails `@Schema({minProperties:1})` in a Fastify preValidation
    // hook that runs *before* the `@RequireScope` auth guard — confirmed live against both an authenticated
    // and an unauthenticated caller, both 422. This is not the 400 the task brief assumed; class-schema
    // validation failures on this stack are 422 (`VALIDATION_ERROR`), not 400.
    const ctx = await apiContext('pulse');
    const response = await ctx.post('/api/v1/notifications', { data: { templateKey: 'auth.register.otp', recipients: {} } });
    expect(response.status()).toBe(422);
    const body = (await response.json()) as { code?: string; fields?: { field: string; msg: string }[] };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.fields?.some(f => f.field.includes('recipients'))).toBe(true);
  });

  test('should 401 IAM_001 for a well-formed send with no credential at all', async () => {
    const ctx = await apiContext('pulse');
    const response = await ctx.post('/api/v1/notifications', { data: { templateKey: 'auth.register.otp', recipients: { email: 'e2e.pulse.probe@shadow-apps.test' } } });
    expect(response.status()).toBe(401);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('IAM_001');
  });

  test.fixme(
    'per-channel business-logic error codes (NTF_001-004, TPL_VER_003, TPL_CNT_003) are unreachable from e2e — ' +
      'not an app bug, an access-control fact: POST /api/v1/notifications only ever accepts the identity-server ' +
      'service client (see file-level doc comment), and no such credential is available to a host-side Playwright ' +
      'process (service auth uses a projected in-cluster ServiceAccount token, per the infra report). Every ' +
      'well-formed body from any session-backed caller, including admin, 403s IAM_002 before reaching NotificationService.send().',
    async () => {
      const ctx = await apiContext('pulse', 'admin');
      const response = await mutate(ctx, 'post', '/api/v1/notifications', { data: { templateKey: 'does-not-exist', recipients: { email: 'a@b.com' } } });
      expect(response.status()).toBe(201);
    },
  );

  /**
   * Drives the manual-send console form as a human operator would. Because `admin` cannot hold
   * `notifications:send` (see above), the actual, observed outcome is `SendForm.tsx`'s error branch — an
   * Alert titled "Cannot send" carrying the 403's message — never the "Overall status: Accepted" success path
   * the task brief expected. This is a real app-level gap worth flagging on its own: `/send` is presented as
   * PulseAdmin/Operator tooling ("Manually trigger a send to test templates and routing end-to-end"), but no
   * user role can ever complete a send through it — the feature is unusable by any human operator today.
   */
  test.fixme(
    'the /send console form should complete a manual send as admin (app gap: no user role, including PulseAdmin, ' +
      'ever holds the service-only notifications:send scope required by POST /api/v1/notifications — see ' +
      'apps/pulse-server/src/modules/notification/notification.controller.ts:30 and ' +
      "apps/identity-server/.../ecosystem-seed.constants.ts:157-161,219; observed actual result is SendForm.tsx's " +
      '"Cannot send" error Alert with the 403 IAM_002 message, not "Overall status: Accepted")',
    async ({ page }) => {
      const url = requireProductUrl('pulse');
      await page.goto(`${url}/send`);

      await page.getByLabel('Template key').click();
      await page.getByRole('option', { name: 'auth.register.otp' }).click();
      await page.getByLabel('Email').fill('e2e.pulse.probe@shadow-apps.test');
      await page.getByLabel('Payload').fill('{ "code": "123456" }');
      await page.getByRole('button', { name: 'Send notification' }).click();

      await expect(page.getByText(/Overall status: Accepted/i)).toBeVisible({ timeout: 15_000 });
    },
  );
});

/** Polls identity's outbox for the OTP `fetchLatestOtp` returns, giving the worker a few seconds to catch up. */
async function pollForOtp(email: string, templateKey: string, timeoutMs = 20_000): Promise<string | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const code = await fetchLatestOtp(email, templateKey);
    if (code) return code;
    if (Date.now() >= deadline) return undefined;
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
}

/** Polls pulse for the delivered `notification_messages` row for `email`, once its job reaches `SENT`. */
async function pollForDeliveredMessage(email: string, code: string, timeoutMs = 60_000): Promise<{ renderedSubject: string | null; renderedBody: string }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = await pulseDb()<{ renderedSubject: string | null; renderedBody: string; status: string }[]>`
      SELECT m.rendered_subject AS "renderedSubject", m.rendered_body AS "renderedBody", j.status
      FROM notification_jobs j
      JOIN notification_messages m ON m.notification_job_id = j.id
      WHERE j.recipient = ${email} AND j.status = 'SENT'
      ORDER BY j.id DESC
      LIMIT 1
    `;
    const row = rows[0];
    if (row) return row;
    if (Date.now() >= deadline) throw new Error(`No SENT notification_messages row for ${email} (code ${code}) after ${timeoutMs}ms`);
    await new Promise(resolve => setTimeout(resolve, 2_000));
  }
}
