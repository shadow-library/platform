/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel } from 'drizzle-orm';
import { bigint, bigserial, integer, pgEnum, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type Novel = InferSelectModel<typeof novels>;
export namespace Novel {
  export type Status = InferEnum<typeof novelStatus>;
  export type Chapter = InferSelectModel<typeof publishedChapters>;
}

/**
 * Declaring the tables
 *
 * These tables are the serving copy of a projection owned by novel-forge-server: dropping them
 * and re-pushing every publication must converge to identical state. `revision` values are
 * assigned by the forge (monotonic per row) and drive the optimistic-concurrency rules on the
 * internal publish surface; they are never generated here.
 */

export const novelStatus = pgEnum('novel_status', ['live', 'retired']);

export const novels = pgTable('novels', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  slug: varchar('slug', { length: 128 }).notNull().unique(),
  title: varchar('title', { length: 256 }).notNull(),
  blurb: text('blurb'),
  coverPath: varchar('cover_path', { length: 512 }),
  /** Free-form genre strings drive the public catalog filters; carried in the metadata PUT payload */
  genres: varchar('genres', { length: 64 }).array().notNull().default([]),
  status: novelStatus('status').notNull().default('live'),
  revision: integer('revision').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/** `(novel_id, ordinal)` anchors reader URLs, bookmarks, and progress; the forge never renumbers it */
export const publishedChapters = pgTable(
  'published_chapters',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    novelId: bigint('novel_id', { mode: 'bigint' })
      .notNull()
      .references(() => novels.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    title: varchar('title', { length: 256 }).notNull(),
    content: text('content').notNull(),
    authorNote: text('author_note'),
    contentHash: varchar('content_hash', { length: 128 }).notNull(),
    revision: integer('revision').notNull(),
    wordCount: integer('word_count'),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  table => [unique('published_chapters_novel_id_ordinal_unique').on(table.novelId, table.ordinal)],
);
