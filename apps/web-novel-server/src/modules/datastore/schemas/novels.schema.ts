import { InferEnum, InferSelectModel } from 'drizzle-orm';
import { bigint, bigserial, integer, pgEnum, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { type ContentRating, type DarkContentLevel, type Genre, type SexualContentLevel, type Tag, type ViolenceLevel } from '@shadow-library/sdk';

import { jsonb } from './jsonb';

export type Novel = InferSelectModel<typeof novels>;
export namespace Novel {
  export type Status = InferEnum<typeof novelStatus>;
  export type Visibility = InferEnum<typeof novelVisibility>;
  export type Chapter = InferSelectModel<typeof publishedChapters>;
}

/** Serving copy of a projection owned by novel-forge-server: a full re-push converges to identical state. `revision` is forge-assigned and never generated here. */

export const novelStatus = pgEnum('novel_status', ['live', 'retired']);

/** Reachability ceiling, independent of `status`. Only `PUBLIC` is listed; `ORGANISATION` needs membership of `organisation_id`; `RESTRICTED` needs a `novel_grants` row. */
export const novelVisibility = pgEnum('novel_visibility', ['PUBLIC', 'ORGANISATION', 'RESTRICTED']);

export const novels = pgTable(
  'novels',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    slug: varchar('slug', { length: 128 }).notNull().unique(),
    /** The publisher that created the row and the only one allowed to mutate it; undefaulted so no default client gains authority over rows it never published. */
    sourceClientId: varchar('source_client_id', { length: 64 }).notNull(),
    /** The publisher's stable id for the novel, unique per publisher: a push is identified by it, so a changed slug renames the row and a retried create finds the same row. */
    sourceRef: varchar('source_ref', { length: 64 }).notNull(),
    /** Per-project publish token bound trust-on-first-use; nullable so novels published before it existed bind on their next changing push. Hardens the guessable `source_ref`. */
    publishToken: varchar('publish_token', { length: 64 }),
    title: varchar('title', { length: 256 }).notNull(),
    /** The work's author as readers see them; not the publishing client, and often unknown. */
    originalAuthor: varchar('original_author', { length: 256 }),
    blurb: text('blurb'),
    coverPath: varchar('cover_path', { length: 512 }),
    /** Closed `@shadow-library/sdk` vocabularies kept as `varchar` and validated at the DTO, so adding a value needs no migration. */
    genres: varchar('genres', { length: 64 }).array().notNull().default([]).$type<Genre[]>(),
    tags: varchar('tags', { length: 64 }).array().notNull().default([]).$type<Tag[]>(),
    /** `NULL` is unrated and never interchangeable with `'none'`: a source that cannot determine a level must not assert absence, so there is no default. */
    sexualContent: varchar('sexual_content', { length: 16 }).$type<SexualContentLevel>(),
    violence: varchar('violence', { length: 16 }).$type<ViolenceLevel>(),
    darkContent: varchar('dark_content', { length: 16 }).$type<DarkContentLevel>(),
    status: novelStatus('status').notNull().default('live'),
    /** The default exists for the migration only; every push sets it. */
    visibility: novelVisibility('visibility').notNull().default('PUBLIC'),
    /** The identity organisation an `ORGANISATION` novel is shared with; null on other tiers. */
    organisationId: varchar('organisation_id', { length: 64 }),
    /** Forge-assigned and independent of `revision`, so adding a viewer does not churn the metadata row. */
    accessRevision: integer('access_revision').notNull().default(1),
    revision: integer('revision').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  table => [unique('novels_source_client_id_source_ref_unique').on(table.sourceClientId, table.sourceRef)],
);

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
    /** Per-chapter rating, independent of the novel's columns. `NULL` is unrated, never `'none'`, so an older publisher can neither invent nor wipe a level. */
    contentRating: jsonb('content_rating').$type<ContentRating>(),
    contentHash: varchar('content_hash', { length: 128 }).notNull(),
    revision: integer('revision').notNull(),
    wordCount: integer('word_count'),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  table => [unique('published_chapters_novel_id_ordinal_unique').on(table.novelId, table.ordinal)],
);
