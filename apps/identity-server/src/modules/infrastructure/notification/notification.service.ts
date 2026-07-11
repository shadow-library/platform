/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { and, asc, eq, inArray, lte } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { DatabaseService, NotificationOutbox, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

import { NotificationClient, SendNotification } from './notification.client';

/**
 * Defining types
 */

type OutboxWriter = Pick<PrimaryDatabase, 'insert'>;

/**
 * Declaring the constants
 */
const MAX_ATTEMPTS = 5;
const CLAIMABLE_STATUSES: NotificationOutbox.Status[] = ['PENDING', 'FAILED'];

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

  /**
   * Queues a notification. Pass the surrounding transaction to persist it atomically with the
   * domain change that triggered it; delivery happens later via the outbox.
   */
  async enqueue(notification: SendNotification, executor: OutboxWriter = this.db): Promise<void> {
    await executor.insert(schema.notificationOutbox).values({ templateKey: notification.templateKey, recipients: notification.recipients, payload: notification.payload ?? null });
  }

  /** Claims a batch of due notifications, sends them, and records the outcome. Worker-driven. */
  async dispatchPending(limit = 20): Promise<number> {
    const claimed = await this.db.transaction(async tx => {
      const rows = await tx
        .select()
        .from(schema.notificationOutbox)
        .where(and(inArray(schema.notificationOutbox.status, CLAIMABLE_STATUSES), lte(schema.notificationOutbox.nextAttemptAt, new Date())))
        .orderBy(asc(schema.notificationOutbox.nextAttemptAt))
        .limit(limit)
        .for('update', { skipLocked: true });
      if (rows.length === 0) return [];
      await tx
        .update(schema.notificationOutbox)
        .set({ status: 'SENDING' })
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
        await this.db.update(schema.notificationOutbox).set({ status: 'SENT', sentAt: new Date() }).where(eq(schema.notificationOutbox.id, row.id));
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
      .set({ status: dead ? 'DEAD' : 'FAILED', attemptCount, lastError: message, nextAttemptAt: new Date(Date.now() + backoffMinutes * 60_000) })
      .where(eq(schema.notificationOutbox.id, row.id));
    this.logger[dead ? 'error' : 'warn'](`Notification ${dead ? 'dead-lettered' : 'delivery failed'}`, { id: row.id, attemptCount, message });
  }
}
