import { InferEnum, InferSelectModel } from 'drizzle-orm';
import { bigint, bigserial, integer, pgEnum, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

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

export const novels = pgTable('novels', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  slug: varchar('slug', { length: 128 }).notNull().unique(),
  /**
   * The publishing client that created the row, and the only one allowed to mutate it thereafter: slugs are
   * caller-supplied, so without this two publishers pushing the same slug silently overwrite each other.
   * Deliberately undefaulted — a default would hand its holder authority over rows it never published.
   */
  sourceClientId: varchar('source_client_id', { length: 64 }).notNull(),
  title: varchar('title', { length: 256 }).notNull(),
  blurb: text('blurb'),
  coverPath: varchar('cover_path', { length: 512 }),
  /** Free-form genre strings drive the public catalog filters; carried in the metadata PUT payload */
  genres: varchar('genres', { length: 64 }).array().notNull().default([]),
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
