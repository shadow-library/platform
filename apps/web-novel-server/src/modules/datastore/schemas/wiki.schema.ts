import { InferSelectModel } from 'drizzle-orm';
import { bigint, bigserial, integer, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { novels } from './novels.schema';

export type WikiEntry = InferSelectModel<typeof wikiEntries>;
export type WikiEntryFacet = InferSelectModel<typeof wikiEntryFacets>;
export type WikiEntryImage = InferSelectModel<typeof wikiEntryImages>;

/**
 * Forge-owned projection like the novels beside it: a full re-push converges to identical state, and `revision` is forge-assigned.
 * The entry and each facet and image carry the reader ordinal at which they become visible, and gated rows are filtered in SQL, never fetched and dropped in application code.
 */

export const wikiEntries = pgTable(
  'wiki_entries',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    novelId: bigint('novel_id', { mode: 'bigint' })
      .notNull()
      .references(() => novels.id, { onDelete: 'cascade' }),
    /** Forge-assigned stable key; anchors the entry's reader URL and the manifest. */
    entryKey: varchar('entry_key', { length: 128 }).notNull(),
    type: varchar('type', { length: 32 }).notNull(),
    name: varchar('name', { length: 256 }).notNull(),
    imageRef: varchar('image_ref', { length: 512 }),
    /** A gated headline lives here, never in `imageRef`, so code that predates the gate and reads only `imageRef` cannot leak it on rollback. */
    gatedImageRef: varchar('gated_image_ref', { length: 512 }),
    imageVisibleFromOrdinal: integer('image_visible_from_ordinal'),
    firstVisibleOrdinal: integer('first_visible_ordinal').notNull(),
    contentHash: varchar('content_hash', { length: 128 }).notNull(),
    revision: integer('revision').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  table => [unique('wiki_entries_novel_id_entry_key_unique').on(table.novelId, table.entryKey)],
);

/** A named block of prose within an entry, independently gated. */
export const wikiEntryFacets = pgTable(
  'wiki_entry_facets',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    entryId: bigint('entry_id', { mode: 'bigint' })
      .notNull()
      .references(() => wikiEntries.id, { onDelete: 'cascade' }),
    facetKey: varchar('facet_key', { length: 128 }).notNull(),
    content: text('content').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    visibleFromOrdinal: integer('visible_from_ordinal').notNull(),
  },
  table => [unique('wiki_entry_facets_entry_id_facet_key_unique').on(table.entryId, table.facetKey)],
);

export const wikiEntryImages = pgTable('wiki_entry_images', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  entryId: bigint('entry_id', { mode: 'bigint' })
    .notNull()
    .references(() => wikiEntries.id, { onDelete: 'cascade' }),
  imageRef: varchar('image_ref', { length: 512 }).notNull(),
  caption: varchar('caption', { length: 256 }),
  sortOrder: integer('sort_order').notNull().default(0),
  visibleFromOrdinal: integer('visible_from_ordinal').notNull(),
});
