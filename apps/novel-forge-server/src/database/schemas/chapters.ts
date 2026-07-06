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
import { contentGenerator, projects } from './projects';

/**
 * Defining types
 */

export namespace Chapter {
  export type Row = InferSelectModel<typeof chapters>;
  export type Status = InferEnum<typeof chapterStatus>;
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
    url: varchar('url'),
    content: text('content'),
    summary: text('summary'),
    wordCount: integer('word_count'),
    status: chapterStatus('status').notNull(),
    generator: contentGenerator('generator').notNull().default('standard'),
    // Set true when finalization commits the canonical prose; a locked chapter is immutable at the write path.
    locked: boolean('locked').notNull().default(false),
    continuityApplied: boolean('continuity_applied').notNull().default(false),
    note: text('note'),
    scrapedAt: timestamp('scraped_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('chapters_project_id_number_unique').on(t.projectId, t.number), index('chapters_project_id_status_idx').on(t.projectId, t.status)],
);

export const chaptersRelations = relations(chapters, ({ one }) => ({
  project: one(projects, { fields: [chapters.projectId], references: [projects.id] }),
}));
