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
  export type Status = InferEnum<typeof publicationStatus>;
  export type ChapterStatus = InferEnum<typeof chapterPublicationStatus>;
}

/**
 * Declaring the constants
 */

export const publicationStatus = pgEnum('publication_status', ['draft', 'live', 'retired']);
export const chapterPublicationStatus = pgEnum('chapter_publication_status', ['scheduled', 'published', 'failed', 'unpublished']);

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
  genres: jsonb('genres'),
  status: publicationStatus('status').notNull().default('draft'),
  revision: integer('revision').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

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

export const publicationsRelations = relations(publications, ({ one }) => ({
  project: one(projects, { fields: [publications.projectId], references: [projects.id] }),
}));

export const chapterPublicationsRelations = relations(chapterPublications, ({ one }) => ({
  project: one(projects, { fields: [chapterPublications.projectId], references: [projects.id] }),
}));
