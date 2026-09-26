import { InferEnum, InferInsertModel, InferSelectModel, relations, sql } from 'drizzle-orm';
import { AnyPgColumn, bigint, bigserial, check, index, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import { type Bible } from './bible';
import { jsonb } from './jsonb';
import { projects } from './projects';

export namespace Ledger {
  export type Entry = InferSelectModel<typeof decisionLedgerEntries>;
  export type NewEntry = InferInsertModel<typeof decisionLedgerEntries>;
  export type Kind = InferEnum<typeof ledgerEntryKind>;
  export type DecidedBy = InferEnum<typeof ledgerDecidedBy>;
  export type RejectionScope = InferEnum<typeof ledgerRejectionScope>;
  /** Superseded has a successor row; withdrawn was deactivated by the author with a reason and has none. */
  export type Status = 'active' | 'superseded' | 'withdrawn';

  export interface BibleDocumentLink {
    section: Bible.Section;
    slug: string;
  }

  /**
   * What an entry produced, by the keys the change-set ops address content with, so a revert and re-apply that
   * re-creates a row under a new id leaves the link intact.
   */
  export interface TargetState {
    exists: boolean;
    revision: number | null;
    contentHash: string | null;
  }

  /** What a scoped rejection was recorded against: the active volume for `not_now`, the target records' versions for `not_this_version`. */
  export type RejectionAnchor = { volumeKey: string | null } | { states: Record<string, TargetState> };

  export interface Links {
    bibleDocuments?: BibleDocumentLink[];
    entityKeys?: string[];
    factKeys?: string[];
    volumeKeys?: string[];
    briefChapters?: number[];
  }
}

export const ledgerEntryKind = pgEnum('ledger_entry_kind', ['decision', 'direction', 'rejected', 'backlog', 'system']);
export const ledgerDecidedBy = pgEnum('ledger_decided_by', ['author', 'system']);
export const ledgerRejectionScope = pgEnum('ledger_rejection_scope', ['never', 'not_now', 'not_this_version']);

export const decisionLedgerEntries = pgTable(
  'decision_ledger_entries',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: ledgerEntryKind('kind').notNull(),
    topic: varchar('topic', { length: 100 }).notNull(),
    statement: text('statement').notNull(),
    why: text('why'),
    rejectedAlternatives: jsonb('rejected_alternatives')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    writerLine: text('writer_line'),
    decidedBy: ledgerDecidedBy('decided_by').notNull(),
    stepKey: varchar('step_key', { length: 60 }),
    payload: jsonb('payload'),
    links: jsonb('links')
      .$type<Ledger.Links>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    supersedesId: bigint('supersedes_id', { mode: 'bigint' }).references((): AnyPgColumn => decisionLedgerEntries.id),
    supersededAt: timestamp('superseded_at'),
    withdrawnReason: text('withdrawn_reason'),
    ideaId: varchar('idea_id', { length: 64 }),
    rejectionScope: ledgerRejectionScope('rejection_scope'),
    rejectionAnchor: jsonb('rejection_anchor').$type<Ledger.RejectionAnchor>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [
    unique('decision_ledger_entries_supersedes_id_unique').on(t.supersedesId),
    index('decision_ledger_entries_project_id_active_idx')
      .on(t.projectId, t.createdAt)
      .where(sql`${t.supersededAt} IS NULL`),
    index('decision_ledger_entries_project_id_topic_idx').on(t.projectId, t.topic, t.createdAt),
    uniqueIndex('decision_ledger_entries_project_id_idea_id_idx')
      .on(t.projectId, t.ideaId)
      .where(sql`${t.ideaId} IS NOT NULL AND ${t.supersededAt} IS NULL`),
    check('decision_ledger_entries_withdrawn_check', sql`${t.withdrawnReason} IS NULL OR ${t.supersededAt} IS NOT NULL`),
    check(
      'decision_ledger_entries_rejection_check',
      sql`(${t.ideaId} IS NULL AND ${t.rejectionScope} IS NULL AND ${t.rejectionAnchor} IS NULL) OR (${t.ideaId} IS NOT NULL AND ${t.kind} = 'rejected' AND ${t.rejectionScope} IS NOT NULL AND (${t.rejectionScope} = 'never') = (${t.rejectionAnchor} IS NULL))`,
    ),
  ],
);

export const decisionLedgerEntriesRelations = relations(decisionLedgerEntries, ({ one }) => ({
  project: one(projects, { fields: [decisionLedgerEntries.projectId], references: [projects.id] }),
}));
