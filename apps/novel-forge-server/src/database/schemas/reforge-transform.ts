import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { AnyPgColumn, bigint, bigserial, index, integer, pgEnum, pgTable, real, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

import { jsonb } from './jsonb';
import { projects } from './projects';

export namespace ReforgeTransform {
  export type Analysis = InferSelectModel<typeof reforgeAnalyses>;
  export type ChapterCard = InferSelectModel<typeof reforgeChapterCards>;
  export type Finding = InferSelectModel<typeof reforgeFindings>;
  export type Plan = InferSelectModel<typeof reforgePlans>;
  export type PlanSpan = InferSelectModel<typeof reforgePlanSpans>;
  export type Output = InferSelectModel<typeof reforgeOutputs>;
  export type Cut = InferSelectModel<typeof reforgeCuts>;

  export type AnalysisStatus = InferEnum<typeof reforgeAnalysisStatus>;
  export type FindingType = InferEnum<typeof reforgeFindingType>;
  export type FindingSource = InferEnum<typeof reforgeFindingSource>;
  export type SpanAction = InferEnum<typeof reforgeSpanAction>;
  export type PlanStatus = InferEnum<typeof reforgePlanStatus>;
  export type OutputStatus = InferEnum<typeof reforgeOutputStatus>;
  export type CutKind = InferEnum<typeof reforgeCutKind>;
  export type CutDisposition = InferEnum<typeof reforgeCutDisposition>;

  /** How much a source chapter moves the story — the pacing substrate of the analysis report. */
  export type Movement = 'advances' | 'sidesteps' | 'stalls';

  /** The per-source-chapter digest the windowed analysis emits; the substrate for re-planning without re-analysing. */
  export interface Card {
    summary: string;
    pov: string | null;
    cast: string[];
    movement: Movement;
    threadsOpened: string[];
    threadsAdvanced: string[];
    threadsClosed: string[];
  }

  /** The before-half of the transform evaluation, recomputed over the promoted project's chapters for the after-half. */
  export interface AnalysisMetrics {
    repetitionRatio: number;
    stallRatio: number;
    medianWords: number;
    arcCount: number;
    deadThreadCount: number;
  }
}

export const reforgeAnalysisStatus = pgEnum('reforge_analysis_status', ['pending', 'signals', 'analyzing', 'synthesizing', 'done', 'failed']);
export const reforgeFindingType = pgEnum('reforge_finding_type', [
  'filler',
  'repetition',
  'pacing_stall',
  'dead_subplot',
  'dropped_thread',
  'arc_boundary',
  'quality_outlier',
  'window_failed',
]);
/** `both` means a deterministic signal raised the candidate and the model confirmed it — the highest-trust finding. */
export const reforgeFindingSource = pgEnum('reforge_finding_source', ['signal', 'model', 'both']);
export const reforgeSpanAction = pgEnum('reforge_span_action', ['keep', 'condense', 'merge', 'drop']);
export const reforgePlanStatus = pgEnum('reforge_plan_status', ['draft', 'pending', 'approved', 'superseded']);
export const reforgeOutputStatus = pgEnum('reforge_output_status', ['written', 'attention', 'failed']);
export const reforgeCutKind = pgEnum('reforge_cut_kind', ['subplot', 'thread', 'entity', 'arc', 'running_gag', 'scene_pattern']);
export const reforgeCutDisposition = pgEnum('reforge_cut_disposition', ['cut', 'condensed', 'resolved_early']);

// One row per analysis run over a source project (transform design §3.4); the latest row wins and older
// rows are retained so a plan can always be traced back to the report it was drawn from. `windowsFailed`
// is the flag-and-continue tally — the stage aborts above 10% because a plan drawn from a holed report is
// worse than no plan.
export const reforgeAnalyses = pgTable(
  'reforge_analyses',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    status: reforgeAnalysisStatus('status').notNull().default('pending'),
    windowSize: integer('window_size').notNull().default(15),
    chaptersAnalyzed: integer('chapters_analyzed').notNull().default(0),
    windowsFailed: integer('windows_failed').notNull().default(0),
    signals: jsonb('signals'),
    report: text('report'),
    metrics: jsonb('metrics').$type<ReforgeTransform.AnalysisMetrics>(),
    runIds: jsonb('run_ids').$type<string[]>(),
    lastError: varchar('last_error', { length: 2000 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [index('reforge_analyses_project_id_created_at_idx').on(t.projectId, t.createdAt)],
);

export const reforgeChapterCards = pgTable(
  'reforge_chapter_cards',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    analysisId: bigint('analysis_id', { mode: 'bigint' })
      .notNull()
      .references(() => reforgeAnalyses.id, { onDelete: 'cascade' }),
    chapter: integer('chapter').notNull(),
    card: jsonb('card').$type<ReforgeTransform.Card>().notNull(),
    movement: varchar('movement', { length: 16 }).$type<ReforgeTransform.Movement>().notNull(),
    threadsOpened: jsonb('threads_opened').$type<string[]>(),
    threadsClosed: jsonb('threads_closed').$type<string[]>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [unique('reforge_chapter_cards_analysis_id_chapter_unique').on(t.analysisId, t.chapter)],
);

// Candidates with evidence, never verdicts: a signal-only finding the model never confirmed stays at low
// confidence rather than being discarded, because a dead subplot the analysis drops becomes a kept span
// nobody questions.
export const reforgeFindings = pgTable(
  'reforge_findings',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    analysisId: bigint('analysis_id', { mode: 'bigint' })
      .notNull()
      .references(() => reforgeAnalyses.id, { onDelete: 'cascade' }),
    type: reforgeFindingType('type').notNull(),
    fromChapter: integer('from_chapter').notNull(),
    toChapter: integer('to_chapter').notNull(),
    severity: integer('severity').notNull(),
    confidence: real('confidence').notNull(),
    detectedBy: reforgeFindingSource('detected_by').notNull(),
    label: varchar('label', { length: 500 }).notNull(),
    detail: text('detail'),
    evidence: jsonb('evidence'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [index('reforge_findings_analysis_id_type_idx').on(t.analysisId, t.type)],
);

// The versioned structural authority (transform design §4). An edit to an approved plan never mutates it:
// a new revision is drafted and the old one is marked `superseded`, so outputs always name the exact plan
// revision they were written under.
export const reforgePlans = pgTable(
  'reforge_plans',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    analysisId: bigint('analysis_id', { mode: 'bigint' }).references(() => reforgeAnalyses.id, { onDelete: 'set null' }),
    revision: integer('revision').notNull().default(1),
    status: reforgePlanStatus('status').notNull().default('draft'),
    summary: text('summary'),
    sourceChapterCount: integer('source_chapter_count').notNull(),
    outputChapterCount: integer('output_chapter_count').notNull().default(0),
    promotedProjectId: bigint('promoted_project_id', { mode: 'bigint' }).references((): AnyPgColumn => projects.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at'),
    lastError: varchar('last_error', { length: 2000 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('reforge_plans_project_id_revision_unique').on(t.projectId, t.revision), index('reforge_plans_project_id_status_idx').on(t.projectId, t.status)],
);

// The span rows of §4. `spanKey` survives a revision that leaves the span's bounds, action, and target
// untouched, which is what lets already-written outputs carry forward instead of a single edit at span 3
// of 300 invalidating a book's worth of generation. `bridgeDirective` is generated once at approval for
// the span that follows a drop — the writer never improvises a seam.
export const reforgePlanSpans = pgTable(
  'reforge_plan_spans',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    planId: bigint('plan_id', { mode: 'bigint' })
      .notNull()
      .references(() => reforgePlans.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    spanKey: varchar('span_key', { length: 64 }).notNull(),
    fromChapter: integer('from_chapter').notNull(),
    toChapter: integer('to_chapter').notNull(),
    action: reforgeSpanAction('action').notNull(),
    targetChapters: integer('target_chapters').notNull(),
    arcLabel: varchar('arc_label', { length: 200 }),
    rationale: text('rationale'),
    keptBeats: jsonb('kept_beats').$type<string[]>(),
    cutThreads: jsonb('cut_threads').$type<string[]>(),
    continuityNotes: text('continuity_notes'),
    bridgeDirective: text('bridge_directive'),
    findingIds: jsonb('finding_ids').$type<string[]>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('reforge_plan_spans_plan_id_ordinal_unique').on(t.planId, t.ordinal), unique('reforge_plan_spans_plan_id_span_key_unique').on(t.planId, t.spanKey)],
);

// Output chapters are first-class rows keyed on the plan, not a mirror of the source numbering (§5).
// `body` is '' on failed rows so the upsert path stays uniform, exactly as `chapter_reforges` does.
// `planBeats` is the judge's contract: beats absent from it are outside the contract, so condensation is
// not drift.
export const reforgeOutputs = pgTable(
  'reforge_outputs',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    planId: bigint('plan_id', { mode: 'bigint' })
      .notNull()
      .references(() => reforgePlans.id, { onDelete: 'cascade' }),
    outputChapter: integer('output_chapter').notNull(),
    spanOrdinal: integer('span_ordinal').notNull(),
    spanKey: varchar('span_key', { length: 64 }).notNull(),
    fromChapter: integer('from_chapter').notNull(),
    toChapter: integer('to_chapter').notNull(),
    indexInSpan: integer('index_in_span').notNull(),
    title: varchar('title', { length: 500 }),
    body: text('body').notNull(),
    summary: text('summary'),
    planBeats: jsonb('plan_beats').$type<string[]>(),
    changes: jsonb('changes'),
    fidelity: jsonb('fidelity'),
    carryState: jsonb('carry_state'),
    cutDelta: jsonb('cut_delta'),
    status: reforgeOutputStatus('status').notNull(),
    issues: jsonb('issues'),
    wordCount: integer('word_count'),
    runId: uuid('run_id'),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [
    unique('reforge_outputs_plan_chapter_unique').on(t.planId, t.outputChapter),
    index('reforge_outputs_project_status_idx').on(t.projectId, t.status),
    index('reforge_outputs_plan_span_idx').on(t.planId, t.spanKey),
  ],
);

// The append-only cut ledger (§6.1). Seeded at plan approval, grown by each output's reported delta, and
// merged insert-conflict-keeps-existing like `rebrand_glossary`: a cut is never re-described once
// recorded, and entries are superseded by a new plan revision rather than deleted.
export const reforgeCuts = pgTable(
  'reforge_cuts',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    planId: bigint('plan_id', { mode: 'bigint' })
      .notNull()
      .references(() => reforgePlans.id, { onDelete: 'cascade' }),
    cutKey: varchar('cut_key', { length: 128 }).notNull(),
    kind: reforgeCutKind('kind').notNull(),
    label: varchar('label', { length: 500 }).notNull(),
    aliases: jsonb('aliases').$type<string[]>(),
    detail: text('detail'),
    disposition: reforgeCutDisposition('disposition').notNull().default('cut'),
    replacementNote: text('replacement_note'),
    originSpanOrdinal: integer('origin_span_ordinal').notNull(),
    firstSourceChapter: integer('first_source_chapter').notNull(),
    lastSourceChapter: integer('last_source_chapter').notNull(),
    effectiveFromOutput: integer('effective_from_output').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [unique('reforge_cuts_plan_id_cut_key_unique').on(t.planId, t.cutKey)],
);

export const reforgeAnalysesRelations = relations(reforgeAnalyses, ({ one, many }) => ({
  project: one(projects, { fields: [reforgeAnalyses.projectId], references: [projects.id] }),
  cards: many(reforgeChapterCards),
  findings: many(reforgeFindings),
}));

export const reforgeChapterCardsRelations = relations(reforgeChapterCards, ({ one }) => ({
  analysis: one(reforgeAnalyses, { fields: [reforgeChapterCards.analysisId], references: [reforgeAnalyses.id] }),
}));

export const reforgeFindingsRelations = relations(reforgeFindings, ({ one }) => ({
  analysis: one(reforgeAnalyses, { fields: [reforgeFindings.analysisId], references: [reforgeAnalyses.id] }),
}));

export const reforgePlansRelations = relations(reforgePlans, ({ one, many }) => ({
  project: one(projects, { fields: [reforgePlans.projectId], references: [projects.id], relationName: 'planProject' }),
  promotedProject: one(projects, { fields: [reforgePlans.promotedProjectId], references: [projects.id], relationName: 'planPromotedProject' }),
  analysis: one(reforgeAnalyses, { fields: [reforgePlans.analysisId], references: [reforgeAnalyses.id] }),
  spans: many(reforgePlanSpans),
  outputs: many(reforgeOutputs),
  cuts: many(reforgeCuts),
}));

export const reforgePlanSpansRelations = relations(reforgePlanSpans, ({ one }) => ({
  plan: one(reforgePlans, { fields: [reforgePlanSpans.planId], references: [reforgePlans.id] }),
}));

export const reforgeOutputsRelations = relations(reforgeOutputs, ({ one }) => ({
  project: one(projects, { fields: [reforgeOutputs.projectId], references: [projects.id] }),
  plan: one(reforgePlans, { fields: [reforgeOutputs.planId], references: [reforgePlans.id] }),
}));

export const reforgeCutsRelations = relations(reforgeCuts, ({ one }) => ({
  plan: one(reforgePlans, { fields: [reforgeCuts.planId], references: [reforgePlans.id] }),
}));
