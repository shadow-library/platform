/**
 * Importing npm packages
 */
import { createHmac } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { DatabaseService, PrimaryDatabase, WebhookDelivery, schema } from '@server/modules/infrastructure/datastore';

import { WebhookTargetGuard } from './webhook-target.guard';
import { WEBHOOK_EVENT_HEADER, WEBHOOK_ID_HEADER, WEBHOOK_SIGNATURE_HEADER } from './webhook.constants';
import { WebhookService } from './webhook.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const MAX_ATTEMPTS = 5;
const CLAIMABLE_STATUSES: WebhookDelivery.Status[] = ['PENDING', 'FAILED'];

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = Logger.getLogger(APP_NAME, WebhookDeliveryService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly webhookService: WebhookService,
    private readonly targetGuard: WebhookTargetGuard,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  /** `t=<unix>,v1=<hex>[,v1=<hex>]` — one v1 per currently valid signing secret (rotation overlap). */
  signatureFor(secrets: string[], timestamp: number, payload: string): string {
    const signatures = secrets.map(secret => `v1=${createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')}`);
    return [`t=${timestamp}`, ...signatures].join(',');
  }

  async listForSubscription(subscriptionId: bigint, status?: WebhookDelivery.Status, limit = 50): Promise<WebhookDelivery[]> {
    const conditions = [eq(schema.webhookDeliveries.subscriptionId, subscriptionId), status ? eq(schema.webhookDeliveries.status, status) : undefined].filter(
      condition => condition !== undefined,
    );
    return this.db
      .select()
      .from(schema.webhookDeliveries)
      .where(and(...conditions))
      .orderBy(sql`${schema.webhookDeliveries.id} DESC`)
      .limit(limit);
  }

  /** Puts a delivery (dead-lettered or otherwise settled) back into the claimable pool afresh. */
  async redeliver(subscriptionId: bigint, deliveryId: bigint): Promise<WebhookDelivery> {
    const [delivery] = await this.db
      .update(schema.webhookDeliveries)
      .set({ status: 'PENDING', attemptCount: 0, nextAttemptAt: new Date(), lastError: null })
      .where(and(eq(schema.webhookDeliveries.id, deliveryId), eq(schema.webhookDeliveries.subscriptionId, subscriptionId)))
      .returning();
    if (!delivery) throw new ServerError(AppErrorCode.WHK_003);
    return delivery;
  }

  /** Requeues deliveries stranded in SENDING by a worker crash; runs once at worker boot. */
  async recoverStuckDeliveries(): Promise<number> {
    const recovered = await this.db
      .update(schema.webhookDeliveries)
      .set({ status: 'FAILED', lastError: 'recovered after interrupted delivery' })
      .where(eq(schema.webhookDeliveries.status, 'SENDING'))
      .returning({ id: schema.webhookDeliveries.id });
    if (recovered.length > 0) this.logger.warn('Recovered interrupted webhook deliveries', { count: recovered.length });
    return recovered.length;
  }

  /** Claims a batch of due deliveries and posts them. Worker-driven. */
  async dispatchPending(limit = 20): Promise<number> {
    const claimed = await this.db.transaction(async tx => {
      const rows = await tx
        .select()
        .from(schema.webhookDeliveries)
        .where(and(inArray(schema.webhookDeliveries.status, CLAIMABLE_STATUSES), lte(schema.webhookDeliveries.nextAttemptAt, sql`now()`)))
        .orderBy(asc(schema.webhookDeliveries.nextAttemptAt))
        .limit(limit)
        .for('update', { skipLocked: true });
      if (rows.length === 0) return [];
      await tx
        .update(schema.webhookDeliveries)
        .set({ status: 'SENDING' })
        .where(
          inArray(
            schema.webhookDeliveries.id,
            rows.map(row => row.id),
          ),
        );
      return rows;
    });

    let sent = 0;
    for (const delivery of claimed) {
      try {
        const responseStatus = await this.send(delivery);
        await this.db.update(schema.webhookDeliveries).set({ status: 'SENT', sentAt: new Date(), responseStatus }).where(eq(schema.webhookDeliveries.id, delivery.id));
        sent += 1;
      } catch (error) {
        await this.markFailed(delivery, error);
      }
    }
    return sent;
  }

  private async send(delivery: WebhookDelivery): Promise<number> {
    const subscription = await this.webhookService.getById(delivery.subscriptionId);
    if (!subscription.isActive) throw new Error('subscription is disabled');
    /** Re-checked at send time: DNS may have changed since registration (rebinding). */
    await this.targetGuard.assertDeliverable(subscription.targetUrl);

    const timestamp = Math.floor(Date.now() / 1000);
    const secrets = this.webhookService.signingSecretsOf(subscription);
    const response = await fetch(subscription.targetUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [WEBHOOK_ID_HEADER]: delivery.id.toString(),
        [WEBHOOK_EVENT_HEADER]: delivery.eventType,
        [WEBHOOK_SIGNATURE_HEADER]: this.signatureFor(secrets, timestamp, delivery.payload),
      },
      body: delivery.payload,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`webhook endpoint answered ${response.status}`);
    return response.status;
  }

  private async markFailed(delivery: WebhookDelivery, error: unknown): Promise<void> {
    const attemptCount = delivery.attemptCount + 1;
    const dead = attemptCount >= MAX_ATTEMPTS;
    const backoffMinutes = Math.min(2 ** attemptCount, 60);
    const message = error instanceof Error ? error.message : String(error);
    await this.db
      .update(schema.webhookDeliveries)
      .set({ status: dead ? 'DEAD' : 'FAILED', attemptCount, lastError: message, nextAttemptAt: new Date(Date.now() + backoffMinutes * 60_000) })
      .where(eq(schema.webhookDeliveries.id, delivery.id));
    this.logger[dead ? 'error' : 'warn'](`Webhook ${dead ? 'dead-lettered' : 'delivery failed'}`, { id: delivery.id, attemptCount, message });
  }
}
