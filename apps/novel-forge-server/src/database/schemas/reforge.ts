import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, index, integer, pgEnum, pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

import { jsonb } from './jsonb';
import { projects } from './projects';

export namespace Reforge {
  export type Row = InferSelectModel<typeof reforges>;
  export type Chapter = InferSelectModel<typeof chapterReforges>;
  export type Status = InferEnum<typeof reforgeStatus>;
  export type ChapterStatus = InferEnum<typeof reforgeChapterStatus>;
  export type Fidelity = InferEnum<typeof reforgeFidelity>;
  export type Mode = InferEnum<typeof reforgeMode>;

  /** Per-project knobs stored on `reforges.settings`. */
  export interface Settings {
    /** Skip the per-chapter AI fidelity judge when false (deterministic residue scan always runs). */
    judgeEnabled?: boolean;
    /** Target word count for regenerated chapters; guides the writer prompt when set. */
    targetWords?: number;
    /** Transform mode: source chapters per analysis window (default 15) — a comparative-judgment unit, not a context ceiling. */
    analysisWindow?: number;
  }
}

// Advisory display state only — resume logic derives the real phase from the shared rebrand world
// notes and the chapter_reforges rows, so a stale status can never corrupt a run.
export const reforgeStatus = pgEnum('reforge_status', ['pending', 'glossary', 'reforging', 'done', 'failed']);
export const reforgeChapterStatus = pgEnum('reforge_chapter_status', ['reforged', 'attention', 'failed']);
// How faithful the re-author stays to the source: preserve = keep beats + dialogue meaning, re-prose fully
// (default); close = keep dialogue near the source wording; loose = allow scene re-ordering for pacing.
export const reforgeFidelity = pgEnum('reforge_fidelity', ['preserve', 'close', 'loose']);
// Structural re-authoring is gated here rather than on `fidelity` (transform design §7): overloading the
// fidelity enum would silently re-route every project already configured `loose` into a pipeline that
// refuses to run without an analysis and an approved plan.
export const reforgeMode = pgEnum('reforge_mode', ['chapter', 'transform']);

export const reforges = pgTable(
  'reforges',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    status: reforgeStatus('status').notNull().default('pending'),
    mode: reforgeMode('mode').notNull().default('chapter'),
    instructions: text('instructions'),
    fidelity: reforgeFidelity('fidelity').notNull().default('preserve'),
    settings: jsonb('settings').$type<Reforge.Settings>(),
    lastError: varchar('last_error', { length: 2000 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('reforges_project_id_unique').on(t.projectId)],
);

// Re-authored chapters live beside the untouched source rows and any rebrand conversions; `body` is ''
// on failed rows so the upsert path stays uniform (status='failed' + empty body means "no output").
// `sourceBeats` is the faithful outline the writer worked from — the fidelity anchor kept for audit + repair.
export const chapterReforges = pgTable(
  'chapter_reforges',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    chapter: integer('chapter').notNull(),
    title: varchar('title', { length: 500 }),
    body: text('body').notNull(),
    summary: text('summary'),
    sourceBeats: jsonb('source_beats'),
    changes: jsonb('changes'),
    fidelity: jsonb('fidelity'),
    carryState: jsonb('carry_state'),
    status: reforgeChapterStatus('status').notNull(),
    issues: jsonb('issues'),
    wordCount: integer('word_count'),
    runId: uuid('run_id'),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('chapter_reforges_project_id_chapter_unique').on(t.projectId, t.chapter), index('chapter_reforges_project_id_status_idx').on(t.projectId, t.status)],
);

export const reforgesRelations = relations(reforges, ({ one }) => ({
  project: one(projects, { fields: [reforges.projectId], references: [projects.id] }),
}));

export const chapterReforgesRelations = relations(chapterReforges, ({ one }) => ({
  project: one(projects, { fields: [chapterReforges.projectId], references: [projects.id] }),
}));
