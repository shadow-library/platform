/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, index, integer, pgEnum, pgTable, smallint, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { jsonb } from './jsonb';
import { projects } from './projects';

/**
 * Defining types
 */

export namespace Job {
  export type Row = InferSelectModel<typeof jobs>;
  export type ExtractionRun = InferSelectModel<typeof extractionRuns>;
  export type ValidationReport = InferSelectModel<typeof validationReports>;
  export type Kind = InferEnum<typeof jobKind>;
  export type Status = InferEnum<typeof jobStatus>;
  export type ValidationScope = InferEnum<typeof validationScope>;
}

/**
 * Declaring the constants
 */

export const jobKind = pgEnum('job_kind', ['ingest', 'extract', 'generate', 'finalize', 'backfill', 'resume', 'rebrand', 'publish']);
export const jobStatus = pgEnum('job_status', ['pending', 'in_progress', 'done', 'failed']);
export const validationScope = pgEnum('validation_scope', ['novel', 'chapter']);

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
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('jobs_project_id_kind_target_unique').on(t.projectId, t.kind, t.target), index('jobs_project_id_kind_status_idx').on(t.projectId, t.kind, t.status)],
);

export const extractionRuns = pgTable(
  'extraction_runs',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' }).notNull(),
    chapter: integer('chapter'),
    role: varchar('role'),
    model: varchar('model'),
    status: varchar('status'),
    rawJson: jsonb('raw_json'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [index('extraction_runs_project_id_chapter_idx').on(t.projectId, t.chapter)],
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
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [index('validation_reports_project_id_scope_chapter_idx').on(t.projectId, t.scope, t.chapter)],
);

export const jobsRelations = relations(jobs, ({ one }) => ({
  project: one(projects, { fields: [jobs.projectId], references: [projects.id] }),
}));

export const validationReportsRelations = relations(validationReports, ({ one }) => ({
  project: one(projects, { fields: [validationReports.projectId], references: [projects.id] }),
}));
