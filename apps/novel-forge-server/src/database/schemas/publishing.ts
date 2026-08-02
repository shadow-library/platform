/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, index, integer, pgEnum, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { jsonb } from './jsonb';
import { projects } from './projects';

/**
 * Defining types
 */

export namespace Publishing {
  export type Publication = InferSelectModel<typeof publications>;
  export type ChapterPublication = InferSelectModel<typeof chapterPublications>;
  export type WikiPublication = InferSelectModel<typeof wikiPublications>;
  export type Grant = InferSelectModel<typeof publicationGrants>;
  export type Status = InferEnum<typeof publicationStatus>;
  export type ChapterStatus = InferEnum<typeof chapterPublicationStatus>;
  export type WikiState = InferEnum<typeof wikiPublicationState>;
  export type Visibility = InferEnum<typeof publicationVisibility>;
  export type GrantState = InferEnum<typeof publicationGrantState>;
}

/**
 * Declaring the constants
 */

export const publicationStatus = pgEnum('publication_status', ['draft', 'live', 'retired']);
export const chapterPublicationStatus = pgEnum('chapter_publication_status', ['scheduled', 'published', 'failed', 'unpublished']);

/**
 * The wiki-entry push outbox states, mirroring `chapter_publication_status` (reader-publish design §5).
 * `pending` — the projection changed and awaits a PUT; `pushed` — converged on the reader; `failed` —
 * the last push errored and rides the retry loop; `deleted` — the entity is hidden or gone and must be
 * DELETEd from the reader, then kept as a tombstone whose entry key a later un-hide reuses.
 */
export const wikiPublicationState = pgEnum('wiki_publication_state', ['pending', 'pushed', 'failed', 'deleted']);

/** Who may read the published novel. Mirrors the reader's `novel_visibility`; this side is the system of record. */
export const publicationVisibility = pgEnum('publication_visibility', ['PUBLIC', 'ORGANISATION', 'RESTRICTED']);

/**
 * Whether a grant names an account yet. An author may share with an address that has no verified
 * platform account, and that must not be an error — the row is kept as `pending` so the intent
 * survives, is retried on every converge, and shows in the UI as awaiting an account. A `pending`
 * grant conveys no access and is never pushed to the reader.
 */
export const publicationGrantState = pgEnum('publication_grant_state', ['resolved', 'pending']);

// One per published novel — the forge-side system of record for the release decision (reader-publish
// design §3). `novelSlug` anchors reader URLs and never changes; `revision` is the forge-assigned
// monotonic metadata revision the reader uses for optimistic concurrency on `PUT /internal/novels/:slug`.
export const publications = pgTable('publications', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  projectId: bigint('project_id', { mode: 'bigint' })
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' })
    .unique('publications_project_id_unique'),
  novelSlug: varchar('novel_slug', { length: 128 }).notNull().unique('publications_novel_slug_unique'),
  title: varchar('title', { length: 256 }).notNull(),
  blurb: text('blurb'),
  coverPath: varchar('cover_path', { length: 512 }),
  // Reader-facing genre list — carried because the reader's novel upsert accepts it; jsonb like every
  // other string-list column in this schema.
  genres: jsonb('genres').$type<string[]>(),
  status: publicationStatus('status').notNull().default('draft'),
  visibility: publicationVisibility('visibility').notNull().default('PUBLIC'),
  /**
   * The identity organisation an `ORGANISATION` publication is shared with, captured from the
   * author's active organisation when they chose the tier. Stored rather than resolved at push time
   * because the author may later act in a different organisation, and that must not silently
   * re-target an existing share.
   */
  organisationId: varchar('organisation_id', { length: 64 }),
  /** Separate from `revision` so changing the share list never rewrites the metadata row, and vice versa. */
  accessRevision: integer('access_revision').notNull().default(1),
  revision: integer('revision').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * One row per person the author named. The address is kept alongside the resolved subject because
 * the author thinks in addresses — it is what the UI shows, what a re-resolution keys on, and the
 * only durable record of intent when no account exists yet. Only `subject_id` is ever pushed to the
 * reader, so an address never leaves this service.
 */
export const publicationGrants = pgTable(
  'publication_grants',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    publicationId: bigint('publication_id', { mode: 'bigint' })
      .notNull()
      .references(() => publications.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    subjectId: varchar('subject_id', { length: 128 }),
    state: publicationGrantState('state').notNull().default('pending'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('publication_grants_publication_id_email_unique').on(t.publicationId, t.email), index('publication_grants_publication_id_state_idx').on(t.publicationId, t.state)],
);

// The publication ledger, one row per pushed chapter (reader-publish design §3). `publishedOrdinal`
// is the reader-facing sequence: assigned once at first publish, never re-derived from forge chapter
// numbers, so internal renumbering can never move a reader URL, bookmark, or progress pointer.
// `chapter` is the forge chapter number at publish time — a historical pointer, not a live FK.
// `revision` is bumped whenever the rendered payload's contentHash changes on republish; the row
// doubles as the push outbox (`status` + `error` drive retries, sweeps, and the UI).
export const chapterPublications = pgTable(
  'chapter_publications',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    chapter: integer('chapter').notNull(),
    publishedOrdinal: integer('published_ordinal').notNull(),
    title: varchar('title', { length: 256 }).notNull(),
    authorNote: text('author_note'),
    contentHash: varchar('content_hash', { length: 128 }).notNull(),
    revision: integer('revision').notNull().default(1),
    scheduledAt: timestamp('scheduled_at'),
    publishedAt: timestamp('published_at'),
    status: chapterPublicationStatus('status').notNull().default('scheduled'),
    error: text('error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [
    unique('chapter_publications_project_id_published_ordinal_unique').on(t.projectId, t.publishedOrdinal),
    index('chapter_publications_project_id_status_idx').on(t.projectId, t.status),
    index('chapter_publications_project_id_chapter_idx').on(t.projectId, t.chapter),
  ],
);

// The wiki publication ledger, one row per pushed wiki entry (reader-publish design §5–6). Mirrors
// `chapter_publications` as an outbox: `state` + `error` drive retries and the janitor sweep, and the
// row IS the record of what the reader serves. `entryKey` is the entity key (the reader's stable wiki
// URL segment); `contentHash` covers the full spoiler-gated projection so an unchanged entry re-hashes
// identically and every no-op/republish decision is deterministic. `revision` is the forge-assigned
// monotonic the reader uses for optimistic concurrency, bumped only when `contentHash` actually moves.
export const wikiPublications = pgTable(
  'wiki_publications',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    entryKey: varchar('entry_key', { length: 128 }).notNull(),
    revision: integer('revision').notNull().default(1),
    contentHash: varchar('content_hash', { length: 128 }).notNull(),
    state: wikiPublicationState('state').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    pushedAt: timestamp('pushed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('wiki_publications_project_id_entry_key_unique').on(t.projectId, t.entryKey), index('wiki_publications_project_id_state_idx').on(t.projectId, t.state)],
);

export const publicationsRelations = relations(publications, ({ one, many }) => ({
  project: one(projects, { fields: [publications.projectId], references: [projects.id] }),
  grants: many(publicationGrants),
}));

export const publicationGrantsRelations = relations(publicationGrants, ({ one }) => ({
  publication: one(publications, { fields: [publicationGrants.publicationId], references: [publications.id] }),
}));

export const chapterPublicationsRelations = relations(chapterPublications, ({ one }) => ({
  project: one(projects, { fields: [chapterPublications.projectId], references: [projects.id] }),
}));

export const wikiPublicationsRelations = relations(wikiPublications, ({ one }) => ({
  project: one(projects, { fields: [wikiPublications.projectId], references: [projects.id] }),
}));
