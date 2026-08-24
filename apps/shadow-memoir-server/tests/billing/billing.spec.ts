import '@server/bootstrap';

import { createHmac } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';
import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { BILLING_SIGNATURE_HEADER, BillingModule, EntitlementLapseService, EntitlementService } from '@modules/billing';
import { SchedulerModule } from '@modules/scheduler';
import { SyncModule } from '@modules/sync';
import { DatastoreModule, type PrimaryDatabase, schema } from '@server/database';
import { TEST_ROLE_PASSWORD } from '@tests/fixtures/seed';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { userToken } from '../test-idp';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, SyncModule, BillingModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, SchedulerModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_billing_spec`;

const WEBHOOK_SECRET = 'billing-spec-webhook-secret';
const CHECKOUT_URL = 'https://pay.example.test/checkout';
const GRACE_DAYS = 7;
const DAY_MS = 86_400_000;

function billingRoleUrl(): string {
  const { protocol, hostname, port } = new URL(baseConnectionString);
  return `${protocol}//memoir_billing:${TEST_ROLE_PASSWORD}@${hostname}:${port}/${databaseName}`;
}

interface EventEnvelope {
  id: string;
  type: string;
  occurredAt: string;
  clientReference?: string | null;
  customerId?: string | null;
  periodEndsAt?: string | null;
}

function sign(envelope: EventEnvelope, timestampSeconds = Math.floor(Date.now() / 1000)): { raw: string; signature: string } {
  const raw = JSON.stringify(envelope);
  const signature = createHmac('sha256', WEBHOOK_SECRET).update(`${timestampSeconds}.`).update(Buffer.from(raw, 'utf8')).digest('hex');
  return { raw, signature: `t=${timestampSeconds},v1=${signature}` };
}

describe('Entitlements & billing (T-31)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  const originalSchedulerEnabled = Config.get('scheduler.enabled');
  let app: ShadowApplication;
  let router: FastifyRouter;
  let db: PrimaryDatabase;
  let entitlements: EntitlementService;
  let lapseService: EntitlementLapseService;
  let subject = 0;

  function post(path: string, envelope: EventEnvelope, timestampSeconds?: number) {
    const { raw, signature } = sign(envelope, timestampSeconds);
    return router
      .mockRequest()
      .post(path)
      .headers({ 'content-type': 'application/json', [BILLING_SIGNATURE_HEADER]: signature })
      .body(raw);
  }

  function webhook(envelope: EventEnvelope, timestampSeconds?: number) {
    return post('/api/v1/billing/webhooks/generic-hmac', envelope, timestampSeconds);
  }

  /** Every fixture account is created through a real authenticated request, exactly as a first-contact user would be. */
  async function freshUser(name: string): Promise<{ token: string; accountId: bigint; purchaseToken: string }> {
    subject += 1;
    const identitySub = `${name}-${subject}`;
    const token = await userToken(identitySub);
    await router
      .mockRequest()
      .get('/api/v1/sync/delta?since=0')
      .headers({ authorization: `Bearer ${token}` });
    const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.identitySub, identitySub));
    return { token, accountId: account!.id, purchaseToken: account!.purchaseToken };
  }

  function readEntitlement(accountId: bigint) {
    return db.select().from(schema.entitlements).where(eq(schema.entitlements.accountId, accountId));
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    Config['cache'].set('database.postgres.billing-url', billingRoleUrl());
    Config['cache'].set('billing.webhook-secret', WEBHOOK_SECRET);
    Config['cache'].set('billing.checkout-url', CHECKOUT_URL);
    Config['cache'].set('billing.grace-days', GRACE_DAYS);
    Config['cache'].set('scheduler.enabled', false);

    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as FastifyRouter;
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
    entitlements = app.get(EntitlementService);
    lapseService = app.get(EntitlementLapseService);
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    Config['cache'].set('scheduler.enabled', originalSchedulerEnabled);
    await dropDatabase(databaseName);
  });

  describe('webhook verification', () => {
    it('should reject a body whose signature does not verify', async () => {
      const response = await router
        .mockRequest()
        .post('/api/v1/billing/webhooks/generic-hmac')
        .headers({ 'content-type': 'application/json', [BILLING_SIGNATURE_HEADER]: `t=${Math.floor(Date.now() / 1000)},v1=deadbeef` })
        .body(JSON.stringify({ id: 'evt-bad-sig', type: 'subscription.activated', occurredAt: new Date().toISOString() }));

      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe('BIL_001');
    });

    it('should reject a signature whose timestamp is outside the configured tolerance', async () => {
      const stale = Math.floor(Date.now() / 1000) - Config.get('billing.webhook-tolerance-seconds') - 60;
      const response = await webhook({ id: 'evt-stale', type: 'subscription.activated', occurredAt: new Date().toISOString() }, stale);

      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe('BIL_001');
    });

    it('should reject a delivery carrying no signature header at all', async () => {
      const response = await router
        .mockRequest()
        .post('/api/v1/billing/webhooks/generic-hmac')
        .headers({ 'content-type': 'application/json' })
        .body(JSON.stringify({ id: 'evt-unsigned', type: 'subscription.activated', occurredAt: new Date().toISOString() }));

      expect(response.statusCode).toBe(401);
    });

    it('should reject a provider segment naming no configured adapter', async () => {
      const response = await post('/api/v1/billing/webhooks/some-other-psp', { id: 'evt-other', type: 'subscription.activated', occurredAt: new Date().toISOString() });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('BIL_002');
    });

    it('should record no event for a delivery that failed verification', async () => {
      const events = await db.select().from(schema.billingEvents).where(eq(schema.billingEvents.providerEventId, 'evt-bad-sig'));
      expect(events).toHaveLength(0);
    });
  });

  describe('projection apply', () => {
    it('should move the account to paid on an activation event and record the event as processed', async () => {
      const user = await freshUser('billing-activate');
      const periodEndsAt = new Date(Date.now() + 30 * DAY_MS).toISOString();

      const response = await webhook({
        id: 'evt-activate-1',
        type: 'subscription.activated',
        occurredAt: new Date().toISOString(),
        clientReference: user.purchaseToken,
        customerId: 'cus_activate_1',
        periodEndsAt,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ received: true });

      const [row] = await readEntitlement(user.accountId);
      expect(row).toMatchObject({ tier: 'paid', state: 'active', provider: 'generic-hmac', providerRef: 'cus_activate_1' });
      expect(await entitlements.getTier(user.accountId)).toBe('paid');

      const [event] = await db.select().from(schema.billingEvents).where(eq(schema.billingEvents.providerEventId, 'evt-activate-1'));
      expect(event).toMatchObject({ accountId: user.accountId, processed: true, quarantined: false });
    });

    it('should converge on one event row and one projection when the same delivery is replayed five times', async () => {
      const user = await freshUser('billing-replay');
      const envelope: EventEnvelope = {
        id: 'evt-replay-1',
        type: 'subscription.activated',
        occurredAt: new Date().toISOString(),
        clientReference: user.purchaseToken,
        customerId: 'cus_replay_1',
        periodEndsAt: new Date(Date.now() + 30 * DAY_MS).toISOString(),
      };

      for (let attempt = 0; attempt < 5; attempt++) {
        const response = await webhook(envelope);
        expect(response.statusCode).toBe(200);
      }

      const events = await db.select().from(schema.billingEvents).where(eq(schema.billingEvents.providerEventId, 'evt-replay-1'));
      expect(events).toHaveLength(1);

      const [row] = await readEntitlement(user.accountId);
      expect(row).toMatchObject({ tier: 'paid', state: 'active' });
    });

    it('should no-op a duplicate event id even when its payload differs', async () => {
      const user = await freshUser('billing-duplicate');
      const occurredAt = new Date().toISOString();
      const periodEndsAt = new Date(Date.now() + 30 * DAY_MS).toISOString();

      await webhook({ id: 'evt-duplicate-1', type: 'subscription.activated', occurredAt, clientReference: user.purchaseToken, periodEndsAt });
      const [afterFirst] = await readEntitlement(user.accountId);

      const cancel = await webhook({
        id: 'evt-duplicate-1',
        type: 'subscription.cancelled',
        occurredAt: new Date(Date.now() + 1000).toISOString(),
        clientReference: user.purchaseToken,
      });
      expect(cancel.statusCode).toBe(200);

      const [afterSecond] = await readEntitlement(user.accountId);
      expect(afterSecond).toMatchObject({ tier: 'paid', state: 'active' });
      expect(afterSecond!.syncSeq).toBe(afterFirst!.syncSeq);
    });

    it('should not let an event older than the applied one regress the projection', async () => {
      const user = await freshUser('billing-out-of-order');
      const now = Date.now();

      await webhook({
        id: 'evt-order-new',
        type: 'subscription.activated',
        occurredAt: new Date(now).toISOString(),
        clientReference: user.purchaseToken,
        periodEndsAt: new Date(now + 30 * DAY_MS).toISOString(),
      });

      const late = await webhook({
        id: 'evt-order-old',
        type: 'subscription.cancelled',
        occurredAt: new Date(now - 60 * 60 * 1000).toISOString(),
        clientReference: user.purchaseToken,
      });
      expect(late.statusCode).toBe(200);

      const [row] = await readEntitlement(user.accountId);
      expect(row).toMatchObject({ tier: 'paid', state: 'active' });
      expect(await entitlements.getTier(user.accountId)).toBe('paid');

      const [recorded] = await db.select().from(schema.billingEvents).where(eq(schema.billingEvents.providerEventId, 'evt-order-old'));
      expect(recorded).toMatchObject({ accountId: user.accountId, quarantined: false });
    });

    it('should apply a newer event that arrives after an older one', async () => {
      const user = await freshUser('billing-in-order');
      const now = Date.now();

      await webhook({
        id: 'evt-inorder-1',
        type: 'subscription.activated',
        occurredAt: new Date(now - 60 * 60 * 1000).toISOString(),
        clientReference: user.purchaseToken,
        periodEndsAt: new Date(now + 30 * DAY_MS).toISOString(),
      });
      await webhook({ id: 'evt-inorder-2', type: 'subscription.cancelled', occurredAt: new Date(now).toISOString(), clientReference: user.purchaseToken });

      const [row] = await readEntitlement(user.accountId);
      expect(row).toMatchObject({ tier: 'free', state: 'lapsed' });
      expect(await entitlements.getTier(user.accountId)).toBe('free');
    });
  });

  describe('unmatched events', () => {
    it('should quarantine an event whose purchase token matches no account without failing the delivery', async () => {
      const response = await webhook({
        id: 'evt-unmatched-1',
        type: 'subscription.activated',
        occurredAt: new Date().toISOString(),
        clientReference: '11111111-2222-3333-4444-555555555555',
        customerId: 'cus_unmatched',
        periodEndsAt: new Date(Date.now() + 30 * DAY_MS).toISOString(),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ received: true });

      const [event] = await db.select().from(schema.billingEvents).where(eq(schema.billingEvents.providerEventId, 'evt-unmatched-1'));
      expect(event).toMatchObject({ accountId: null, quarantined: true, processed: false });
    });

    it('should match a later event by provider ref once an earlier one bound it to the account', async () => {
      const user = await freshUser('billing-provider-ref');
      const now = Date.now();

      await webhook({
        id: 'evt-ref-1',
        type: 'subscription.activated',
        occurredAt: new Date(now).toISOString(),
        clientReference: user.purchaseToken,
        customerId: 'cus_ref_1',
        periodEndsAt: new Date(now + 30 * DAY_MS).toISOString(),
      });

      await webhook({ id: 'evt-ref-2', type: 'subscription.cancelled', occurredAt: new Date(now + 1000).toISOString(), customerId: 'cus_ref_1' });

      const [row] = await readEntitlement(user.accountId);
      expect(row).toMatchObject({ tier: 'free', state: 'lapsed' });
    });
  });

  describe('trial-once', () => {
    it('should grant the first trial and refuse a second one for the same account', async () => {
      const user = await freshUser('billing-trial');
      const now = Date.now();

      await webhook({
        id: 'evt-trial-1',
        type: 'trial.started',
        occurredAt: new Date(now).toISOString(),
        clientReference: user.purchaseToken,
        periodEndsAt: new Date(now + 7 * DAY_MS).toISOString(),
      });

      const [afterFirst] = await readEntitlement(user.accountId);
      expect(afterFirst).toMatchObject({ tier: 'paid', state: 'trial', trialUsed: true });

      await webhook({ id: 'evt-trial-lapse', type: 'subscription.expired', occurredAt: new Date(now + 8 * DAY_MS).toISOString(), clientReference: user.purchaseToken });

      const second = await webhook({
        id: 'evt-trial-2',
        type: 'trial.started',
        occurredAt: new Date(now + 9 * DAY_MS).toISOString(),
        clientReference: user.purchaseToken,
        periodEndsAt: new Date(now + 16 * DAY_MS).toISOString(),
      });
      expect(second.statusCode).toBe(200);

      const [afterSecond] = await readEntitlement(user.accountId);
      expect(afterSecond).toMatchObject({ tier: 'free', state: 'lapsed', trialUsed: true });
      expect(await entitlements.getTier(user.accountId)).toBe('free');
    });
  });

  describe('grace, lapse and restore on server time', () => {
    it('should read as paid inside grace, as free once grace has closed, and as paid again after a restore', async () => {
      const user = await freshUser('billing-grace');
      const now = Date.now();
      const periodEndsAt = new Date(now - DAY_MS);

      await webhook({
        id: 'evt-grace-1',
        type: 'subscription.past_due',
        occurredAt: new Date(now).toISOString(),
        clientReference: user.purchaseToken,
        periodEndsAt: periodEndsAt.toISOString(),
      });

      const [inGrace] = await readEntitlement(user.accountId);
      expect(inGrace).toMatchObject({ tier: 'paid', state: 'grace' });
      expect(inGrace!.graceEndsAt).toEqual(new Date(periodEndsAt.getTime() + GRACE_DAYS * DAY_MS));
      expect(await entitlements.getTier(user.accountId)).toBe('paid');

      const pastGrace = new Date(inGrace!.graceEndsAt!.getTime() + 1000);
      expect((await entitlements.get(user.accountId, pastGrace)).state).toBe('lapsed');
      expect((await entitlements.get(user.accountId, pastGrace)).tier).toBe('free');

      await webhook({
        id: 'evt-grace-restore',
        type: 'subscription.activated',
        occurredAt: new Date(now + DAY_MS).toISOString(),
        clientReference: user.purchaseToken,
        periodEndsAt: new Date(now + 30 * DAY_MS).toISOString(),
      });

      const [restored] = await readEntitlement(user.accountId);
      expect(restored).toMatchObject({ tier: 'paid', state: 'active', trialUsed: false });
      expect(await entitlements.getTier(user.accountId)).toBe('paid');
    });

    it('should read an unrenewed active period as lapsed the moment it expires, without a webhook', async () => {
      const user = await freshUser('billing-expiry');
      const periodEndsAt = new Date(Date.now() + 60_000);

      await webhook({
        id: 'evt-expiry-1',
        type: 'subscription.activated',
        occurredAt: new Date().toISOString(),
        clientReference: user.purchaseToken,
        periodEndsAt: periodEndsAt.toISOString(),
      });

      expect(await entitlements.getTier(user.accountId)).toBe('paid');
      expect((await entitlements.get(user.accountId, new Date(periodEndsAt.getTime() + 1000))).tier).toBe('free');
    });

    it('should materialize an expired period as a lapsed row when the sweep runs, changing nothing a read did not already report', async () => {
      const user = await freshUser('billing-sweep');
      const periodEndsAt = new Date(Date.now() - DAY_MS);

      await webhook({
        id: 'evt-sweep-1',
        type: 'subscription.activated',
        occurredAt: new Date(Date.now() - 2 * DAY_MS).toISOString(),
        clientReference: user.purchaseToken,
        periodEndsAt: periodEndsAt.toISOString(),
      });

      const [beforeSweep] = await readEntitlement(user.accountId);
      expect(beforeSweep).toMatchObject({ state: 'active' });
      expect(await entitlements.getTier(user.accountId)).toBe('free');

      await lapseService.run();
      const [afterSweep] = await readEntitlement(user.accountId);
      expect(afterSweep).toMatchObject({ tier: 'free', state: 'lapsed' });

      await lapseService.run();
      const [afterSecondSweep] = await readEntitlement(user.accountId);
      expect(afterSecondSweep!.syncSeq).toBe(afterSweep!.syncSeq);
    });

    it('should delete nothing on lapse — every user-owned row survives the tier change', async () => {
      const user = await freshUser('billing-lapse-preserves');
      const now = Date.now();

      const [quest] = await db
        .insert(schema.quests)
        .values({ accountId: user.accountId, name: 'Morning run', durationMin: 30, statAffinity: 'body', strictness: 'routine', recurrence: {} })
        .returning();
      await db.insert(schema.journalEntries).values({ id: crypto.randomUUID(), accountId: user.accountId, date: new Date().toISOString().slice(0, 10), text: 'still here' });

      await webhook({
        id: 'evt-preserve-1',
        type: 'subscription.activated',
        occurredAt: new Date(now).toISOString(),
        clientReference: user.purchaseToken,
        periodEndsAt: new Date(now + 30 * DAY_MS).toISOString(),
      });
      await webhook({ id: 'evt-preserve-2', type: 'subscription.cancelled', occurredAt: new Date(now + 1000).toISOString(), clientReference: user.purchaseToken });

      expect(await entitlements.getTier(user.accountId)).toBe('free');
      const quests = await db.select().from(schema.quests).where(eq(schema.quests.accountId, user.accountId));
      const journals = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.accountId, user.accountId));
      expect(quests).toHaveLength(1);
      expect(quests[0]!.id).toBe(quest!.id);
      expect(journals).toHaveLength(1);
    });
  });

  describe('checkout', () => {
    it('should return a hosted session bound to the account purchase token', async () => {
      const user = await freshUser('billing-checkout');

      const response = await router
        .mockRequest()
        .post('/api/v1/billing/checkout')
        .headers({ authorization: `Bearer ${user.token}` })
        .body({ plan: 'yearly' });

      expect(response.statusCode).toBe(200);
      const url = new URL(response.json().url);
      expect(url.origin + url.pathname).toBe(CHECKOUT_URL);
      expect(url.searchParams.get('client_reference_id')).toBe(user.purchaseToken);
      expect(url.searchParams.get('plan')).toBe('yearly');
      expect(url.searchParams.get('amount')).toBe(String(Config.get('billing.price-yearly-minor')));
      expect(url.searchParams.get('trial_days')).toBe(String(Config.get('billing.trial-days')));
      expect(new Date(response.json().expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('should stop offering a trial in the checkout session once the account has used one', async () => {
      const user = await freshUser('billing-checkout-trial-used');
      await webhook({
        id: 'evt-checkout-trial',
        type: 'trial.started',
        occurredAt: new Date().toISOString(),
        clientReference: user.purchaseToken,
        periodEndsAt: new Date(Date.now() + 7 * DAY_MS).toISOString(),
      });

      const response = await router
        .mockRequest()
        .post('/api/v1/billing/checkout')
        .headers({ authorization: `Bearer ${user.token}` })
        .body({ plan: 'monthly' });

      expect(response.statusCode).toBe(200);
      expect(new URL(response.json().url).searchParams.get('trial_days')).toBeNull();
    });

    it('should reject an unauthenticated checkout request', async () => {
      const response = await router.mockRequest().post('/api/v1/billing/checkout').body({ plan: 'monthly' });
      expect(response.statusCode).toBe(401);
    });

    it('should mint a distinct purchase token per account', async () => {
      const first = await freshUser('billing-token-a');
      const second = await freshUser('billing-token-b');
      expect(first.purchaseToken).not.toBe(second.purchaseToken);
    });
  });

  describe('entitlement is read-only to the user', () => {
    it('should expose no route through which a user token could write an entitlement', async () => {
      const user = await freshUser('billing-no-write');
      const attempts = await Promise.all([
        router
          .mockRequest()
          .post('/api/v1/billing/entitlement')
          .headers({ authorization: `Bearer ${user.token}` })
          .body({ tier: 'paid' }),
        router
          .mockRequest()
          .put('/api/v1/billing/entitlement')
          .headers({ authorization: `Bearer ${user.token}` })
          .body({ tier: 'paid' }),
        router
          .mockRequest()
          .patch('/api/v1/account')
          .headers({ authorization: `Bearer ${user.token}` })
          .body({ tier: 'paid' }),
      ]);

      expect(attempts[0]!.statusCode).toBe(404);
      expect(attempts[1]!.statusCode).toBe(404);

      const [row] = await readEntitlement(user.accountId);
      expect(row).toBeUndefined();
      expect(await entitlements.getTier(user.accountId)).toBe('free');
    });

    it('should carry the tier to the client as an entitlement snapshot delta', async () => {
      const user = await freshUser('billing-delta');
      await webhook({
        id: 'evt-delta-1',
        type: 'subscription.activated',
        occurredAt: new Date().toISOString(),
        clientReference: user.purchaseToken,
        periodEndsAt: new Date(Date.now() + 30 * DAY_MS).toISOString(),
      });

      const response = await router
        .mockRequest()
        .get('/api/v1/sync/delta?since=0&domains=entitlement')
        .headers({ authorization: `Bearer ${user.token}` });

      expect(response.statusCode).toBe(200);
      expect(response.json().domains.entitlement).toEqual([{ tier: 'paid', state: 'active', expiresAt: expect.any(String), trialUsed: false }]);
    });
  });

  /**
   * Billing is optional configuration. `ShadowFactory.create` is what runs the `onApplicationReady`
   * hooks that flip the readiness probe to 200, so a provider reaching for the `memoir_billing` pool
   * during DI — a getter the container evaluates while walking instance properties, an eager pool in a
   * constructor, a sweep registration that connects — fails `create` and leaves the whole app 503 on
   * `/health/ready`. Asserting on `create` tests that at its source rather than through a fixed health
   * port a second test process could be sharing.
   */
  describe('boot with billing unconfigured', () => {
    let unconfiguredApp: ShadowApplication;
    let unconfiguredRouter: FastifyRouter;

    beforeAll(async () => {
      Config['cache'].delete('database.postgres.billing-url');
      Config['cache'].delete('billing.webhook-secret');
      Config['cache'].delete('billing.checkout-url');
      unconfiguredApp = await ShadowFactory.create(TestAppModule);
      unconfiguredRouter = unconfiguredApp.get(Dispatcher) as FastifyRouter;
    });

    afterAll(async () => {
      await unconfiguredApp.stop();
      Config['cache'].set('database.postgres.billing-url', billingRoleUrl());
      Config['cache'].set('billing.webhook-secret', WEBHOOK_SECRET);
      Config['cache'].set('billing.checkout-url', CHECKOUT_URL);
    });

    it('should reach application-ready without a billing pool, opening no connection for it', () => {
      expect(unconfiguredApp.isInitiated()).toBe(true);
      expect(unconfiguredApp.get(EntitlementService)).toBeDefined();
    });

    it('should still answer ordinary user traffic', async () => {
      const token = await userToken('billing-unconfigured-sub');
      const response = await unconfiguredRouter
        .mockRequest()
        .get('/api/v1/sync/delta?since=0')
        .headers({ authorization: `Bearer ${token}` });
      expect(response.statusCode).toBe(200);
    });

    it('should confine the failure to the billing endpoints, which report it as unavailable', async () => {
      const webhookResponse = await unconfiguredRouter
        .mockRequest()
        .post('/api/v1/billing/webhooks/generic-hmac')
        .headers({ 'content-type': 'application/json', [BILLING_SIGNATURE_HEADER]: `t=${Math.floor(Date.now() / 1000)},v1=deadbeef` })
        .body(JSON.stringify({ id: 'evt-unconfigured', type: 'subscription.activated', occurredAt: new Date().toISOString() }));

      expect(webhookResponse.statusCode).toBe(503);
      expect(webhookResponse.json().code).toBe('BIL_003');

      const token = await userToken('billing-unconfigured-checkout-sub');
      const checkoutResponse = await unconfiguredRouter
        .mockRequest()
        .post('/api/v1/billing/checkout')
        .headers({ authorization: `Bearer ${token}` })
        .body({ plan: 'monthly' });

      expect(checkoutResponse.statusCode).toBe(503);
      expect(checkoutResponse.json().code).toBe('BIL_003');
    });
  });
});
