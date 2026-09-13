import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, boolean, index, integer, pgEnum, pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

import { jsonb } from './jsonb';
import { projects } from './projects';

export namespace Translation {
  export type Row = InferSelectModel<typeof translations>;
  export type GlossaryEntry = InferSelectModel<typeof translationGlossary>;
  export type ChapterTranslation = InferSelectModel<typeof chapterTranslations>;
  export type Phase = InferEnum<typeof translationPhase>;
  export type GlossaryStatus = InferEnum<typeof translationGlossaryStatus>;
  export type Treatment = InferEnum<typeof translationTreatment>;
  export type GlossaryCategory = InferEnum<typeof translationGlossaryCategory>;
  export type GlossaryOrigin = InferEnum<typeof translationGlossaryOrigin>;
  export type ChapterStatus = InferEnum<typeof chapterTranslationStatus>;

  /** One aligned original/translation pair kept on `chapter_translations.segments` for the audit; the joined `body` remains the truth. */
  export interface Segment {
    sourceStart: number;
    sourceEnd: number;
    body: string;
  }

  /** A fidelity-scan, audit or run defect recorded on `chapter_translations.issues`. */
  export interface Issue {
    source: 'fidelity' | 'audit' | 'run';
    type: string;
    detail: string;
    excerpt?: string;
    segmentIndex?: number;
  }

  /** Per-project knobs stored on `translations.settings`. */
  export interface Settings {
    /** Skip the per-chapter AI audit call when false; the deterministic fidelity scan always runs. */
    auditEnabled?: boolean;
    /** Max repair attempts before a chapter is persisted as `attention` (default 1). */
    maxRepairs?: number;
    /** Stop the job after seeding so the glossary is reviewed before later chapters bind to it (default true). */
    pauseAfterSeed?: boolean;
    /** Max tokens of original prose per translated segment (default 1800). */
    segmentTokens?: number;
    /** Accepted `[min, max]` translation-to-original ratios; per-language defaults apply to whichever band is unset. */
    fidelityBands?: { lengthRatio?: [number, number]; paragraphRatio?: [number, number] };
    /** Whether source honorifics survive into the English prose or are rendered as English address (default keep). */
    honorifics?: 'keep' | 'translate';
  }
}

// Advisory display state only — the executor derives the real phase from `styleNotes` and the
// chapter_translations rows, so a stale phase can never corrupt a run.
export const translationPhase = pgEnum('translation_phase', ['pending', 'seeding', 'review', 'translating', 'done', 'failed']);
export const translationGlossaryStatus = pgEnum('translation_glossary_status', ['suggested', 'approved', 'rejected']);
export const translationTreatment = pgEnum('translation_treatment', ['translate', 'localize', 'transliterate', 'preserve']);
export const translationGlossaryCategory = pgEnum('translation_glossary_category', [
  'character',
  'place',
  'organization',
  'profession',
  'title',
  'rank',
  'ability',
  'item',
  'creature',
  'term',
]);
export const translationGlossaryOrigin = pgEnum('translation_glossary_origin', ['seed', 'discovered', 'manual']);
export const chapterTranslationStatus = pgEnum('chapter_translation_status', ['translated', 'attention', 'finalized', 'failed']);

export const translations = pgTable(
  'translations',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    phase: translationPhase('phase').notNull().default('pending'),
    styleNotes: text('style_notes'),
    settings: jsonb('settings').$type<Translation.Settings>(),
    lastError: varchar('last_error', { length: 2000 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('translations_project_id_unique').on(t.projectId)],
);

// The terminology bible. Unlike `rebrand_glossary` an entry is editable: a `PATCH` bumps `revision` and
// one indexed statement marks every chapter that rendered the old value stale.
export const translationGlossary = pgTable(
  'translation_glossary',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sourceTerm: varchar('source_term', { length: 300 }).notNull(),
    variants: jsonb('variants').$type<string[]>(),
    target: varchar('target', { length: 300 }).notNull(),
    category: translationGlossaryCategory('category').notNull(),
    treatment: translationTreatment('treatment').notNull(),
    meaning: text('meaning'),
    contextExcerpt: text('context_excerpt'),
    alternatives: jsonb('alternatives').$type<{ target: string; rationale: string }[]>(),
    status: translationGlossaryStatus('status').notNull().default('suggested'),
    origin: translationGlossaryOrigin('origin').notNull(),
    notes: text('notes'),
    createdChapter: integer('created_chapter'),
    revision: integer('revision').notNull().default(1),
    decidedAt: timestamp('decided_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [
    unique('translation_glossary_project_id_source_term_unique').on(t.projectId, t.sourceTerm),
    index('translation_glossary_project_id_status_idx').on(t.projectId, t.status),
    index('translation_glossary_project_id_category_idx').on(t.projectId, t.category),
  ],
);

// Translated chapters live beside the untouched originals; `body` is '' on failed rows so the upsert path
// stays uniform. `applied_terms` is `{ [glossaryEntryId]: revision }` and GIN indexed, so a glossary edit
// marks its dependents in one indexed statement instead of a body scan over thousands of rows.
export const chapterTranslations = pgTable(
  'chapter_translations',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    chapter: integer('chapter').notNull(),
    title: varchar('title', { length: 500 }),
    body: text('body').notNull(),
    status: chapterTranslationStatus('status').notNull(),
    issues: jsonb('issues').$type<Translation.Issue[]>(),
    appliedTerms: jsonb('applied_terms').$type<Record<string, number>>(),
    glossaryStale: boolean('glossary_stale').notNull().default(false),
    sourceHash: varchar('source_hash', { length: 64 }),
    sourceStale: boolean('source_stale').notNull().default(false),
    segments: jsonb('segments').$type<Translation.Segment[]>(),
    runId: uuid('run_id'),
    lastError: varchar('last_error', { length: 2000 }),
    lastFailedRunId: uuid('last_failed_run_id'),
    revision: integer('revision').notNull().default(1),
    editedAt: timestamp('edited_at'),
    finalizedAt: timestamp('finalized_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [
    unique('chapter_translations_project_id_chapter_unique').on(t.projectId, t.chapter),
    index('chapter_translations_project_id_status_idx').on(t.projectId, t.status),
    index('chapter_translations_project_id_glossary_stale_idx').on(t.projectId, t.glossaryStale),
    index('chapter_translations_project_id_source_stale_idx').on(t.projectId, t.sourceStale),
    index('chapter_translations_applied_terms_idx').using('gin', t.appliedTerms),
  ],
);

export const translationsRelations = relations(translations, ({ one }) => ({
  project: one(projects, { fields: [translations.projectId], references: [projects.id] }),
}));

export const translationGlossaryRelations = relations(translationGlossary, ({ one }) => ({
  project: one(projects, { fields: [translationGlossary.projectId], references: [projects.id] }),
}));

export const chapterTranslationsRelations = relations(chapterTranslations, ({ one }) => ({
  project: one(projects, { fields: [chapterTranslations.projectId], references: [projects.id] }),
}));
