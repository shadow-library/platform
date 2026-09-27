/**
 * Importing npm packages
 */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

import { type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { KUBE_CONTEXT, memoirDb } from '../../lib';
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
 * neither `BILLING_WEBHOOK_SECRET` nor `BILLING_CHECKOUT_URL` appears in any configmap/secret memoir loads
 * (verified read-only via `kubectl get configmap/secret -n memoir -o go-template=…`, key names only — the
 * template never expands `$v`, so a Secret's base64 values never transit stdout). The test that depends on
 * that state (`should reach application-ready...`) reads live cluster state itself before asserting: a
 * `NotFound` reads as "unconfigured" (today's actual shape), any other kubectl failure (off PATH, wrong
 * context, RBAC) is a probe failure that skips the test with its own reason rather than being misread as
 * "unconfigured", and a future environment that names a provider also skips it — never a false failure either
 * way. The grace/lapse read (`resolveEffectiveState`, `entitlement-lifecycle.ts`) is a pure function of stored
 * columns and server time — independent of the webhook secret and of the hourly `EntitlementLapseService`
 * sweep — so the grace/lapse test needs no such guard.
 */

const CONFIGURED_PROVIDER = 'generic-hmac';
const BILLING_ENV_KEYS: readonly string[] = ['BILLING_WEBHOOK_SECRET', 'BILLING_CHECKOUT_URL'];
const MEMOIR_CONFIG_SOURCES: readonly (readonly ['configmap' | 'secret', string])[] = [
  ['configmap', 'cluster-config'],
  ['configmap', 'common-config'],
  ['configmap', 'memoir-server-config'],
  ['secret', 'common-secrets'],
  ['secret', 'memoir-server-secrets'],
];

const run = promisify(execFile);

/** `{{println $k}}` per data key — never `{{$v}}`, so a Secret's base64 values never transit stdout. */
const KEY_NAMES_TEMPLATE = '{{range $k,$v := .data}}{{println $k}}{{end}}';

function webhookPath(provider: string): string {
  return `/api/v1/billing/webhooks/${provider}`;
}

function webhookEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: `evt_${randomUUID()}`, type: 'subscription.activated', occurredAt: new Date().toISOString(), ...overrides };
}

class KubectlProbeError extends Error {
  override readonly name = 'KubectlProbeError';
}

/**
 * Key NAMES only, never values. A resource kubectl reports missing (`NotFound`) is read as "contributes no
 * keys" — that's the ordinary unconfigured shape (no `memoir-server-secrets` Secret exists in dev at all).
 * Any other failure (kubectl off PATH, the wrong/unreachable context, RBAC) must not collapse to the same
 * "no keys" result, since that would silently misread "couldn't check" as "unconfigured" — it's raised instead
 * so the caller can tell the two apart, mirroring `clusterTokensAvailable`'s own availability-vs-refusal split.
 */
async function resourceDataKeys(kind: 'configmap' | 'secret', name: string): Promise<string[]> {
  try {
    const { stdout } = await run('kubectl', ['--context', KUBE_CONTEXT, '-n', 'memoir', 'get', kind, name, '-o', `go-template=${KEY_NAMES_TEMPLATE}`]);
    return stdout
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String((error as { stderr?: unknown }).stderr ?? '') : '';
    if (/\(NotFound\)/.test(stderr)) return [];
    const reason = stderr || (error instanceof Error ? error.message : String(error));
    throw new KubectlProbeError(`could not read ${kind}/${name} in namespace memoir: ${reason}`);
  }
}

interface BillingConfigProbe {
  /** Whether either billing env var is set anywhere memoir-server's `envFrom` reads from. Meaningless when `probeFailed`. */
  configured: boolean;
  /** The cluster couldn't be read at all (not merely "resource absent") — the unconfigured-503 assertion cannot be trusted either way. */
  probeFailed: boolean;
}

async function probeBillingConfig(): Promise<BillingConfigProbe> {
  try {
    const keysBySource = await Promise.all(MEMOIR_CONFIG_SOURCES.map(([kind, name]) => resourceDataKeys(kind, name)));
    const keys = new Set(keysBySource.flat());
    return { configured: BILLING_ENV_KEYS.some(key => keys.has(key)), probeFailed: false };
  } catch {
    return { configured: false, probeFailed: true };
  }
}

async function expectRefusal(response: APIResponse, status: number, code: string): Promise<void> {
  expect(response.status(), `${response.url()} answered ${await response.text()}`).toBe(status);
  expect(await errorCodeOf(response)).toBe(code);
}

test.describe('memoir billing', () => {
  let configured: boolean;
  let probeFailed: boolean;

  test.beforeAll(async () => {
    ({ configured, probeFailed } = await probeBillingConfig());
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
