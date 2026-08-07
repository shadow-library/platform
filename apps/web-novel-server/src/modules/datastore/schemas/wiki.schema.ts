import { InferSelectModel } from 'drizzle-orm';
import { bigint, bigserial, integer, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { novels } from './novels.schema';

export type WikiEntry = InferSelectModel<typeof wikiEntries>;
export type WikiEntryFacet = InferSelectModel<typeof wikiEntryFacets>;
export type WikiEntryImage = InferSelectModel<typeof wikiEntryImages>;

/**
 * The serving copy of a novel's character/lore wiki — a forge-owned projection like the novels and
 * chapters beside it: dropping every row and re-pushing must converge to identical state. `revision`
 * is forge-assigned per entry and drives the optimistic-concurrency rules on the internal wiki push
 * surface; it is never generated here.
 *
 * Spoiler gating is the whole point of the shape. The entry, and every facet and image within it,
 * carries the reader ordinal at which it becomes visible; a reader is judged against the furthest
 * chapter they have reached, and gated rows are filtered in SQL before anything is loaded — never
 * fetched and dropped in application code, which would put a spoiler one serialization bug from the wire.
 */

export const wikiEntries = pgTable(
  'wiki_entries',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    novelId: bigint('novel_id', { mode: 'bigint' })
      .notNull()
      .references(() => novels.id, { onDelete: 'cascade' }),
    /** Forge-assigned stable key; anchors the entry's reader URL and the reconciliation manifest. */
    entryKey: varchar('entry_key', { length: 128 }).notNull(),
    type: varchar('type', { length: 32 }).notNull(),
    name: varchar('name', { length: 256 }).notNull(),
    /** Content-addressed storage reference (e.g. `<sha256>.webp`); resolved to a public URL at read time. */
    imageRef: varchar('image_ref', { length: 512 }),
    /** Reader ordinal at which the entry first appears; below it the entry does not exist for that reader. */
    firstVisibleOrdinal: integer('first_visible_ordinal').notNull(),
    contentHash: varchar('content_hash', { length: 128 }).notNull(),
    revision: integer('revision').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  table => [unique('wiki_entries_novel_id_entry_key_unique').on(table.novelId, table.entryKey)],
);

/** A named block of prose within an entry (biography, abilities, relationships …), independently gated. */
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

/** An illustration within an entry, independently gated so a later reveal is not shown too early. */
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
