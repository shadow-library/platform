import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  customType,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { drafts } from './generation';
import { jsonb } from './jsonb';
import { contentMode, costTier, projects } from './projects';

/** One message as the model router sent it — the exact role and content of a `BaseMessage`, never re-derived. */
export interface WriterSnapshotMessage {
  role: string;
  content: string;
}

export interface WriterSnapshotModelRoute {
  provider: string;
  model: string;
}

export namespace Ai {
  export type WorkflowRun = InferSelectModel<typeof workflowRuns>;
  export type ModelCall = InferSelectModel<typeof modelCalls>;
  export type ToolCall = InferSelectModel<typeof toolCalls>;
  export type ContextPack = InferSelectModel<typeof contextPacks>;
  export type DraftRevision = InferSelectModel<typeof draftRevisions>;
  export type UserFeedback = InferSelectModel<typeof userFeedback>;
  export type LlmCache = InferSelectModel<typeof llmCache>;
  export type LoreChunk = InferSelectModel<typeof loreChunks>;
  export type WriterSnapshot = InferSelectModel<typeof writerSnapshots>;
  export type WorkflowRunStatus = InferEnum<typeof workflowRunStatus>;
  export type ModelCallStatus = InferEnum<typeof modelCallStatus>;
  export type ToolCallStatus = InferEnum<typeof toolCallStatus>;
  export type DraftRevisionSource = InferEnum<typeof draftRevisionSource>;
  export type UserFeedbackArtifactType = InferEnum<typeof userFeedbackArtifactType>;
  export type UserFeedbackDisposition = InferEnum<typeof userFeedbackDisposition>;
  export type CostSource = InferEnum<typeof costSource>;
  export type WriterAttemptRole = InferEnum<typeof writerAttemptRole>;
}

const EMBEDDING_DIM = 1024;

function vectorType(dimensions: number) {
  return customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(',')}]`;
    },
    fromDriver(value: string): number[] {
      return value.slice(1, -1).split(',').map(Number);
    },
  });
}

export const workflowRunStatus = pgEnum('workflow_run_status', ['running', 'completed', 'awaiting_review', 'failed', 'cancelled']);
export const modelCallStatus = pgEnum('model_call_status', ['ok', 'parse_error', 'repaired', 'refused', 'transport_error', 'timeout']);
export const toolCallStatus = pgEnum('tool_call_status', ['ok', 'invalid_args', 'handler_error', 'budget_exceeded']);
export const draftRevisionSource = pgEnum('draft_revision_source', ['generated', 'patched', 'rewritten', 'revised', 'imported', 'hand_edited', 'chat_edited', 'amended']);
export const userFeedbackArtifactType = pgEnum('user_feedback_artifact_type', [
  'draft',
  'continuity_proposal',
  'volume',
  'bible_document',
  'validation_report',
  'refinement_proposal',
]);
export const costSource = pgEnum('cost_source', ['provider', 'gateway', 'estimate']);
export const userFeedbackDisposition = pgEnum('user_feedback_disposition', ['revision_requested', 'approved', 'rejected', 'comment']);
export const writerAttemptRole = pgEnum('writer_attempt_role', ['draft', 'repair', 'rewrite', 'revise']);

export const workflowRuns = pgTable(
  'workflow_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    jobId: varchar('job_id'),
    graph: varchar('graph').notNull(),
    target: varchar('target').notNull(),
    status: workflowRunStatus('status').notNull().default('running'),
    outcome: varchar('outcome'),
    input: jsonb('input').$type<Record<string, unknown>>(),
    error: jsonb('error').$type<Record<string, unknown>>(),
    nodeTrace: jsonb('node_trace').$type<string[]>(),
    contextPackId: bigint('context_pack_id', { mode: 'bigint' }),
    // The chat turn a chat-title or chat-compact run belongs to; null for every other graph.
    parentRunId: uuid('parent_run_id').references((): AnyPgColumn => workflowRuns.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    endedAt: timestamp('ended_at'),
  },
  t => [
    index('workflow_runs_project_id_graph_status_idx').on(t.projectId, t.graph, t.status),
    index('workflow_runs_job_id_idx').on(t.jobId),
    index('workflow_runs_parent_run_id_idx').on(t.parentRunId),
  ],
);

export const modelCalls = pgTable(
  'model_calls',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    runId: varchar('run_id'),
    node: varchar('node'),
    role: varchar('role').notNull(),
    provider: varchar('provider').notNull(),
    model: varchar('model').notNull(),
    promptKey: varchar('prompt_key').notNull(),
    promptVersion: varchar('prompt_version').notNull(),
    status: modelCallStatus('status').notNull(),
    inputTokens: integer('input_tokens'),
    cachedInputTokens: integer('cached_input_tokens'),
    outputTokens: integer('output_tokens'),
    latencyMs: integer('latency_ms'),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }),
    costSource: costSource('cost_source'),
    tier: costTier('tier'),
    contentMode: contentMode('content_mode'),
    // Null both when the call sent no reasoning field and on rows written before effort was recorded.
    reasoningEffort: varchar('reasoning_effort'),
    attempt: smallint('attempt').notNull().default(0),
    rawOutput: text('raw_output'),
    error: jsonb('error').$type<Record<string, unknown>>(),
    // Null on every plugin-free call, which is what keeps the pre-host rows and the pre-host generate path identical.
    plugins: jsonb('plugins').$type<{ id: string; version: string; configHash: string }[]>(),
    policyDigest: varchar('policy_digest'),
    // The chapter this call was made on behalf of; null for a call with no single chapter (chat, bible-builder, …) or predating this column.
    chapter: integer('chapter'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [
    index('model_calls_project_id_created_at_idx').on(t.projectId, t.createdAt),
    index('model_calls_run_id_idx').on(t.runId),
    index('model_calls_prompt_key_prompt_version_idx').on(t.promptKey, t.promptVersion),
    index('model_calls_project_id_chapter_idx').on(t.projectId, t.chapter),
  ],
);

export const toolCalls = pgTable(
  'tool_calls',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    runId: varchar('run_id').notNull(),
    modelCallId: bigint('model_call_id', { mode: 'bigint' }),
    node: varchar('node').notNull(),
    tool: varchar('tool').notNull(),
    args: jsonb('args').$type<Record<string, unknown>>(),
    resultDigest: varchar('result_digest'),
    status: toolCallStatus('status').notNull(),
    latencyMs: integer('latency_ms'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [index('tool_calls_run_id_idx').on(t.runId)],
);

export const contextPacks = pgTable(
  'context_packs',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    purpose: varchar('purpose').notNull(),
    chapter: integer('chapter'),
    hash: varchar('hash').notNull(),
    budgetTokens: integer('budget_tokens'),
    usedTokens: integer('used_tokens'),
    sections: jsonb('sections'),
    unresolvedRefs: jsonb('unresolved_refs'),
    omitted: jsonb('omitted'),
    rendered: text('rendered'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [unique('context_packs_project_id_hash_unique').on(t.projectId, t.hash)],
);

// One row per writer attempt (draft, repair, rewrite, revise): the exact messages the model router sent, captured at the
// router call boundary rather than reassembled later, so a later Story Bible or brief edit can never change what a row says
// the writer read. Retention keeps every attempt for a chapter's current `draftRevision` plus its `RETAINED_PRIOR_REVISIONS`
// (writer-snapshot.service.ts) earlier revisions; older revisions are pruned as newer attempts land, never by finalize or approve.
export const writerSnapshots = pgTable(
  'writer_snapshots',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    chapter: integer('chapter').notNull(),
    draftRevision: integer('draft_revision').notNull(),
    attempt: integer('attempt').notNull(),
    role: writerAttemptRole('role').notNull(),
    contextPackId: bigint('context_pack_id', { mode: 'bigint' }),
    messages: jsonb('messages').$type<WriterSnapshotMessage[]>().notNull(),
    // What the disclosure policy withheld (counts by field — never the withheld text) and what the context pack cut for
    // budget, so the record shows what was kept back and why without smuggling a locked fact's truth into a diagnostic.
    keptBack: jsonb('kept_back').$type<Record<string, unknown>>(),
    planRevision: integer('plan_revision'),
    bibleHash: varchar('bible_hash'),
    promptKey: varchar('prompt_key').notNull(),
    promptVersion: varchar('prompt_version').notNull(),
    modelRoute: jsonb('model_route').$type<WriterSnapshotModelRoute>().notNull(),
    // Captured at attempt time, independent of the draft's current `isolated` flag, so a Writer's view read of an old
    // snapshot walls off its prose exactly as the isolation read policy required when the attempt was made.
    isolated: boolean('isolated').notNull().default(false),
    runId: varchar('run_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [
    index('writer_snapshots_project_id_chapter_idx').on(t.projectId, t.chapter),
    index('writer_snapshots_project_id_chapter_draft_revision_idx').on(t.projectId, t.chapter, t.draftRevision),
  ],
);

export const draftRevisions = pgTable(
  'draft_revisions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    draftId: bigint('draft_id', { mode: 'bigint' })
      .notNull()
      .references(() => drafts.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    source: draftRevisionSource('source').notNull(),
    body: text('body').notNull(),
    summary: text('summary'),
    state: jsonb('state').$type<Record<string, unknown>>(),
    runId: varchar('run_id'),
    feedbackId: bigint('feedback_id', { mode: 'bigint' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [unique('draft_revisions_draft_id_revision_unique').on(t.draftId, t.revision)],
);

export const userFeedback = pgTable(
  'user_feedback',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    artifactType: userFeedbackArtifactType('artifact_type').notNull(),
    artifactRef: varchar('artifact_ref').notNull(),
    disposition: userFeedbackDisposition('disposition').notNull(),
    reviewerId: varchar('reviewer_id'),
    idempotencyKey: varchar('idempotency_key'),
    note: text('note'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [
    index('user_feedback_project_id_artifact_type_artifact_ref_idx').on(t.projectId, t.artifactType, t.artifactRef),
    unique('user_feedback_idempotency_key_unique').on(t.idempotencyKey),
  ],
);

export const llmCache = pgTable(
  'llm_cache',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    role: varchar('role').notNull(),
    promptKey: varchar('prompt_key').notNull(),
    promptVersion: varchar('prompt_version').notNull(),
    provider: varchar('provider').notNull(),
    model: varchar('model').notNull(),
    // sha256 of provider|model|promptKey|promptVersion|serialized-input (input carries the context pack text).
    requestHash: varchar('request_hash').notNull(),
    response: text('response').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [unique('llm_cache_request_hash_unique').on(t.requestHash), index('llm_cache_project_id_role_idx').on(t.projectId, t.role)],
);

export const loreChunks = pgTable(
  'lore_chunks',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: varchar('kind').notNull(),
    refKey: varchar('ref_key').notNull(),
    sourceUpdatedAt: timestamp('source_updated_at').notNull(),
    text: text('text').notNull(),
    embedding: vectorType(EMBEDDING_DIM)('embedding'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [
    unique('lore_chunks_project_id_kind_ref_key_unique').on(t.projectId, t.kind, t.refKey),
    index('lore_chunks_project_id_kind_idx').on(t.projectId, t.kind),
    index('lore_chunks_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
);

export const workflowRunsRelations = relations(workflowRuns, ({ one }) => ({
  project: one(projects, { fields: [workflowRuns.projectId], references: [projects.id] }),
}));

export const modelCallsRelations = relations(modelCalls, ({ one }) => ({
  project: one(projects, { fields: [modelCalls.projectId], references: [projects.id] }),
}));

export const contextPacksRelations = relations(contextPacks, ({ one }) => ({
  project: one(projects, { fields: [contextPacks.projectId], references: [projects.id] }),
}));

export const writerSnapshotsRelations = relations(writerSnapshots, ({ one }) => ({
  project: one(projects, { fields: [writerSnapshots.projectId], references: [projects.id] }),
}));

export const draftRevisionsRelations = relations(draftRevisions, ({ one }) => ({
  project: one(projects, { fields: [draftRevisions.projectId], references: [projects.id] }),
  draft: one(drafts, { fields: [draftRevisions.draftId], references: [drafts.id] }),
}));

export const userFeedbackRelations = relations(userFeedback, ({ one }) => ({
  project: one(projects, { fields: [userFeedback.projectId], references: [projects.id] }),
}));

export const loreChunksRelations = relations(loreChunks, ({ one }) => ({
  project: one(projects, { fields: [loreChunks.projectId], references: [projects.id] }),
}));

export const llmCacheRelations = relations(llmCache, ({ one }) => ({
  project: one(projects, { fields: [llmCache.projectId], references: [projects.id] }),
}));
