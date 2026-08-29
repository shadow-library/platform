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

/**
 * These tables are the serving copy of a projection owned by novel-forge-server: dropping them
 * and re-pushing every publication must converge to identical state. `revision` values are
 * assigned by the forge (monotonic per row) and drive the optimistic-concurrency rules on the
 * internal publish surface; they are never generated here.
 */

export const novelStatus = pgEnum('novel_status', ['live', 'retired']);

/**
 * How widely a novel may be read. A ceiling on reachability, not a publication state — `status`
 * still says whether it is live at all, and a `retired` PUBLIC novel is retired-but-public rather
 * than private. Deliberately not a flag pair: "hidden" and "who may see it" are one question with
 * three answers, and modelling them separately invites a row that is both.
 *
 * `PUBLIC` is the only value the catalog will list, search or sort. `ORGANISATION` is readable by
 * the members of `organisation_id`. `RESTRICTED` is readable only by the subjects in `novel_grants`.
 * Both non-public tiers are owned by novel-forge and arrive over the internal publish surface; this
 * service never writes them.
 */
export const novelVisibility = pgEnum('novel_visibility', ['PUBLIC', 'ORGANISATION', 'RESTRICTED']);

export const novels = pgTable(
  'novels',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    slug: varchar('slug', { length: 128 }).notNull().unique(),
    /**
     * The publishing client that created the row, and the only one allowed to mutate it thereafter: slugs are
     * caller-supplied, so without this two publishers pushing the same slug silently overwrite each other.
     * Deliberately undefaulted — a default would hand its holder authority over rows it never published.
     */
    sourceClientId: varchar('source_client_id', { length: 64 }).notNull(),
    /**
     * The publisher's own stable identifier for the novel, unique per publisher. It, not the slug, is what
     * a push identifies a novel by, so a changed slug is a rename of this row rather than a second novel;
     * and because the publisher assigns it before pushing, a retried create finds the same row instead of
     * making another. Mandatory: a row without one is addressable only by slug, which is the identity
     * mistake this column exists to remove.
     */
    sourceRef: varchar('source_ref', { length: 64 }).notNull(),
    title: varchar('title', { length: 256 }).notNull(),
    /** The work's own author as the reader should see them, which is not the publishing client and is unknown for many pushes. */
    originalAuthor: varchar('original_author', { length: 256 }),
    blurb: text('blurb'),
    coverPath: varchar('cover_path', { length: 512 }),
    /**
     * Closed vocabularies from `@shadow-library/sdk`, kept as `varchar` rather than a native enum and validated
     * at the DTO boundary instead: adding a genre or tag stays a code change rather than a schema migration.
     */
    genres: varchar('genres', { length: 64 }).array().notNull().default([]).$type<Genre[]>(),
    tags: varchar('tags', { length: 64 }).array().notNull().default([]).$type<Tag[]>(),
    /**
     * `NULL` is *unrated*, and never interchangeable with `'none'` — a source that cannot determine a level must
     * not assert the absence of content — so these carry no default. One column per dimension so the catalog can
     * filter each independently.
     */
    sexualContent: varchar('sexual_content', { length: 16 }).$type<SexualContentLevel>(),
    violence: varchar('violence', { length: 16 }).$type<ViolenceLevel>(),
    darkContent: varchar('dark_content', { length: 16 }).$type<DarkContentLevel>(),
    status: novelStatus('status').notNull().default('live'),
    /** Defaulted for the migration's benefit only — every push carries it explicitly, so a row never relies on the default. */
    visibility: novelVisibility('visibility').notNull().default('PUBLIC'),
    /** The identity organisation an `ORGANISATION` novel is shared with; null on every other tier. */
    organisationId: varchar('organisation_id', { length: 64 }),
    /** Forge-assigned, and independent of `revision`: adding a viewer must not churn the metadata row. */
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
    /**
     * The chapter's own rating, independent of the novel's three columns: one is a per-novel classification the
     * author sets once, the other a per-chapter fact most chapters do not carry. `NULL` is *unrated* and never
     * `'none'` — a publisher that omits the field asserts nothing, so an older publisher can neither invent nor
     * wipe a level, and the catalog filters the two apart.
     */
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
