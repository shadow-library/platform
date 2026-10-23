import { eq, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { type NotificationOutbox, type PrimaryDatabase, schema } from '@server/database';

export interface OutboxDraft {
  accountId: bigint;
  category: NotificationOutbox.Category;
  templateKey: string;
  dedupeKey: string;
  variables: Record<string, unknown>;
}

export interface AccountRecipient {
  email: string | null;
  deletionState: string;
}

/** Generous bound on one send, which is otherwise unbounded: memoir sets no `auth.timeout`, so `AuthClient` puts no deadline on the pulse call. */
const CLAIM_LEASE_MINUTES = 30;

const CLAIM_QUERY = sql`(SELECT id FROM notification_outbox WHERE status = 'pending' AND next_attempt_at <= now() ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1)`;

@Injectable()
export class NotificationOutboxRepository {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  /** `ON CONFLICT DO NOTHING` on the `(account, category, dedupe)` unique makes a repeated enqueue for the same fact a no-op rather than a duplicate send. */
  async enqueue(draft: OutboxDraft): Promise<void> {
    await this.db
      .insert(schema.notificationOutbox)
      .values({ accountId: draft.accountId, category: draft.category, templateKey: draft.templateKey, dedupeKey: draft.dedupeKey, variables: draft.variables })
      .onConflictDoNothing({ target: [schema.notificationOutbox.accountId, schema.notificationOutbox.category, schema.notificationOutbox.dedupeKey] });
  }

  /** Leased via `next_attempt_at` instead of a `sending` status, so a crash mid-send retries once the lease lapses. */
  async claimNext(): Promise<NotificationOutbox.Row | null> {
    const [row] = await this.db
      .update(schema.notificationOutbox)
      .set({ attempts: sql`${schema.notificationOutbox.attempts} + 1`, nextAttemptAt: sql`now() + make_interval(mins => ${CLAIM_LEASE_MINUTES}::int)` })
      .where(eq(schema.notificationOutbox.id, CLAIM_QUERY))
      .returning();
    return (row as NotificationOutbox.Row) ?? null;
  }

  async markSent(id: bigint): Promise<void> {
    await this.db.update(schema.notificationOutbox).set({ status: 'sent', sentAt: new Date() }).where(eq(schema.notificationOutbox.id, id));
  }

  async markRetry(id: bigint, nextAttemptAt: Date, lastError: string): Promise<void> {
    await this.db.update(schema.notificationOutbox).set({ status: 'pending', nextAttemptAt, lastError }).where(eq(schema.notificationOutbox.id, id));
  }

  async markFailed(id: bigint, lastError: string): Promise<void> {
    await this.db.update(schema.notificationOutbox).set({ status: 'failed', lastError }).where(eq(schema.notificationOutbox.id, id));
  }

  async accountRecipient(accountId: bigint): Promise<AccountRecipient | null> {
    const [row] = await this.db
      .select({ email: schema.accounts.email, deletionState: schema.accounts.deletionState })
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId));
    return row ?? null;
  }

  async notificationPrefs(accountId: bigint): Promise<Record<string, boolean>> {
    const [row] = await this.db.select({ notificationPrefs: schema.accounts.notificationPrefs }).from(schema.accounts).where(eq(schema.accounts.id, accountId));
    return (row?.notificationPrefs ?? {}) as Record<string, boolean>;
  }
}
