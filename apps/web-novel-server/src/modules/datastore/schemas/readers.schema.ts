/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { InferSelectModel } from 'drizzle-orm';
import { bigint, doublePrecision, integer, pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { novels } from './novels.schema';

/**
 * Defining types
 */

export type ReadingProgress = InferSelectModel<typeof readingProgress>;
export type LibraryEntry = InferSelectModel<typeof library>;

/**
 * Declaring the tables
 *
 * Audience data originates here and stays here — the forge never reads or writes these tables.
 * `user_id` is the identity-issued subject; accounts live in the identity service, so there are
 * deliberately no local users/sessions tables to join against.
 */

export const readingProgress = pgTable(
  'reading_progress',
  {
    userId: varchar('user_id', { length: 128 }).notNull(),
    novelId: bigint('novel_id', { mode: 'bigint' })
      .notNull()
      .references(() => novels.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    /** Scroll offset within the chapter, as reported by the reader client */
    position: doublePrecision('position').notNull().default(0),
    /** Furthest chapter ever reached — monotonic, never decreases even when `ordinal` moves back on a reread. Gates spoilers. */
    furthestOrdinal: integer('furthest_ordinal').notNull().default(0),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  table => [primaryKey({ name: 'reading_progress_user_id_novel_id_pk', columns: [table.userId, table.novelId] })],
);

export const library = pgTable(
  'library',
  {
    userId: varchar('user_id', { length: 128 }).notNull(),
    novelId: bigint('novel_id', { mode: 'bigint' })
      .notNull()
      .references(() => novels.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at').notNull().defaultNow(),
  },
  table => [primaryKey({ name: 'library_user_id_novel_id_pk', columns: [table.userId, table.novelId] })],
);
