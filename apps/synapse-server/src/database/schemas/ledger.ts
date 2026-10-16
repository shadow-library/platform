import { type InferEnum, type InferInsertModel, type InferSelectModel, sql } from 'drizzle-orm';
import { boolean, index, integer, numeric, pgEnum, pgTable, smallint, text, timestamp } from 'drizzle-orm/pg-core';

export namespace Ledger {
  export type Entry = InferSelectModel<typeof ledger>;
  export type NewEntry = InferInsertModel<typeof ledger>;
  export type Status = InferEnum<typeof ledgerStatus>;
}

/** `pending` marks a row admitted before dispatch and not yet settled, so a request that dies mid-flight is never reported as any outcome. */
export const ledgerStatus = pgEnum('ledger_status', ['pending', 'ok', 'error', 'refused', 'cancelled']);

export const ledger = pgTable(
  'ledger',
  {
    requestId: text('request_id').primaryKey(),
    app: text('app').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    task: text('task').notNull(),
    alias: text('alias'),
    model: text('model'),
    provider: text('provider'),
    deploymentId: text('deployment_id'),
    catalogVersion: integer('catalog_version').notNull(),

    status: ledgerStatus('status').notNull(),
    errorCode: text('error_code'),

    inputTokens: integer('input_tokens').notNull().default(0),
    cachedInputTokens: integer('cached_input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    reasoningTokens: integer('reasoning_tokens').notNull().default(0),

    listCostUsd: numeric('list_cost_usd', { precision: 12, scale: 6, mode: 'number' }).notNull().default(0),
    billedCostUsd: numeric('billed_cost_usd', { precision: 12, scale: 6, mode: 'number' }).notNull().default(0),

    latencyMs: integer('latency_ms').notNull().default(0),
    ttftMs: integer('ttft_ms'),
    attempts: smallint('attempts').notNull().default(0),
    effort: text('effort'),
    stream: boolean('stream').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    index('ledger_created_at_idx').on(t.createdAt),
    index('ledger_app_task_created_at_idx').on(t.app, t.task, t.createdAt),
    index('ledger_alias_created_at_idx').on(t.alias, t.createdAt),
    index('ledger_pending_created_at_idx')
      .on(t.createdAt)
      .where(sql`status = 'pending'`),
  ],
);
