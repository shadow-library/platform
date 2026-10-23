import { InferSelectModel } from 'drizzle-orm';
import { bigint, doublePrecision, integer, pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core';

import { novels } from './novels.schema';

export type ReadingProgress = InferSelectModel<typeof readingProgress>;
export type LibraryEntry = InferSelectModel<typeof library>;

/** Audience data originates here and never crosses back to the forge; `user_id` is the identity subject, with no local account table. */

export const readingProgress = pgTable(
  'reading_progress',
  {
    userId: varchar('user_id', { length: 128 }).notNull(),
    novelId: bigint('novel_id', { mode: 'bigint' })
      .notNull()
      .references(() => novels.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    position: doublePrecision('position').notNull().default(0),
    /** Monotonic: never decreases when `ordinal` moves back on a reread. Gates wiki spoilers. */
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
