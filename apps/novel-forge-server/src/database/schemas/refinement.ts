/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, index, integer, pgEnum, pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { jsonb } from './jsonb';
import { projects } from './projects';

/**
 * Defining types
 */

export namespace Refinement {
  export type ChatSession = InferSelectModel<typeof chatSessions>;
  export type ChatMessage = InferSelectModel<typeof chatMessages>;
  export type Proposal = InferSelectModel<typeof refinementProposals>;
  export type ChatScope = InferEnum<typeof chatScope>;
  export type ChatSessionStatus = InferEnum<typeof chatSessionStatus>;
  export type ChatMessageRole = InferEnum<typeof chatMessageRole>;
  export type Kind = InferEnum<typeof refinementKind>;
  export type ProposalStatus = InferEnum<typeof refinementProposalStatus>;
}

/**
 * Declaring the constants
 */

export const chatScope = pgEnum('chat_scope', ['novel', 'bible_document', 'volume_plan', 'volume', 'arc_plan', 'arc', 'brief']);
export const chatSessionStatus = pgEnum('chat_session_status', ['active', 'archived']);
export const chatMessageRole = pgEnum('chat_message_role', ['user', 'assistant']);
export const refinementKind = pgEnum('refinement_kind', ['chat', 'premise_enhance', 'bible_audit', 'arc_plan', 'chapter_extract']);
export const refinementProposalStatus = pgEnum('refinement_proposal_status', ['pending', 'applied', 'discarded', 'superseded', 'conflicted']);

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
    // Per-session model override (null → the project/profile default). Lets one chat run on a different
    // provider/model without changing the project defaults; new sessions inherit the default.
    modelProvider: varchar('model_provider'),
    modelId: varchar('model_id'),
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
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [unique('chat_messages_session_id_ordinal_unique').on(t.sessionId, t.ordinal)],
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
    model: varchar('model'),
    runId: varchar('run_id'),
    appliedAt: timestamp('applied_at'),
    error: jsonb('error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [
    index('refinement_proposals_project_id_status_idx').on(t.projectId, t.status),
    index('refinement_proposals_session_id_idx').on(t.sessionId),
    index('refinement_proposals_project_id_scope_status_idx').on(t.projectId, t.scopeType, t.scopeRef, t.status),
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
