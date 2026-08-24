import { type InferEnum, type InferSelectModel } from 'drizzle-orm';
import { bigint, index, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { accounts } from './accounts';

export namespace ExportJob {
  export type Row = InferSelectModel<typeof exportJobs>;
  export type Status = InferEnum<typeof exportJobStatus>;
}

export const exportJobStatus = pgEnum('export_job_status', ['pending', 'running', 'done', 'failed']);

/**
 * ARCHITECTURE §20: one row per `RequestExport` call, claimed and assembled by the export sweep. Not a
 * synced table — the client polls `GET /account/export/:id` directly rather than pulling this through
 * the delta protocol. `objectKey` is the `memoir-receipts` bucket key the assembled JSON lands at
 * (`exports/{account_id}/{id}.json`); `expiresAt` is set only once the job reaches `done` and drives the
 * 7-day cleanup sweep — a `pending`/`running`/`failed` job has nothing to expire.
 */
export const exportJobs = pgTable(
  'export_jobs',
  {
    id: uuid('id').primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    status: exportJobStatus('status').notNull().default('pending'),
    objectKey: varchar('object_key', { length: 200 }),
    error: varchar('error', { length: 500 }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  t => [
    index('export_jobs_account_id_requested_at_idx').on(t.accountId, t.requestedAt),
    index('export_jobs_status_idx').on(t.status),
    index('export_jobs_expires_at_idx').on(t.expiresAt),
  ],
);
