import { afterAll, describe, expect, it } from 'bun:test';

import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { AppError } from '@shadow-library/common';
import { setConfig } from '@shadow-library/common/testing';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { BackChannelLogoutService, LOGOUT_CLAIM_LEASE_MS } from '@server/modules/auth/token/backchannel-logout.service';
import { claimLeaseFor, expiredClaim, recoverExpiredClaims, schema } from '@server/modules/infrastructure/datastore';
import { NOTIFICATION_SEND_TIMEOUT_MS, type NotificationClient } from '@server/modules/infrastructure/notification/notification.client';
import { NOTIFICATION_CLAIM_LEASE_MS, NotificationService } from '@server/modules/infrastructure/notification/notification.service';
import { WEBHOOK_CLAIM_LEASE_MS, WebhookDeliveryService } from '@server/modules/infrastructure/webhook/webhook-delivery.service';
import { type WebhookService } from '@server/modules/infrastructure/webhook/webhook.service';
import { type WebhookTargetGuard } from '@server/modules/infrastructure/webhook/webhook-target.guard';

interface Write {
  table: unknown;
  values: Record<string, unknown>;
}

const dialect = new PgDialect();
const render = (fragment: unknown): string => dialect.sqlToQuery(fragment as SQL).sql;

/** Every call returns the chain itself, and awaiting it yields `rows`: enough of a Drizzle builder for the statements under test. */
function chain(rows: unknown[] = []): unknown {
  const proxy: unknown = new Proxy(() => undefined, {
    get: (_target, property) => (property === 'then' ? (resolve: (value: unknown) => void) => resolve(rows) : () => proxy),
    apply: () => proxy,
  });
  return proxy;
}

function outboxDatabase(row: Record<string, unknown>) {
  const claims: Write[] = [];
  const outcomes: Write[] = [];
  const recording = (writes: Write[]) => (table: unknown) => ({ set: (values: Record<string, unknown>) => (writes.push({ table, values }), chain()) });
  const postgres = {
    transaction: (work: (tx: unknown) => Promise<unknown>) => work({ select: () => chain([row]), update: recording(claims) }),
    update: recording(outcomes),
  };
  return { database: new FakeDatabaseService({ postgres }), claims, outcomes };
}

function recoveryDatabase(recoveredIds: unknown[]) {
  const writes: { table: unknown; values: Record<string, unknown>; where: string; params: unknown[] }[] = [];
  const db = {
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: SQL) => {
          const { sql, params } = dialect.sqlToQuery(condition);
          writes.push({ table, values, where: sql, params });
          return { returning: () => Promise.resolve(recoveredIds.map(id => ({ id }))) };
        },
      }),
    }),
  };
  return { db: db as unknown as Parameters<typeof recoverExpiredClaims>[0], writes };
}

const failingGuard = { assertDeliverable: () => Promise.reject(AppError.internal('target unreachable')) } as unknown as WebhookTargetGuard;

describe('outbox claim leases', () => {
  afterAll(setConfig({ 'oauth.issuer': 'https://identity.example.com' }));

  it('should floor the lease at five minutes for short deliveries', () => {
    expect(claimLeaseFor(1, 1_000)).toBe(5 * 60_000);
  });

  it('should cover twice a whole batch sent back to back at the delivery timeout', () => {
    expect(claimLeaseFor(20, 30_000)).toBe(2 * 20 * 30_000);
  });

  it('should give the notification outbox a lease longer than a full batch of sends at the client timeout', () => {
    expect(NOTIFICATION_CLAIM_LEASE_MS).toBeGreaterThan(20 * NOTIFICATION_SEND_TIMEOUT_MS);
  });

  it('should treat a row as expired only while SENDING and only once its claim is older than the lease on the database clock', () => {
    const { sql, params } = dialect.sqlToQuery(expiredClaim(schema.oidcLogoutDeliveries, LOGOUT_CLAIM_LEASE_MS));
    expect(sql).toBe(
      '("oidc_logout_deliveries"."status" = $1 and coalesce("oidc_logout_deliveries"."claimed_at", "oidc_logout_deliveries"."next_attempt_at") < now() - make_interval(secs => $2))',
    );
    expect(params).toEqual(['SENDING', LOGOUT_CLAIM_LEASE_MS / 1000]);
  });

  it('should requeue expired claims as FAILED with the claim cleared and report how many it recovered', async () => {
    const { db, writes } = recoveryDatabase([1n, 2n]);

    expect(await recoverExpiredClaims(db, schema.webhookDeliveries, WEBHOOK_CLAIM_LEASE_MS)).toBe(2);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.table).toBe(schema.webhookDeliveries);
    expect(writes[0]?.values).toMatchObject({ status: 'FAILED', claimedAt: null });
    expect(writes[0]?.values).not.toHaveProperty('attemptCount');
    expect(writes[0]?.values).not.toHaveProperty('nextAttemptAt');
    expect(writes[0]?.params).toEqual(['SENDING', WEBHOOK_CLAIM_LEASE_MS / 1000]);
  });

  it('should stamp the notification claim with the database clock and clear it once sent', async () => {
    const { database, claims, outcomes } = outboxDatabase({ id: 1n, templateKey: 'otp', recipients: {}, payload: null, attemptCount: 0 });
    const client = { send: () => Promise.resolve() } as unknown as NotificationClient;

    expect(await new NotificationService(database, client).dispatchPending()).toBe(1);
    expect(claims.map(claim => [claim.values.status, render(claim.values.claimedAt)])).toEqual([['SENDING', 'now()']]);
    expect(outcomes.map(outcome => outcome.values)).toEqual([expect.objectContaining({ status: 'SENT', claimedAt: null })]);
  });

  it('should stamp the logout claim with the database clock and clear it when the delivery is retried', async () => {
    const { database, claims, outcomes } = outboxDatabase({
      id: 'delivery-1',
      clientId: 'rp',
      logoutUri: 'https://rp.example.com/logout',
      subject: '42',
      sid: '7',
      attemptCount: 0,
    });

    expect(await new BackChannelLogoutService(database, { sign: () => ({ token: 'logout-token' }) } as never, failingGuard).dispatchPending()).toBe(0);
    expect(claims.map(claim => [claim.values.status, render(claim.values.claimedAt)])).toEqual([['SENDING', 'now()']]);
    expect(outcomes.map(outcome => outcome.values)).toEqual([expect.objectContaining({ status: 'FAILED', claimedAt: null, attemptCount: 1 })]);
  });

  it('should stamp the webhook claim with the database clock and clear it when the delivery is retried', async () => {
    const { database, claims, outcomes } = outboxDatabase({ id: 5n, subscriptionId: 9n, eventType: 'user.created', payload: '{}', attemptCount: 0 });
    const webhookService = { getById: () => Promise.reject(AppError.internal('subscription lookup failed')) } as unknown as WebhookService;

    expect(await new WebhookDeliveryService(database, webhookService, failingGuard).dispatchPending()).toBe(0);
    expect(claims.map(claim => [claim.values.status, render(claim.values.claimedAt)])).toEqual([['SENDING', 'now()']]);
    expect(outcomes.map(outcome => outcome.values)).toEqual([expect.objectContaining({ status: 'FAILED', claimedAt: null, attemptCount: 1 })]);
  });
});
