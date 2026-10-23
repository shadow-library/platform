import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { claimLeaseFor, DatabaseService, NotificationOutbox, PrimaryDatabase, recoverExpiredClaims, schema } from '@server/modules/infrastructure/datastore';

import { NOTIFICATION_SEND_TIMEOUT_MS, NotificationClient, SendNotification } from './notification.client';

type OutboxWriter = Pick<PrimaryDatabase, 'insert'>;

const MAX_ATTEMPTS = 5;
const DISPATCH_BATCH_SIZE = 20;
export const NOTIFICATION_CLAIM_LEASE_MS = claimLeaseFor(DISPATCH_BATCH_SIZE, NOTIFICATION_SEND_TIMEOUT_MS);
const CLAIMABLE_STATUSES: NotificationOutbox.Status[] = ['PENDING', 'FAILED'];
/** Each row binds 3 parameters; Postgres caps a statement at 65535, so this stays well clear of that ceiling. */
const ENQUEUE_CHUNK_SIZE = 1000;

@Injectable()
export class NotificationService {
  private readonly logger = Logger.getLogger(APP_NAME, NotificationService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly client: NotificationClient,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  async enqueue(notification: SendNotification, executor: OutboxWriter = this.db): Promise<void> {
    await this.enqueueMany([notification], executor);
  }

  /** Chunks at {@link ENQUEUE_CHUNK_SIZE} rows per statement; every chunk runs against the same `executor`, so a caller-held transaction still commits or rolls back as one unit. */
  async enqueueMany(notifications: SendNotification[], executor: OutboxWriter = this.db): Promise<void> {
    for (let offset = 0; offset < notifications.length; offset += ENQUEUE_CHUNK_SIZE) {
      const chunk = notifications.slice(offset, offset + ENQUEUE_CHUNK_SIZE);
      await executor
        .insert(schema.notificationOutbox)
        .values(chunk.map(notification => ({ templateKey: notification.templateKey, recipients: notification.recipients, payload: notification.payload ?? null })));
    }
  }

  async recoverExpiredClaims(): Promise<number> {
    const recovered = await recoverExpiredClaims(this.db, schema.notificationOutbox, NOTIFICATION_CLAIM_LEASE_MS);
    if (recovered > 0) this.logger.warn('Recovered notification deliveries whose claim lease expired', { count: recovered });
    return recovered;
  }

  async dispatchPending(limit = DISPATCH_BATCH_SIZE): Promise<number> {
    const claimed = await this.db.transaction(async tx => {
      const rows = await tx
        .select()
        .from(schema.notificationOutbox)
        .where(and(inArray(schema.notificationOutbox.status, CLAIMABLE_STATUSES), lte(schema.notificationOutbox.nextAttemptAt, sql`now()`)))
        .orderBy(asc(schema.notificationOutbox.nextAttemptAt))
        .limit(limit)
        .for('update', { skipLocked: true });
      if (rows.length === 0) return [];
      await tx
        .update(schema.notificationOutbox)
        .set({ status: 'SENDING', claimedAt: sql`now()` })
        .where(
          inArray(
            schema.notificationOutbox.id,
            rows.map(row => row.id),
          ),
        );
      return rows;
    });

    let sent = 0;
    for (const row of claimed) {
      try {
        await this.client.send({ templateKey: row.templateKey, recipients: row.recipients, payload: row.payload });
        await this.db.update(schema.notificationOutbox).set({ status: 'SENT', claimedAt: null, sentAt: new Date() }).where(eq(schema.notificationOutbox.id, row.id));
        sent += 1;
      } catch (error) {
        await this.markFailed(row, error);
      }
    }
    return sent;
  }

  private async markFailed(row: NotificationOutbox, error: unknown): Promise<void> {
    const attemptCount = row.attemptCount + 1;
    const dead = attemptCount >= MAX_ATTEMPTS;
    const backoffMinutes = Math.min(2 ** attemptCount, 60);
    const message = error instanceof Error ? error.message : String(error);
    await this.db
      .update(schema.notificationOutbox)
      .set({ status: dead ? 'DEAD' : 'FAILED', claimedAt: null, attemptCount, lastError: message, nextAttemptAt: new Date(Date.now() + backoffMinutes * 60_000) })
      .where(eq(schema.notificationOutbox.id, row.id));
    this.logger[dead ? 'error' : 'warn'](`Notification ${dead ? 'dead-lettered' : 'delivery failed'}`, { id: row.id, attemptCount, message });
  }
}
