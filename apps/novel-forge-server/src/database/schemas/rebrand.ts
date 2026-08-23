import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, index, integer, pgEnum, pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

import { jsonb } from './jsonb';
import { projects } from './projects';

export namespace Rebrand {
  export type Row = InferSelectModel<typeof rebrands>;
  export type GlossaryEntry = InferSelectModel<typeof rebrandGlossary>;
  export type Conversion = InferSelectModel<typeof chapterConversions>;
  export type Status = InferEnum<typeof rebrandStatus>;
  export type ConversionStatus = InferEnum<typeof rebrandConversionStatus>;
  export type GlossaryCategory = InferEnum<typeof rebrandGlossaryCategory>;

  /** Per-project knobs stored on `rebrands.settings`. */
  export interface Settings {
    /** Extra residue-scan terms beyond the selected term packs. */
    bannedExtra?: string[];
    /** Skip the per-chapter AI audit call when false (deterministic scan always runs). */
    auditEnabled?: boolean;
    /** Named banned-term packs to scan for (see `banned-terms.ts`); default `['east-asian']`. Reforge reuses this row's selection. */
    termPacks?: string[];
    /** Max repair attempts before persisting as attention (default 1 — no behavior change). Shared with `Reforge.Settings`. */
    maxRepairs?: number;
  }
}

// Advisory display state only — resume logic derives the real phase from worldNotes and the
// chapter_conversions rows, so a stale status can never corrupt a run.
export const rebrandStatus = pgEnum('rebrand_status', ['pending', 'glossary', 'converting', 'done', 'failed']);
export const rebrandConversionStatus = pgEnum('rebrand_conversion_status', ['converted', 'attention', 'failed']);
export const rebrandGlossaryCategory = pgEnum('rebrand_glossary_category', ['character', 'place', 'country', 'culture', 'faction', 'technique', 'item', 'term']);

export const rebrands = pgTable(
  'rebrands',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    status: rebrandStatus('status').notNull().default('pending'),
    directives: text('directives'),
    worldNotes: text('world_notes'),
    settings: jsonb('settings').$type<Rebrand.Settings>(),
    lastError: varchar('last_error', { length: 2000 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('rebrands_project_id_unique').on(t.projectId)],
);

// The rename bible: one row per source proper noun, grown monotonically — a mapping is never
// rewritten once made, so every chapter converted after its creation renders the name identically.
export const rebrandGlossary = pgTable(
  'rebrand_glossary',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sourceName: varchar('source_name', { length: 300 }).notNull(),
    variants: jsonb('variants').$type<string[]>(),
    replacement: varchar('replacement', { length: 300 }).notNull(),
    category: rebrandGlossaryCategory('category').notNull(),
    notes: text('notes'),
    createdChapter: integer('created_chapter'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('rebrand_glossary_project_id_source_name_unique').on(t.projectId, t.sourceName), index('rebrand_glossary_project_id_category_idx').on(t.projectId, t.category)],
);

// Converted chapters live beside the untouched source rows; `body` is '' on failed rows so the
// upsert path stays uniform (status='failed' + empty body means "no output produced").
export const chapterConversions = pgTable(
  'chapter_conversions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    chapter: integer('chapter').notNull(),
    title: varchar('title', { length: 500 }),
    body: text('body').notNull(),
    summaryOfChanges: text('summary_of_changes'),
    fixes: jsonb('fixes'),
    addedScenes: jsonb('added_scenes'),
    carryState: jsonb('carry_state'),
    status: rebrandConversionStatus('status').notNull(),
    issues: jsonb('issues'),
    glossaryCount: integer('glossary_count'),
    runId: uuid('run_id'),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('chapter_conversions_project_id_chapter_unique').on(t.projectId, t.chapter), index('chapter_conversions_project_id_status_idx').on(t.projectId, t.status)],
);

export const rebrandsRelations = relations(rebrands, ({ one }) => ({
  project: one(projects, { fields: [rebrands.projectId], references: [projects.id] }),
}));

export const rebrandGlossaryRelations = relations(rebrandGlossary, ({ one }) => ({
  project: one(projects, { fields: [rebrandGlossary.projectId], references: [projects.id] }),
}));

export const chapterConversionsRelations = relations(chapterConversions, ({ one }) => ({
  project: one(projects, { fields: [chapterConversions.projectId], references: [projects.id] }),
}));
