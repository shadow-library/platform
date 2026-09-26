import { InferEnum, InferSelectModel, relations, sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, index, integer, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { jsonb } from './jsonb';
import { contentMode, costTier, projects } from './projects';

export namespace Refinement {
  export type ChatSession = InferSelectModel<typeof chatSessions>;
  export type ChatMessage = InferSelectModel<typeof chatMessages>;
  export type Proposal = InferSelectModel<typeof refinementProposals>;
  export type ChatScope = InferEnum<typeof chatScope>;
  export type ChatSessionStatus = InferEnum<typeof chatSessionStatus>;
  export type ChatMode = InferEnum<typeof chatMode>;
  export type Kind = InferEnum<typeof refinementKind>;
  export type ProposalStatus = InferEnum<typeof refinementProposalStatus>;
}

export const chatScope = pgEnum('chat_scope', ['project', 'novel', 'bible_document', 'volume', 'brief']);
export const chatSessionStatus = pgEnum('chat_session_status', ['active', 'archived']);
export const chatMessageRole = pgEnum('chat_message_role', ['user', 'assistant']);
export const chatMode = pgEnum('chat_mode', ['manual', 'auto']);
export const refinementKind = pgEnum('refinement_kind', ['chat', 'hub', 'premise_enhance', 'bible_audit', 'chapter_extract', 'plugin', 'chapter_plan', 'organise']);
export const refinementProposalStatus = pgEnum('refinement_proposal_status', ['pending', 'applied', 'discarded', 'superseded', 'conflicted', 'reverted']);

export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    scopeType: chatScope('scope_type').notNull(),
    scopeRef: varchar('scope_ref'),
    title: varchar('title', { length: 500 }),
    status: chatSessionStatus('status').notNull().default('active'),
    // How this session lands its change-sets: 'auto' applies the author's quoted words in-turn under the quote rule and stages the
    // rest as cards; 'manual' stages everything as cards. ChatService.createSession sets 'auto' for a new chat — this column default
    // stays 'manual' only so no migration is needed. Provenance lives on each proposal (autoApplied).
    mode: chatMode('mode').notNull().default('manual'),
    // Per-session model override (null → the project/profile default). Lets one chat run on a different
    // provider/model without changing the project defaults; new sessions inherit the default.
    modelProvider: varchar('model_provider'),
    modelId: varchar('model_id'),
    contentMode: contentMode('content_mode'),
    costTier: costTier('cost_tier'),
    /** The last `job_events.seq` handed out in this session; taken under the row lock, so the cursor follows commit order. */
    jobEventSeq: integer('job_event_seq').notNull().default(0),
    summary: text('summary'),
    summaryThroughOrdinal: integer('summary_through_ordinal').notNull().default(0),
    lastTurnAt: timestamp('last_turn_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [index('chat_sessions_project_id_status_idx').on(t.projectId, t.status), index('chat_sessions_project_id_scope_idx').on(t.projectId, t.scopeType, t.scopeRef)],
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    role: chatMessageRole('role').notNull(),
    content: text('content').notNull(),
    // Loose key to refinement_proposals: the proposal row is written in the same transaction as the
    // message it belongs to, and a FK here would be circular with refinement_proposals.message_id.
    proposalId: bigint('proposal_id', { mode: 'bigint' }),
    runId: varchar('run_id'),
    // The resolved provider/model that produced an assistant message (null on user messages), so the
    // transcript can attribute every reply even after the session's override or the defaults change.
    modelProvider: varchar('model_provider'),
    modelId: varchar('model_id'),
    tokens: integer('tokens'),
    appliedProposalId: bigint('applied_proposal_id', { mode: 'bigint' }).references(() => refinementProposals.id, { onDelete: 'set null' }),
    suggestions: jsonb('suggestions').$type<string[]>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [unique('chat_messages_session_id_ordinal_unique').on(t.sessionId, t.ordinal), index('chat_messages_applied_proposal_id_idx').on(t.appliedProposalId)],
);

export const refinementProposals = pgTable(
  'refinement_proposals',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => chatSessions.id, { onDelete: 'set null' }),
    messageId: bigint('message_id', { mode: 'bigint' }),
    scopeType: chatScope('scope_type').notNull(),
    scopeRef: varchar('scope_ref'),
    kind: refinementKind('kind').notNull(),
    status: refinementProposalStatus('status').notNull().default('pending'),
    summary: text('summary'),
    changeSet: jsonb('change_set').notNull(),
    baseline: jsonb('baseline').notNull(),
    // True when an auto-mode chat turn applied this proposal in the same request — provenance for the
    // change history; manual applies (even of auto-session proposals after a conflict) stay false.
    autoApplied: boolean('auto_applied').notNull().default(false),
    // Per-op dispositions recorded at apply time: [{ index, status: applied|declined|failed, error?, result? }].
    // Cherry-picked declines and post-commit action outcomes both land here.
    opResults: jsonb('op_results'),
    // The ChangeOp[] that undoes the applied content ops (reverse order) and the artifact states right
    // after apply — together they make the proposal revertible under a strict conflict guard.
    inverseOps: jsonb('inverse_ops'),
    postState: jsonb('post_state'),
    model: varchar('model'),
    runId: varchar('run_id'),
    appliedAt: timestamp('applied_at'),
    revertedAt: timestamp('reverted_at'),
    error: jsonb('error').$type<Record<string, unknown>>(),
    // Deterministic review findings on AI-authored text (e.g. a removal written as "no X"), shown beside the change-set.
    warnings: jsonb('warnings').$type<string[]>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [
    index('refinement_proposals_project_id_status_idx').on(t.projectId, t.status),
    index('refinement_proposals_session_id_idx').on(t.sessionId),
    index('refinement_proposals_project_id_scope_status_idx').on(t.projectId, t.scopeType, t.scopeRef, t.status),
    // A job's run stages one card: a second attempt racing the first on the same run conflicts instead of staging a duplicate.
    uniqueIndex('refinement_proposals_job_card_run_id_unique')
      .on(t.runId)
      .where(sql`${t.kind} in ('organise', 'chapter_plan')`),
  ],
);

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  project: one(projects, { fields: [chatSessions.projectId], references: [projects.id] }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, { fields: [chatMessages.sessionId], references: [chatSessions.id] }),
}));

export const refinementProposalsRelations = relations(refinementProposals, ({ one }) => ({
  project: one(projects, { fields: [refinementProposals.projectId], references: [projects.id] }),
  session: one(chatSessions, { fields: [refinementProposals.sessionId], references: [chatSessions.id] }),
}));
