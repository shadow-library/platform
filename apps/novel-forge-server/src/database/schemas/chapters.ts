/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, boolean, index, integer, pgEnum, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { jsonb } from './jsonb';
import { contentGenerator, projects } from './projects';

/**
 * Defining types
 */

export namespace Chapter {
  export type Row = InferSelectModel<typeof chapters>;
  export type Status = InferEnum<typeof chapterStatus>;

  /** One absorbed translator part recorded on a recombined chapter (recombine design §3). */
  export interface MergedPart {
    number: number;
    title: string | null;
    words: number;
  }
}

/**
 * Declaring the constants
 */

export const chapterStatus = pgEnum('chapter_status', ['done', 'failed', 'skipped']);

export const chapters = pgTable(
  'chapters',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: varchar('title', { length: 500 }),
    content: text('content'),
    summary: text('summary'),
    wordCount: integer('word_count'),
    status: chapterStatus('status').notNull(),
    generator: contentGenerator('generator').notNull().default('standard'),
    // Set true when finalization commits the canonical prose; a locked chapter is immutable at the write path.
    locked: boolean('locked').notNull().default(false),
    // Set true when a dependency (bible doc or an earlier chapter) changed after this chapter was validated.
    needsRevalidation: boolean('needs_revalidation').notNull().default(false),
    continuityApplied: boolean('continuity_applied').notNull().default(false),
    // Audit trail of translator parts merged into this chapter by the recombine pass; null = never merged.
    mergedFrom: jsonb('merged_from'),
    note: text('note'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('chapters_project_id_number_unique').on(t.projectId, t.number), index('chapters_project_id_status_idx').on(t.projectId, t.status)],
);

export const chaptersRelations = relations(chapters, ({ one }) => ({
  project: one(projects, { fields: [chapters.projectId], references: [projects.id] }),
}));
