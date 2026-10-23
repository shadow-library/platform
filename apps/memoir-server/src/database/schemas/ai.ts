import { type InferEnum, type InferSelectModel, sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, index, pgEnum, pgTable, smallint, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

import { sensitive } from '../sensitivity';
import { accounts } from './accounts';
import { jsonb } from './jsonb';
import { quests } from './quests';

export namespace AiTask {
  export type Row = InferSelectModel<typeof aiTasks>;
  export type Status = InferEnum<typeof aiTaskStatus>;
  export type Kind = InferEnum<typeof aiTaskKind>;
}

export namespace AiResult {
  export type Row = InferSelectModel<typeof aiResults>;
}

export namespace AiScheduledQuery {
  export type Row = InferSelectModel<typeof aiScheduledQueries>;
}

export namespace AiConsent {
  export type Row = InferSelectModel<typeof aiConsents>;
  export type DataClass = InferEnum<typeof aiConsentDataClass>;
}

export namespace AppliedSuggestion {
  export type Row = InferSelectModel<typeof appliedSuggestions>;
}

export namespace AiTaskAudit {
  export type Row = InferSelectModel<typeof aiTaskAudit>;
  export type Action = InferEnum<typeof aiTaskAuditAction>;
}

export const aiTaskStatus = pgEnum('ai_task_status', ['pending', 'running', 'done', 'failed', 'cancelled', 'held_upgrade']);
export const aiTaskKind = pgEnum('ai_task_kind', ['adhoc', 'scheduled']);
export const aiConsentDataClass = pgEnum('ai_consent_data_class', ['journal_reflection_reason', 'health']);
export const aiTaskAuditAction = pgEnum('ai_task_audit_action', ['claimed', 'read_scope', 'finished', 'refunded']);

/**
 * The client-written request, not an authorization: the worker re-validates entitlement, quota and consent at claim time.
 * `id` is client-minted so a duplicate tap converges on `ON CONFLICT DO NOTHING` instead of double-charging quota; `quota_month` is null for
 * scheduled runs, which never consume ad-hoc quota.
 */
export const aiTasks = pgTable(
  'ai_tasks',
  {
    id: uuid('id').primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    queryText: text('query_text').notNull(),
    status: aiTaskStatus('status').notNull().default('pending'),
    kind: aiTaskKind('kind').notNull().default('adhoc'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    expectedBy: timestamp('expected_by', { withTimezone: true }).notNull(),
    quotaMonth: varchar('quota_month', { length: 7 }),
    quotaConsumed: boolean('quota_consumed').notNull().default(false),
    claimedBy: varchar('claimed_by', { length: 64 }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    error: varchar('error', { length: 500 }),
    syncSeq: bigint('sync_seq', { mode: 'bigint' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
  },
  t => [
    index('ai_tasks_status_submitted_at_idx').on(t.status, t.submittedAt),
    index('ai_tasks_account_id_quota_month_idx')
      .on(t.accountId, t.quotaMonth)
      .where(sql`${t.quotaConsumed}`),
    index('ai_tasks_account_id_sync_seq_idx').on(t.accountId, t.syncSeq),
  ],
);

/** Append-only, worker-written only. `task_id` is unique rather than the primary key so the table is shaped like the other bigserial-keyed ones. */
export const aiResults = pgTable(
  'ai_results',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => aiTasks.id),
    answer: text('answer').notNull(),
    patterns: jsonb('patterns').notNull().default([]),
    suggestions: jsonb('suggestions').notNull().default([]),
    citations: jsonb('citations').notNull().default([]),
    limitationNote: text('limitation_note'),
    modelId: varchar('model_id', { length: 64 }).notNull(),
    promptVersion: varchar('prompt_version', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    syncSeq: bigint('sync_seq', { mode: 'bigint' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
  },
  t => [unique('ai_results_task_id_unique').on(t.taskId), index('ai_results_account_id_sync_seq_idx').on(t.accountId, t.syncSeq)],
);

/** One standing question per account, paid-only; the worker materializes it nightly into an `ai_tasks(kind='scheduled')` row. */
export const aiScheduledQueries = pgTable('ai_scheduled_queries', {
  accountId: bigint('account_id', { mode: 'bigint' })
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  queryText: text('query_text').notNull(),
  active: boolean('active').notNull().default(true),
  syncSeq: bigint('sync_seq', { mode: 'bigint' })
    .notNull()
    .default(sql`nextval('sync_seq')`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Current state is `withdrawn_at IS NULL`; a re-grant after withdrawal upserts the same row, so only the latest transition is kept, not a ledger. */
export const aiConsents = pgTable(
  'ai_consents',
  {
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    dataClass: aiConsentDataClass('data_class').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    syncSeq: bigint('sync_seq', { mode: 'bigint' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
  },
  t => [unique('ai_consents_account_id_data_class_unique').on(t.accountId, t.dataClass)],
);

/**
 * Append-only. Powers the 14-day before/after adherence metric: the AI path never mutates the quest, the user confirms a separate `EditQuest`,
 * and this row only records that the offer was taken.
 */
export const appliedSuggestions = pgTable(
  'applied_suggestions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    resultId: bigint('result_id', { mode: 'bigint' })
      .notNull()
      .references(() => aiResults.id),
    suggestionIndex: smallint('suggestion_index').notNull(),
    questId: bigint('quest_id', { mode: 'bigint' })
      .notNull()
      .references(() => quests.id),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
    questSnapshotBefore: jsonb('quest_snapshot_before').notNull(),
  },
  t => [unique('applied_suggestions_result_id_suggestion_index_unique').on(t.resultId, t.suggestionIndex)],
);

/** Append-only, worker-written only: read-scope summary as data-class names and row counts, never content. */
export const aiTaskAudit = pgTable('ai_task_audit', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'bigint' })
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id')
    .notNull()
    .references(() => aiTasks.id),
  action: aiTaskAuditAction('action').notNull(),
  dataClasses: text('data_classes').array(),
  rowCounts: jsonb('row_counts'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

sensitive(aiTasks.queryText, 'most-sensitive');
