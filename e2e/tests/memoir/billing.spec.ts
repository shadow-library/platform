/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

import { type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { memoirDb, probeMemoirConfigKeys } from '../../lib';
import { expect, test } from './fixtures';
import { errorCodeOf, memoirMutate, pullDeltaWith } from './helpers';

/**
 * Defining types
 */

interface EntitlementRow {
  tier: string;
  state: string;
}

/**
 * Declaring the constants
 *
 * `POST /billing/checkout`, `POST /billing/webhooks/{provider}` and the read-only entitlement surface (T-16,
 * ARCHITECTURE §16). `billing.webhook-secret` and `billing.checkout-url` are both unset in this cluster today:
 * `memoir-server-secrets` — the Secret the Deployment's `envFrom` names for them — does not exist at all, and
 * neither `BILLING_WEBHOOK_SECRET` nor `BILLING_CHECKOUT_URL` appears in any configmap/secret memoir loads.
 * `probeMemoirConfigKeys` (`../../lib/config-probe.ts`) does that read live, read-only, key NAMES only — never
 * a value — via `kubectl get configmap/secret -n memoir -o go-template=…`. The test that depends on that state
 * (`should reach application-ready...`) reads live cluster state itself before asserting: a `NotFound` reads as
 * "unconfigured" (today's actual shape), any other kubectl failure (off PATH, wrong context, RBAC) is a probe
 * failure that skips the test with its own reason rather than being misread as "unconfigured", and a future
 * environment that names a provider also skips it — never a false failure either way. The grace/lapse read
 * (`resolveEffectiveState`, `entitlement-lifecycle.ts`) is a pure function of stored columns and server time —
 * independent of the webhook secret and of the hourly `EntitlementLapseService` sweep — so the grace/lapse
 * test needs no such guard.
 */

const CONFIGURED_PROVIDER = 'generic-hmac';
const BILLING_ENV_KEYS: readonly string[] = ['BILLING_WEBHOOK_SECRET', 'BILLING_CHECKOUT_URL'];

function webhookPath(provider: string): string {
  return `/api/v1/billing/webhooks/${provider}`;
}

function webhookEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: `evt_${randomUUID()}`, type: 'subscription.activated', occurredAt: new Date().toISOString(), ...overrides };
}

async function expectRefusal(response: APIResponse, status: number, code: string): Promise<void> {
  expect(response.status(), `${response.url()} answered ${await response.text()}`).toBe(status);
  expect(await errorCodeOf(response)).toBe(code);
}

test.describe('memoir billing', () => {
  let configured: boolean;
  let probeFailed: boolean;

  test.beforeAll(async () => {
    ({ configured, probeFailed } = await probeMemoirConfigKeys(BILLING_ENV_KEYS));
  });

  test('should reject a webhook delivery for an unrecognized provider segment with 404 BIL_002', async ({ memoir }) => {
    const guest = await memoir.guest();
    const response = await guest.post(webhookPath('unknown-provider'), { data: webhookEvent() });
    await expectRefusal(response, 404, 'BIL_002');
  });

  test('should 404 a user token attempting to write an entitlement directly, on both POST and PUT /billing/entitlement', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'billing-no-write-route', onboard: true });

    const post = await memoirMutate(persona.ctx, 'post', '/api/v1/billing/entitlement', { data: { tier: 'paid' } });
    await expectRefusal(post, 404, 'S002');

    const put = await memoirMutate(persona.ctx, 'put', '/api/v1/billing/entitlement', { data: { tier: 'paid' } });
    await expectRefusal(put, 404, 'S002');

    const delta = await pullDeltaWith(persona.ctx, { domains: 'entitlement' });
    expect(delta.response.status(), 'the legitimate path — reading the entitlement snapshot — must still work').toBe(200);
    expect(delta.page.domains['entitlement']).toEqual([{ tier: 'free', state: 'free', expiresAt: null, trialUsed: false }]);
  });

  test('should reach application-ready with billing entirely unconfigured, failing only checkout and the webhook with 503 BIL_003', async ({ memoir }) => {
    test.skip(probeFailed, 'could not read memoir config from the cluster');
    test.skip(configured, 'billing.webhook-secret/checkout-url are configured in this environment; the unconfigured-state 503 contract does not apply here');

    const persona = await memoir.persona({ label: 'billing-unconfigured', onboard: true });

    const stillReady = await persona.ctx.get('/api/v1/account');
    expect(stillReady.status(), 'an unrelated route must keep serving normally while billing is unconfigured').toBe(200);

    const checkout = await memoirMutate(persona.ctx, 'post', '/api/v1/billing/checkout', { data: { plan: 'monthly' } });
    await expectRefusal(checkout, 503, 'BIL_003');

    const guest = await memoir.guest();
    const webhook = await guest.post(webhookPath(CONFIGURED_PROVIDER), { data: webhookEvent() });
    await expectRefusal(webhook, 503, 'BIL_003');
  });

  test('should reject an unauthenticated checkout request with 401', async ({ memoir }) => {
    const guest = await memoir.guest();
    const response = await guest.post('/api/v1/billing/checkout', { data: { plan: 'monthly' } });
    await expectRefusal(response, 401, 'IAM_001');
  });

  test('should compute grace and lapse purely from stored time fields on every read, never from the lapse sweep', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'billing-entitlement-read', onboard: true });
    const accountId = persona.account!.id;
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    async function readEntitlement(): Promise<EntitlementRow> {
      const { page } = await pullDeltaWith(persona.ctx, { domains: 'entitlement' });
      const [row] = (page.domains['entitlement'] ?? []) as unknown as EntitlementRow[];
      if (!row) throw new Error('sync/delta returned no entitlement row');
      return row;
    }

    await memoirDb()`
      INSERT INTO entitlements (account_id, tier, state, expires_at, grace_ends_at)
      VALUES (${accountId}, 'paid', 'grace', ${past}, ${future})
    `;
    expect(await readEntitlement(), 'inside the grace window: still paid').toMatchObject({ tier: 'paid', state: 'grace' });

    await memoirDb()`UPDATE entitlements SET grace_ends_at = ${past} WHERE account_id = ${accountId}`;
    expect(await readEntitlement(), 'grace window closed: reads free/lapsed the instant it passes, no sweep required').toMatchObject({ tier: 'free', state: 'lapsed' });

    await memoirDb()`UPDATE entitlements SET state = 'active', expires_at = ${past}, grace_ends_at = NULL WHERE account_id = ${accountId}`;
    expect(await readEntitlement(), 'an active period whose expiresAt has simply passed reads free/lapsed with no cancellation webhook').toMatchObject({
      tier: 'free',
      state: 'lapsed',
    });
  });
});
