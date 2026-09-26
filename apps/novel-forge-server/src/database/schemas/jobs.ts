import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, index, integer, pgEnum, pgTable, smallint, text, timestamp, unique, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { workflowRuns } from './ai';
import { jsonb } from './jsonb';
import { projects } from './projects';
import { chatSessions, refinementProposals } from './refinement';

export type BibleAuditGroup = 'add' | 'revise' | 'remove' | 'contradiction';

export interface BibleAuditEvidence {
  /** `doc:<section>/<slug>`, `entity:<key>`, `fact:<key>` or `chapter:<n>` — always something the audit actually read. */
  ref: string;
  /** Copied verbatim from what the audit read of that ref; null when the model's quote was not found there. */
  quote: string | null;
}

export interface BibleAuditFinding {
  /** Stable within its report; a decision addresses a finding by it. */
  id: string;
  group: BibleAuditGroup;
  ref: string;
  text: string;
  evidence: BibleAuditEvidence[];
  /** Indexes into the report's change-set, which its staged proposal carries unchanged. Findings may share an op. */
  opIndexes: number[];
  /** Why the finding carries no card although the audit proposed one. */
  withheld: string | null;
}

export type BibleAuditPass = 'coverage' | 'contradictions';

export interface BibleAuditChecked {
  passes: Record<BibleAuditPass, 'ran' | 'failed'>;
  documents: { count: number; sections: string[]; clipped: number; omitted: number };
  entities: { count: number; byType: Record<string, number>; omitted: number };
  /** Zero when the contradiction pass did not run: only it reads the facts. */
  facts: { count: number; omitted: number };
  /** The finalized chapters whose summaries the contradiction pass compared; null when it compared none. */
  chapters: { from: number; to: number; count: number } | null;
  chaptersWithoutSummary: number[];
  chaptersIsolated: number[];
  chaptersOmitted: number;
  /** The author-facing sentence, e.g. "Checked: 14 pages, 38 characters, 21 facts, chapters 1–12." */
  copy: string;
}

export namespace Job {
  export type Row = InferSelectModel<typeof jobs>;
  export type ValidationReport = InferSelectModel<typeof validationReports>;
  export type Kind = InferEnum<typeof jobKind>;
  export type Status = InferEnum<typeof jobStatus>;
  export type ValidationScope = InferEnum<typeof validationScope>;
  export type AuthoringClaim = InferSelectModel<typeof authoringClaims>;
  export type FindingDecision = InferSelectModel<typeof validationFindingDecisions>;
  export type FindingDecisionKind = InferEnum<typeof validationFindingDecision>;
  export type Event = InferSelectModel<typeof jobEvents>;
  export type EventType = InferEnum<typeof jobEventType>;
}

export const jobKind = pgEnum('job_kind', ['generate', 'finalize', 'backfill', 'publish', 'import', 'organise', 'plan', 'review', 'audit', 'finalize_review']);
export const jobStatus = pgEnum('job_status', ['pending', 'in_progress', 'done', 'failed', 'cancelled']);
export const jobEventType = pgEnum('job_event_type', ['queued', 'started', 'step', 'retrying', 'done', 'failed', 'cancelled']);
export const validationScope = pgEnum('validation_scope', ['novel', 'chapter', 'bible']);
export const validationFindingDecision = pgEnum('validation_finding_decision', ['kept', 'skipped']);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: jobKind('kind').notNull(),
    target: varchar('target').notNull(),
    status: jobStatus('status').notNull().default('pending'),
    attempts: smallint('attempts').notNull().default(0),
    lastError: varchar('last_error', { length: 2000 }),
    payload: jsonb('payload'),
    progress: jsonb('progress'),
    nextAttemptAt: timestamp('next_attempt_at'),
    cancelRequestedAt: timestamp('cancel_requested_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('jobs_project_id_kind_target_unique').on(t.projectId, t.kind, t.target), index('jobs_project_id_kind_status_idx').on(t.projectId, t.kind, t.status)],
);

/** What a job started from a chat did, in order: `seq` is the cursor a reconnecting client replays from. */
export const jobEvents = pgTable(
  'job_events',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    /** The session's cursor: ordered by commit, not by insert. */
    seq: integer('seq').notNull(),
    type: jobEventType('type').notNull(),
    data: jsonb('data'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [unique('job_events_session_id_seq_unique').on(t.sessionId, t.seq), index('job_events_job_id_idx').on(t.jobId), index('job_events_project_id_idx').on(t.projectId)],
);

export const validationReports = pgTable(
  'validation_reports',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    scope: validationScope('scope').notNull(),
    chapter: integer('chapter'),
    issues: integer('issues').notNull(),
    summary: text('summary'),
    payload: jsonb('payload').notNull(),
    // The columns below belong to a Story Bible audit (`scope = 'bible'`); a novel or chapter validation keeps everything in `payload`.
    findings: jsonb('findings').$type<BibleAuditFinding[]>(),
    checked: jsonb('checked').$type<BibleAuditChecked>(),
    runId: uuid('run_id').references(() => workflowRuns.id, { onDelete: 'set null' }),
    proposalId: bigint('proposal_id', { mode: 'bigint' }).references(() => refinementProposals.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [
    index('validation_reports_project_id_scope_chapter_idx').on(t.projectId, t.scope, t.chapter),
    uniqueIndex('validation_reports_run_id_unique').on(t.runId),
    index('validation_reports_proposal_id_idx').on(t.proposalId),
  ],
);

export const validationFindingDecisions = pgTable(
  'validation_finding_decisions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    reportId: bigint('report_id', { mode: 'bigint' })
      .notNull()
      .references(() => validationReports.id, { onDelete: 'cascade' }),
    findingId: varchar('finding_id').notNull(),
    decision: validationFindingDecision('decision').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('validation_finding_decisions_report_id_finding_id_unique').on(t.reportId, t.findingId)],
);

export const authoringClaims = pgTable('authoring_claims', {
  projectId: bigint('project_id', { mode: 'bigint' })
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  // Restrict, not cascade: deleting a job must never silently free a claim another writer could then take while the job still runs.
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'restrict' }),
  kind: jobKind('kind').notNull(),
  /** Fencing token of the holder; every write made under the claim, and its release, is conditioned on it. */
  claimedBy: text('claimed_by'),
  claimedAt: timestamp('claimed_at').notNull().defaultNow(),
  heartbeatAt: timestamp('heartbeat_at').notNull().defaultNow(),
});

export const jobsRelations = relations(jobs, ({ one }) => ({
  project: one(projects, { fields: [jobs.projectId], references: [projects.id] }),
}));

export const validationReportsRelations = relations(validationReports, ({ one, many }) => ({
  project: one(projects, { fields: [validationReports.projectId], references: [projects.id] }),
  decisions: many(validationFindingDecisions),
}));

export const validationFindingDecisionsRelations = relations(validationFindingDecisions, ({ one }) => ({
  report: one(validationReports, { fields: [validationFindingDecisions.reportId], references: [validationReports.id] }),
}));

export const jobEventsRelations = relations(jobEvents, ({ one }) => ({
  job: one(jobs, { fields: [jobEvents.jobId], references: [jobs.id] }),
}));

export const authoringClaimsRelations = relations(authoringClaims, ({ one }) => ({
  project: one(projects, { fields: [authoringClaims.projectId], references: [projects.id] }),
  job: one(jobs, { fields: [authoringClaims.jobId], references: [jobs.id] }),
}));
