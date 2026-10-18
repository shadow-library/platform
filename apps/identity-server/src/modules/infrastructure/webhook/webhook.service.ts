import { randomBytes } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger, throwError } from '@shadow-library/common';
import { CryptoErrorCode } from '@shadow-library/common/crypto';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { SEALED_COLUMNS, SecretSealer } from '@server/modules/auth/keys';
import { AuditEvent, DatabaseService, PrimaryDatabase, reserveSerialId, schema, WebhookSubscription } from '@server/modules/infrastructure/datastore';

import { WebhookTargetGuard } from './webhook-target.guard';
import { WEBHOOK_ROTATION_OVERLAP_HOURS, WEBHOOK_SECRET_PREFIX } from './webhook.constants';

type OutboxWriter = Pick<PrimaryDatabase, 'insert' | 'query'>;

export interface CreateSubscriptionInput {
  name: string;
  targetUrl: string;
  eventTypes: string[];
}

export interface UpdateSubscriptionInput {
  name?: string;
  targetUrl?: string;
  eventTypes?: string[];
  isActive?: boolean;
}

export interface CreatedSubscription {
  subscription: WebhookSubscription;
  secret: string;
}

interface SubscriptionCache {
  subscriptions: WebhookSubscription[];
  expiresAt: number;
}

/**
 * Webhook payloads carry identifiers and event metadata only — never the audit `detail` object,
 * addresses, or secrets. Receivers needing more must call back with their own credentials, so a
 * compromised webhook endpoint leaks nothing sensitive. Event filters accept exact audit action
 * names, `prefix.*` patterns, or `*`.
 */
const SUBSCRIPTION_CACHE_TTL_MS = 30_000;
/** A stored secret that is tampered with, malformed or absent; a key missing from the keyring is a deployment fault, not the row's, and is rethrown */
const UNREADABLE_SECRET_CODES = [CryptoErrorCode.DECRYPTION_FAILED, CryptoErrorCode.ENVELOPE_UNSUPPORTED, AppErrorCode.KEY_001];

@Injectable()
export class WebhookService {
  private readonly logger = Logger.getLogger(APP_NAME, WebhookService.name);
  private readonly db: PrimaryDatabase;
  private cache: SubscriptionCache | null = null;

  constructor(
    databaseService: DatabaseService,
    private readonly sealer: SecretSealer,
    private readonly targetGuard: WebhookTargetGuard,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  private generateSecret(): string {
    return `${WEBHOOK_SECRET_PREFIX}${randomBytes(32).toString('base64url')}`;
  }

  private async currentSecretOf(subscription: WebhookSubscription): Promise<string> {
    const stored = { envelope: subscription.secretEnvelope, legacy: subscription.secretCiphertext };
    return (await this.sealer.open(stored, SEALED_COLUMNS.webhookSecret, subscription.id)).toString('utf8');
  }

  private async previousSecretOf(subscription: WebhookSubscription): Promise<string | null> {
    const stored = { envelope: subscription.previousSecretEnvelope, legacy: subscription.previousSecretCiphertext };
    if (stored.envelope === null && stored.legacy === null) return null;
    return (await this.sealer.open(stored, SEALED_COLUMNS.webhookPreviousSecret, subscription.id)).toString('utf8');
  }

  async signingSecretsOf(subscription: WebhookSubscription): Promise<string[]> {
    const secrets = [await this.currentSecretOf(subscription)];
    const overlapValid = subscription.previousSecretExpiresAt && subscription.previousSecretExpiresAt.getTime() > Date.now();
    const previous = overlapValid ? await this.previousSecretOf(subscription) : null;
    if (previous !== null) secrets.push(previous);
    return secrets;
  }

  invalidateCache(): void {
    this.cache = null;
  }

  async create(input: CreateSubscriptionInput): Promise<CreatedSubscription> {
    this.targetGuard.assertAcceptableUrl(input.targetUrl);
    const secret = this.generateSecret();
    const id = await reserveSerialId(this.db, 'webhook_subscriptions');
    const secretEnvelope = await this.sealer.seal(secret, SEALED_COLUMNS.webhookSecret, id);
    const subscription = await this.db
      .insert(schema.webhookSubscriptions)
      .values({ id, name: input.name, targetUrl: input.targetUrl, eventTypes: input.eventTypes, secretEnvelope })
      .returning()
      .then(([row]) => row ?? throwError(AppError.internal('Failed to create webhook subscription')));
    this.invalidateCache();
    this.logger.info('Webhook subscription created', { subscriptionId: subscription.id, targetUrl: input.targetUrl });
    return { subscription, secret };
  }

  async list(): Promise<WebhookSubscription[]> {
    return this.db.query.webhookSubscriptions.findMany();
  }

  async getById(subscriptionId: bigint): Promise<WebhookSubscription> {
    const subscription = await this.db.query.webhookSubscriptions.findFirst({ where: eq(schema.webhookSubscriptions.id, subscriptionId) });
    if (!subscription) throw AppErrorCode.WHK_001.create();
    return subscription;
  }

  async update(subscriptionId: bigint, input: UpdateSubscriptionInput): Promise<WebhookSubscription> {
    if (input.targetUrl) this.targetGuard.assertAcceptableUrl(input.targetUrl);
    await this.getById(subscriptionId);
    const [updated] = await this.db
      .update(schema.webhookSubscriptions)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.webhookSubscriptions.id, subscriptionId))
      .returning();
    if (!updated) throw AppErrorCode.WHK_001.create();
    this.invalidateCache();
    return updated;
  }

  /**
   * The outgoing secret is re-sealed under the previous-secret context, since an envelope is bound to its column and cannot simply move. The row is
   * locked first, so a concurrent rotation demotes this one's secret instead of both demoting the same one and losing a secret already handed out.
   */
  async rotateSecret(subscriptionId: bigint): Promise<CreatedSubscription> {
    const secret = this.generateSecret();
    const updated = await this.db.transaction(async tx => {
      const [subscription] = await tx.select().from(schema.webhookSubscriptions).where(eq(schema.webhookSubscriptions.id, subscriptionId)).for('update');
      if (!subscription) throw AppErrorCode.WHK_001.create();
      const outgoing = await this.currentSecretOf(subscription).catch((error: unknown) => this.unreadableOutgoing(subscription.id, error));
      const [row] = await tx
        .update(schema.webhookSubscriptions)
        .set({
          secretEnvelope: await this.sealer.seal(secret, SEALED_COLUMNS.webhookSecret, subscription.id),
          previousSecretEnvelope: outgoing === null ? null : await this.sealer.seal(outgoing, SEALED_COLUMNS.webhookPreviousSecret, subscription.id),
          previousSecretExpiresAt: outgoing === null ? null : new Date(Date.now() + WEBHOOK_ROTATION_OVERLAP_HOURS * 3_600_000),
          updatedAt: new Date(),
        })
        .where(eq(schema.webhookSubscriptions.id, subscription.id))
        .returning();
      return row ?? throwError(AppErrorCode.WHK_001.create());
    });
    this.invalidateCache();
    this.logger.info('Webhook secret rotated', { subscriptionId });
    return { subscription: updated, secret };
  }

  /** Rotation is how an admin repairs a subscription whose secret no longer opens, so it proceeds without an overlap rather than failing */
  private unreadableOutgoing(subscriptionId: bigint, error: unknown): null {
    if (!UNREADABLE_SECRET_CODES.some(code => AppError.is(error, code))) throw error;
    this.logger.error('Rotating a webhook whose current secret could not be read; it gets no overlap window', {
      subscriptionId,
      code: AppError.is(error) ? error.code : 'unknown',
    });
    return null;
  }

  async remove(subscriptionId: bigint): Promise<void> {
    await this.getById(subscriptionId);
    await this.db.delete(schema.webhookSubscriptions).where(eq(schema.webhookSubscriptions.id, subscriptionId));
    this.invalidateCache();
  }

  private matches(subscription: WebhookSubscription, action: string): boolean {
    return subscription.eventTypes.some(pattern => {
      if (pattern === '*') return true;
      if (pattern.endsWith('.*')) return action.startsWith(pattern.slice(0, -1));
      return pattern === action;
    });
  }

  private async getActiveSubscriptions(executor: OutboxWriter): Promise<WebhookSubscription[]> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.subscriptions;
    const subscriptions = await executor.query.webhookSubscriptions.findMany({ where: eq(schema.webhookSubscriptions.isActive, true) });
    this.cache = { subscriptions, expiresAt: Date.now() + SUBSCRIPTION_CACHE_TTL_MS };
    return subscriptions;
  }

  async fanOut(event: AuditEvent, executor: OutboxWriter = this.db): Promise<void> {
    const subscriptions = await this.getActiveSubscriptions(executor);
    const matching = subscriptions.filter(subscription => this.matches(subscription, event.action));
    if (matching.length === 0) return;

    const payload = JSON.stringify({
      id: event.id,
      type: event.action,
      occurredAt: event.occurredAt.toISOString(),
      organisationId: event.organisationId,
      actorType: event.actorType,
      actorId: event.actorId,
      targetType: event.targetType,
      targetId: event.targetId,
      outcome: event.outcome,
    });
    for (const subscription of matching) {
      await executor
        .insert(schema.webhookDeliveries)
        .values({ subscriptionId: subscription.id, eventId: event.id, eventType: event.action, payload })
        .onConflictDoNothing({ target: [schema.webhookDeliveries.subscriptionId, schema.webhookDeliveries.eventId] });
    }
  }
}
