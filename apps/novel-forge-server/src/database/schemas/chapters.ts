import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, boolean, index, integer, pgEnum, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { type ContentRating } from '@shadow-library/sdk';

import { jsonb } from './jsonb';
import { contentGenerator, projects } from './projects';

export namespace Chapter {
  export type Row = InferSelectModel<typeof chapters>;
  export type Status = InferEnum<typeof chapterStatus>;

  /** One absorbed translator part recorded on a recombined chapter (recombine design §3). */
  export interface MergedPart {
    number: number;
    title: string | null;
    words: number;
  }
}

export const chapterStatus = pgEnum('chapter_status', ['done', 'failed', 'skipped']);

export const chapters = pgTable(
  'chapters',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: varchar('title', { length: 500 }),
    content: text('content'),
    summary: text('summary'),
    wordCount: integer('word_count'),
    status: chapterStatus('status').notNull(),
    generator: contentGenerator('generator').notNull().default('standard'),
    // Independent of `generator`: that records who wrote the chapter, this records whether its prose is
    // firewalled from the vector index, continuity extraction, and the verbatim-prose adjacency rule — a
    // `novel-import` final-mode chapter is `human` and not isolated; pasted explicit prose is `human` and isolated.
    isolated: boolean('isolated').notNull().default(false),
    /** Null is *unrated*, never `'none'` — the reader stores and filters the two differently, so an unset dimension must never be defaulted. */
    contentRating: jsonb('content_rating').$type<ContentRating>(),
    // Set true when finalization commits the canonical prose; a locked chapter is immutable at the write path.
    locked: boolean('locked').notNull().default(false),
    // Set true when a dependency (bible doc or an earlier chapter) changed after this chapter was validated.
    needsRevalidation: boolean('needs_revalidation').notNull().default(false),
    continuityApplied: boolean('continuity_applied').notNull().default(false),
    // Durable lease over continuity extraction: a concurrent finalize that cannot claim it must not extract a
    // second, contradictory delta. Cleared on failure, and made moot by `continuityApplied` on success.
    continuityClaimedAt: timestamp('continuity_claimed_at'),
    // The claim's fencing token (the finalization run's `runId`): every authoritative continuity write and the
    // claim release are conditioned on it, so a run whose lease expired and was stolen can no longer write.
    continuityClaimedBy: text('continuity_claimed_by'),
    // Audit trail of translator parts merged into this chapter by the recombine pass; null = never merged.
    mergedFrom: jsonb('merged_from'),
    note: text('note'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('chapters_project_id_number_unique').on(t.projectId, t.number), index('chapters_project_id_status_idx').on(t.projectId, t.status)],
);

export const chaptersRelations = relations(chapters, ({ one }) => ({
  project: one(projects, { fields: [chapters.projectId], references: [projects.id] }),
}));
