/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { KeyProvider } from '@server/modules/auth/keys';
import { AuditEvent, DatabaseService, PrimaryDatabase, WebhookSubscription, schema } from '@server/modules/infrastructure/datastore';

import { WebhookTargetGuard } from './webhook-target.guard';
import { WEBHOOK_ROTATION_OVERLAP_HOURS, WEBHOOK_SECRET_PREFIX } from './webhook.constants';

/**
 * Defining types
 */

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
  /** Plaintext signing secret; shown exactly once. */
  secret: string;
}

interface SerializedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * Declaring the constants
 *
 * Webhook payloads carry identifiers and event metadata only — never the audit `detail` object,
 * addresses, or secrets. Receivers needing more must call back with their own credentials, so a
 * compromised webhook endpoint leaks nothing sensitive. Event filters accept exact audit action
 * names, `prefix.*` patterns, or `*`.
 */
const SUBSCRIPTION_CACHE_TTL_MS = 30_000;

@Injectable()
export class WebhookService {
  private readonly logger = Logger.getLogger(APP_NAME, WebhookService.name);
  private readonly db: PrimaryDatabase;
  private cache: { subscriptions: WebhookSubscription[]; expiresAt: number } | null = null;

  constructor(
    databaseService: DatabaseService,
    private readonly keyProvider: KeyProvider,
    private readonly targetGuard: WebhookTargetGuard,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  private generateSecret(): string {
    return `${WEBHOOK_SECRET_PREFIX}${randomBytes(32).toString('base64url')}`;
  }

  private encryptSecret(secret: string): { ciphertext: string; kekVersion: number } {
    const encrypted = this.keyProvider.encrypt(Buffer.from(secret, 'utf8'));
    const serialized: SerializedSecret = { ciphertext: encrypted.ciphertext, iv: encrypted.iv, authTag: encrypted.authTag };
    return { ciphertext: JSON.stringify(serialized), kekVersion: encrypted.kekVersion };
  }

  private decryptSecret(ciphertext: string, kekVersion: number): string {
    const serialized = JSON.parse(ciphertext) as SerializedSecret;
    return this.keyProvider.decrypt({ ...serialized, kekVersion }).toString('utf8');
  }

  /** The secrets to sign with: always the current one, plus the outgoing one inside its overlap window. */
  signingSecretsOf(subscription: WebhookSubscription): string[] {
    const secrets = [this.decryptSecret(subscription.secretCiphertext, subscription.kekVersion)];
    const overlapValid = subscription.previousSecretExpiresAt && subscription.previousSecretExpiresAt.getTime() > Date.now();
    if (subscription.previousSecretCiphertext && overlapValid) secrets.push(this.decryptSecret(subscription.previousSecretCiphertext, subscription.kekVersion));
    return secrets;
  }

  invalidateCache(): void {
    this.cache = null;
  }

  async create(input: CreateSubscriptionInput): Promise<CreatedSubscription> {
    this.targetGuard.assertAcceptableUrl(input.targetUrl);
    const secret = this.generateSecret();
    const { ciphertext, kekVersion } = this.encryptSecret(secret);
    const [subscription] = await this.db
      .insert(schema.webhookSubscriptions)
      .values({ name: input.name, targetUrl: input.targetUrl, eventTypes: input.eventTypes, secretCiphertext: ciphertext, kekVersion })
      .returning();
    if (!subscription) throw new Error('Failed to create webhook subscription');
    this.invalidateCache();
    this.logger.info('Webhook subscription created', { subscriptionId: subscription.id, targetUrl: input.targetUrl });
    return { subscription, secret };
  }

  async list(): Promise<WebhookSubscription[]> {
    return this.db.query.webhookSubscriptions.findMany();
  }

  async getById(subscriptionId: bigint): Promise<WebhookSubscription> {
    const subscription = await this.db.query.webhookSubscriptions.findFirst({ where: eq(schema.webhookSubscriptions.id, subscriptionId) });
    if (!subscription) throw new ServerError(AppErrorCode.WHK_001);
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
    if (!updated) throw new ServerError(AppErrorCode.WHK_001);
    this.invalidateCache();
    return updated;
  }

  /** Issues a fresh secret; the outgoing one keeps signing alongside it for the overlap window. */
  async rotateSecret(subscriptionId: bigint): Promise<CreatedSubscription> {
    const subscription = await this.getById(subscriptionId);
    const secret = this.generateSecret();
    const { ciphertext, kekVersion } = this.encryptSecret(secret);
    const [updated] = await this.db
      .update(schema.webhookSubscriptions)
      .set({
        secretCiphertext: ciphertext,
        kekVersion,
        previousSecretCiphertext: subscription.secretCiphertext,
        previousSecretExpiresAt: new Date(Date.now() + WEBHOOK_ROTATION_OVERLAP_HOURS * 3_600_000),
        updatedAt: new Date(),
      })
      .where(eq(schema.webhookSubscriptions.id, subscriptionId))
      .returning();
    if (!updated) throw new ServerError(AppErrorCode.WHK_001);
    this.invalidateCache();
    this.logger.info('Webhook secret rotated', { subscriptionId });
    return { subscription: updated, secret };
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

  /**
   * On a cache miss the lookup MUST ride the caller's executor: fan-out runs inside the audit
   * writer's transaction, and a separate pool connection would deadlock a single-connection pool.
   */
  private async getActiveSubscriptions(executor: OutboxWriter): Promise<WebhookSubscription[]> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.subscriptions;
    const subscriptions = await executor.query.webhookSubscriptions.findMany({ where: eq(schema.webhookSubscriptions.isActive, true) });
    this.cache = { subscriptions, expiresAt: Date.now() + SUBSCRIPTION_CACHE_TTL_MS };
    return subscriptions;
  }

  /**
   * Enqueues the audit event for every matching active subscription. Runs inside the audit
   * writer's transaction so an event and its deliveries commit or vanish together; the
   * `(subscription, event)` unique key de-duplicates any replay.
   */
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
