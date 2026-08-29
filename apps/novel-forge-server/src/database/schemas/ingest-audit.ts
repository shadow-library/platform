import { InferSelectModel } from 'drizzle-orm';
import { bigint, bigserial, index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

export namespace IngestAuditLog {
  export type Row = InferSelectModel<typeof ingestAuditLog>;
}

/**
 * Append-only trail of the curated-ingest surface: one row per mutation attempt, rejections included, so a
 * scraper's behaviour can be reconstructed after the fact. It carries no foreign keys — a row must outlive
 * the project it names, and `sourceRef` stays meaningful even when nothing was created.
 */
export const ingestAuditLog = pgTable(
  'ingest_audit_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    apiKeyId: bigint('api_key_id', { mode: 'bigint' }),
    action: varchar('action', { length: 64 }).notNull(),
    sourceRef: varchar('source_ref', { length: 64 }).notNull(),
    projectId: bigint('project_id', { mode: 'bigint' }),
    outcome: varchar('outcome', { length: 32 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [index('ingest_audit_log_source_ref_id_idx').on(t.sourceRef, t.id)],
);
