import { and, asc, eq, inArray, isNotNull, max, or, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger, ValidationError } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';
import { chapterContentHash } from '@shadow-library/sdk/publishing';

import { AppErrorCode } from '@server/classes';
import { applyAmendRepublish, OPENING_CHAPTER_COUNT, sanitizeMarkdown, selectSeedSampleChapters } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type DbExecutor, type PrimaryDatabase, schema, type Translation } from '@server/database';

import { ContextAssembler } from '../ai/context/context-assembler.service';
import { truncateAtParagraph } from '../ai/context/token-budget';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { PROMPT_REGISTRY } from '../ai/prompts';
import { type TranslationSeedOutput } from '../ai/schemas';
import { PluginPolicyService } from '../plugins/plugin-policy.service';
import { renderChapterPayload } from '../publishing/publish-payload';
import { LATIN_PROFILE, scriptProfileFor, scriptRatio } from './script-profile';

export interface TranslationConfigUpdate {
  styleNotes?: string | null;
  settings?: Translation.Settings;
}

export interface TranslationChapterCounts {
  originals: number;
  untranslated: number;
  translated: number;
  attention: number;
  finalized: number;
  failed: number;
  stale: number;
}

export interface TranslationGlossaryCounts {
  approved: number;
  suggested: number;
  rejected: number;
}

export interface TranslationStatusResult {
  translation: Translation.Row;
  originalLanguage: string | null;
  counts: TranslationChapterCounts;
  glossary: TranslationGlossaryCounts;
}

export interface OriginalUpsert {
  title: string;
  content: string;
}

export interface OriginalUpsertResult {
  outcome: 'created' | 'updated' | 'unchanged';
}

export interface OriginalChapter {
  chapter: number;
  title: string | null;
  content: string;
  contentHash: string | null;
}

export interface OriginalsManifest {
  projectId: bigint;
  originalLanguage: string | null;
  chapters: { chapter: number; contentHash: string | null; translationStatus: Translation.ChapterStatus | null }[];
}

export interface SeedGlossaryResult {
  seeded: boolean;
  suggestions: number;
}

export interface GlossaryListFilter {
  status?: Translation.GlossaryStatus;
  category?: Translation.GlossaryCategory;
  treatment?: Translation.Treatment;
  q?: string;
  page?: number;
  limit?: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface TermCreate {
  sourceTerm: string;
  target: string;
  category: Translation.GlossaryCategory;
  treatment: Translation.Treatment;
  variants?: string[] | null;
  meaning?: string | null;
  notes?: string | null;
}

export interface TermUpdate {
  target?: string;
  treatment?: Translation.Treatment;
  category?: Translation.GlossaryCategory;
  meaning?: string | null;
  variants?: string[] | null;
  notes?: string | null;
}

export interface TermDecision {
  id: bigint;
  decision: 'approve' | 'reject';
  target?: string;
  treatment?: Translation.Treatment;
}

export interface ChapterListFilter {
  page?: number;
  limit?: number;
  status?: Translation.ChapterStatus;
  stale?: boolean;
}

export interface TranslationChapterSummary {
  chapter: number;
  originalTitle: string | null;
  title: string | null;
  status: Translation.ChapterStatus | null;
  issueCount: number;
  pendingTerms: number;
  glossaryStale: boolean;
  sourceStale: boolean;
  revision: number;
  updatedAt: Date | null;
}

export interface AppliedTermSummary {
  id: bigint;
  sourceTerm: string;
  target: string;
  status: Translation.GlossaryStatus;
  revision: number;
  appliedRevision: number;
  stale: boolean;
}

export interface TranslationChapterDetail {
  chapter: number;
  original: { title: string | null; content: string | null };
  translation: Translation.ChapterTranslation;
  appliedTerms: AppliedTermSummary[];
}

export interface TranslationEdit {
  title?: string;
  body?: string;
}

export interface FinalizeResult {
  chapter: number;
  wordCount: number;
  republished: boolean;
  publicationRevision?: number;
}

export interface TranslationManuscript {
  markdown: string;
  pendingChapters: number[];
}

const OPENING_CHAPTER_TOKENS = 1_500;
const SAMPLE_CHAPTER_TOKENS = 800;
const MIN_SOURCE_SCRIPT_RATIO = 0.5;

function countWords(text: string | null): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

@Injectable()
export class TranslationService {
  private readonly logger = Logger.getLogger(APP_NAME, TranslationService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly contextAssembler: ContextAssembler,
    private readonly modelRouter: ModelRouterService,
    private readonly workflowRunService: WorkflowRunService,
    private readonly pluginPolicy: PluginPolicyService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** Upsert-on-read: the translation row exists from the first touch, so config and status never 404. */
  async getOrCreate(projectId: bigint): Promise<Translation.Row> {
    await this.requireProject(projectId);

    const existing = await this.db.query.translations.findFirst({ where: eq(schema.translations.projectId, projectId) });
    if (existing) return existing;

    const [inserted] = await this.db.insert(schema.translations).values({ projectId }).onConflictDoNothing().returning();
    if (inserted) return inserted;
    const raced = await this.db.query.translations.findFirst({ where: eq(schema.translations.projectId, projectId) });
    if (!raced) throw AppErrorCode.TRN_001.create();
    return raced;
  }

  async updateConfig(projectId: bigint, update: TranslationConfigUpdate): Promise<Translation.Row> {
    const translation = await this.getOrCreate(projectId);
    const set: Partial<typeof schema.translations.$inferInsert> = { updatedAt: new Date() };
    if (update.styleNotes !== undefined) set.styleNotes = update.styleNotes;
    if (update.settings !== undefined) set.settings = update.settings;
    this.logger.info('translation config updated', { projectId, styleNotesChanged: update.styleNotes !== undefined, settingsChanged: update.settings !== undefined });
    const [updated] = await this.db.update(schema.translations).set(set).where(eq(schema.translations.id, translation.id)).returning();
    return updated ?? translation;
  }

  async status(projectId: bigint): Promise<TranslationStatusResult> {
    const translation = await this.getOrCreate(projectId);

    const [project, originalRows, statusRows, [staleRow], glossaryRows] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { originalLanguage: true } }),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.chapters)
        .where(and(eq(schema.chapters.projectId, projectId), isNotNull(schema.chapters.originalContent))),
      this.db
        .select({ status: schema.chapterTranslations.status, count: sql<number>`count(*)::int` })
        .from(schema.chapterTranslations)
        .where(eq(schema.chapterTranslations.projectId, projectId))
        .groupBy(schema.chapterTranslations.status),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.chapterTranslations)
        .where(and(eq(schema.chapterTranslations.projectId, projectId), or(schema.chapterTranslations.glossaryStale, schema.chapterTranslations.sourceStale))),
      this.db
        .select({ status: schema.translationGlossary.status, count: sql<number>`count(*)::int` })
        .from(schema.translationGlossary)
        .where(eq(schema.translationGlossary.projectId, projectId))
        .groupBy(schema.translationGlossary.status),
    ]);

    const counts: TranslationChapterCounts = {
      originals: originalRows[0]?.count ?? 0,
      untranslated: 0,
      translated: 0,
      attention: 0,
      finalized: 0,
      failed: 0,
      stale: staleRow?.count ?? 0,
    };
    for (const row of statusRows) counts[row.status] = row.count;
    counts.untranslated = Math.max(counts.originals - statusRows.reduce((sum, row) => sum + row.count, 0), 0);

    const glossary: TranslationGlossaryCounts = { approved: 0, suggested: 0, rejected: 0 };
    for (const row of glossaryRows) glossary[row.status] = row.count;

    return { translation, originalLanguage: project?.originalLanguage ?? null, counts, glossary };
  }

  /**
   * The only writer of the original columns, reached from both the session route
   * and the API-key ingest route. The whole decision runs under a row lock on the project so two pushes
   * cannot both read the same highest chapter number and then compute the same next one.
   */
  async upsertOriginal(projectId: bigint, chapter: number, body: OriginalUpsert): Promise<OriginalUpsertResult> {
    const project = await this.requireProject(projectId);
    const title = sanitizeMarkdown(body.title).trim();
    const content = sanitizeMarkdown(body.content).trim();
    this.assertOriginalText(content, project.originalLanguage);

    return this.db.transaction(async rawTx => {
      const tx = rawTx as unknown as PrimaryDatabase;
      await tx.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.id, projectId)).for('update');

      const where = and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapter));
      const existing = await tx.query.chapters.findFirst({ where });
      if (existing) {
        if (existing.originalTitle === title && existing.originalContent === content) return { outcome: 'unchanged' as const };
        await tx
          .update(schema.chapters)
          .set({ originalTitle: title, originalContent: content, contentHash: chapterContentHash({ title, content }), updatedAt: new Date() })
          .where(where);
        // Flips on finalized rows too: the badge is the only way a reviewer learns the canon they signed off no longer matches the source.
        await tx
          .update(schema.chapterTranslations)
          .set({ sourceStale: true, updatedAt: new Date() })
          .where(and(eq(schema.chapterTranslations.projectId, projectId), eq(schema.chapterTranslations.chapter, chapter)));
        return { outcome: 'updated' as const };
      }

      const [bounds] = await tx
        .select({ number: max(schema.chapters.number) })
        .from(schema.chapters)
        .where(eq(schema.chapters.projectId, projectId));
      if (chapter !== (bounds?.number ?? 0) + 1) throw AppErrorCode.TRN_010.create();

      // `content`/`wordCount` stay null: `chapters.content` is the English every pipeline reads, and finalize is its only writer.
      await tx.insert(schema.chapters).values({
        projectId,
        number: chapter,
        originalTitle: title,
        originalContent: content,
        contentHash: chapterContentHash({ title, content }),
        status: 'done',
        generator: 'human',
        locked: false,
      });
      return { outcome: 'created' as const };
    });
  }

  async getOriginal(projectId: bigint, chapter: number): Promise<OriginalChapter> {
    await this.requireProject(projectId);
    const row = await this.db.query.chapters.findFirst({
      where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapter)),
      columns: { number: true, originalTitle: true, originalContent: true, contentHash: true },
    });
    if (!row?.originalContent) throw AppErrorCode.TRN_012.create();
    return { chapter: row.number, title: row.originalTitle, content: row.originalContent, contentHash: row.contentHash };
  }

  /**
   * Only the highest chapter is removable, because serial ascending translation depends on the originals
   * staying contiguous. A chapter whose translation was finalized is refused with `TRN_004` — the same code
   * every other write past a finalize uses — and so is one that reached a reader, whose URL must not dangle.
   */
  async deleteOriginal(projectId: bigint, chapter: number): Promise<void> {
    await this.requireProject(projectId);
    await this.db.transaction(async rawTx => {
      const tx = rawTx as unknown as PrimaryDatabase;
      await tx.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.id, projectId)).for('update');

      const where = and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapter));
      const existing = await tx.query.chapters.findFirst({ where });
      if (!existing?.originalContent) throw AppErrorCode.TRN_012.create();

      const [bounds] = await tx
        .select({ number: max(schema.chapters.number) })
        .from(schema.chapters)
        .where(eq(schema.chapters.projectId, projectId));
      if (bounds?.number !== chapter) throw AppErrorCode.TRN_010.create();
      if (existing.locked) throw AppErrorCode.TRN_004.create();

      const translation = await tx.query.chapterTranslations.findFirst({
        where: and(eq(schema.chapterTranslations.projectId, projectId), eq(schema.chapterTranslations.chapter, chapter)),
        columns: { status: true },
      });
      const publication = await tx.query.chapterPublications.findFirst({
        where: and(eq(schema.chapterPublications.projectId, projectId), eq(schema.chapterPublications.chapter, chapter)),
        columns: { id: true },
      });
      if (translation?.status === 'finalized' || publication) throw AppErrorCode.TRN_004.create();

      await tx.delete(schema.chapterTranslations).where(and(eq(schema.chapterTranslations.projectId, projectId), eq(schema.chapterTranslations.chapter, chapter)));
      await tx.delete(schema.chapters).where(where);
    });
  }

  async originalsManifest(projectId: bigint): Promise<OriginalsManifest> {
    const project = await this.requireProject(projectId);
    const rows = await this.db
      .select({ chapter: schema.chapters.number, contentHash: schema.chapters.contentHash, translationStatus: schema.chapterTranslations.status })
      .from(schema.chapters)
      .leftJoin(
        schema.chapterTranslations,
        and(eq(schema.chapterTranslations.projectId, schema.chapters.projectId), eq(schema.chapterTranslations.chapter, schema.chapters.number)),
      )
      .where(and(eq(schema.chapters.projectId, projectId), isNotNull(schema.chapters.originalContent)))
      .orderBy(asc(schema.chapters.number));

    return { projectId, originalLanguage: project.originalLanguage, chapters: rows };
  }

  /**
   * Seeds the style notes and the initial terminology. Idempotent: a
   * translation with `styleNotes` already set is a no-op, so job resume never re-seeds or re-bills.
   */
  async seedGlossary(projectId: bigint, jobId?: string): Promise<SeedGlossaryResult> {
    const translation = await this.getOrCreate(projectId);
    if (translation.styleNotes) {
      this.logger.debug('seedGlossary: styleNotes already present — skipping (idempotent)', { projectId, jobId });
      return { seeded: false, suggestions: 0 };
    }
    this.logger.info('seedGlossary: seeding style notes and terminology', { projectId, jobId });

    const policy = await this.pluginPolicy.resolve(projectId, { role: 'translate' });
    const [project, pack, chapterNumberRows] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.contextAssembler.forTranslateSeed(projectId, { policy }),
      this.db
        .select({ number: schema.chapters.number })
        .from(schema.chapters)
        .where(and(eq(schema.chapters.projectId, projectId), isNotNull(schema.chapters.originalContent)))
        .orderBy(asc(schema.chapters.number)),
    ]);
    const sampleNumbers = selectSeedSampleChapters(chapterNumberRows.map(c => c.number));
    const openingNumbers = new Set(sampleNumbers.slice(0, OPENING_CHAPTER_COUNT));
    const sampleRows =
      sampleNumbers.length > 0
        ? await this.db.query.chapters.findMany({
            where: and(eq(schema.chapters.projectId, projectId), inArray(schema.chapters.number, sampleNumbers)),
            orderBy: [asc(schema.chapters.number)],
            columns: { number: true, originalTitle: true, originalContent: true },
          })
        : [];
    const sampleChapters = sampleRows
      .map(ch => {
        const tokens = openingNumbers.has(ch.number) ? OPENING_CHAPTER_TOKENS : SAMPLE_CHAPTER_TOKENS;
        return `Chapter ${ch.number}${ch.originalTitle ? ` — ${ch.originalTitle}` : ''}:\n${truncateAtParagraph(ch.originalContent ?? '', tokens).text}`;
      })
      .join('\n\n---\n\n');

    const prompt = PROMPT_REGISTRY['translate-seed'];
    const { result } = await this.workflowRunService.runChain(projectId, 'translate-seed', 'seed', { jobId }, async runId => {
      if (pack.id) await this.workflowRunService.linkContextPack(runId, pack.id);
      const ctx = { projectId, runId, node: 'seedGlossary', promptKey: prompt.key, promptVersion: prompt.version, role: 'translate' };
      const output = (await this.modelRouter.structured(
        prompt,
        { contextPack: pack.rendered, language: project?.originalLanguage ?? 'the original language', sampleChapters },
        ctx,
        project as ProjectConfig,
        policy,
      )) as TranslationSeedOutput;

      await this.db.update(schema.translations).set({ styleNotes: output.styleNotes, updatedAt: new Date() }).where(eq(schema.translations.id, translation.id));
      if (output.terms.length > 0) {
        await this.db
          .insert(schema.translationGlossary)
          .values(
            output.terms.map(term => ({
              projectId,
              sourceTerm: term.sourceTerm,
              variants: term.variants ?? null,
              target: term.target,
              category: term.category,
              treatment: term.treatment,
              meaning: term.meaning,
              contextExcerpt: term.contextExcerpt ?? null,
              alternatives: term.alternatives ?? null,
              status: 'suggested' as const,
              origin: 'seed' as const,
              createdChapter: 0,
            })),
          )
          .onConflictDoNothing();
      }
      return { seeded: true, suggestions: output.terms.length };
    });

    this.logger.info('translation glossary seeded', { projectId, suggestions: result.suggestions });
    return result;
  }

  /** A finalized chapter is never a re-run target, even under `force` — reopen it first. */
  async assertRerunnable(projectId: bigint, chapter: number): Promise<void> {
    await this.getOrCreate(projectId);
    const translation = await this.db.query.chapterTranslations.findFirst({
      where: and(eq(schema.chapterTranslations.projectId, projectId), eq(schema.chapterTranslations.chapter, chapter)),
      columns: { status: true },
    });
    if (translation?.status === 'finalized') throw AppErrorCode.TRN_004.create();
  }

  async listGlossary(projectId: bigint, filter: GlossaryListFilter = {}): Promise<Page<Translation.GlossaryEntry>> {
    await this.requireProject(projectId);
    const limit = Math.min(filter.limit ?? 50, 200);
    const page = Math.max(filter.page ?? 1, 1);
    const conditions = [eq(schema.translationGlossary.projectId, projectId)];
    if (filter.status) conditions.push(eq(schema.translationGlossary.status, filter.status));
    if (filter.category) conditions.push(eq(schema.translationGlossary.category, filter.category));
    if (filter.treatment) conditions.push(eq(schema.translationGlossary.treatment, filter.treatment));
    if (filter.q) {
      const pattern = `%${filter.q}%`;
      conditions.push(
        sql`(${schema.translationGlossary.sourceTerm} ILIKE ${pattern} OR ${schema.translationGlossary.target} ILIKE ${pattern} OR ${schema.translationGlossary.variants}::text ILIKE ${pattern})`,
      );
    }
    const where = and(...conditions);

    const [items, [totalRow]] = await Promise.all([
      this.db.query.translationGlossary.findMany({ where, orderBy: [asc(schema.translationGlossary.sourceTerm)], limit, offset: (page - 1) * limit }),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.translationGlossary)
        .where(where),
    ]);
    return { items, total: totalRow?.count ?? 0, page, limit };
  }

  async createTerm(projectId: bigint, body: TermCreate): Promise<Translation.GlossaryEntry> {
    await this.getOrCreate(projectId);
    const [inserted] = await this.db
      .insert(schema.translationGlossary)
      .values({
        projectId,
        sourceTerm: body.sourceTerm,
        target: body.target,
        category: body.category,
        treatment: body.treatment,
        variants: body.variants ?? null,
        meaning: body.meaning ?? null,
        notes: body.notes ?? null,
        status: 'approved',
        origin: 'manual',
        decidedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (!inserted) throw AppErrorCode.TRN_009.create();
    return inserted;
  }

  async updateTerm(projectId: bigint, id: bigint, patch: TermUpdate): Promise<Translation.GlossaryEntry> {
    const entry = await this.requireTerm(projectId, id);
    const set: Partial<typeof schema.translationGlossary.$inferInsert> = { revision: entry.revision + 1, updatedAt: new Date() };
    if (patch.target !== undefined) set.target = patch.target;
    if (patch.treatment !== undefined) set.treatment = patch.treatment;
    if (patch.category !== undefined) set.category = patch.category;
    if (patch.meaning !== undefined) set.meaning = patch.meaning;
    if (patch.variants !== undefined) set.variants = patch.variants;
    if (patch.notes !== undefined) set.notes = patch.notes;

    const [updated] = await this.db.update(schema.translationGlossary).set(set).where(eq(schema.translationGlossary.id, id)).returning();
    await this.markDependentsStale(this.db, projectId, [id]);
    return updated ?? entry;
  }

  async approveTerm(projectId: bigint, id: bigint, override: { target?: string; treatment?: Translation.Treatment } = {}): Promise<Translation.GlossaryEntry> {
    const entry = await this.requireTerm(projectId, id);
    const changed = (override.target !== undefined && override.target !== entry.target) || (override.treatment !== undefined && override.treatment !== entry.treatment);
    const set: Partial<typeof schema.translationGlossary.$inferInsert> = { status: 'approved', decidedAt: new Date(), updatedAt: new Date() };
    if (override.target !== undefined) set.target = override.target;
    if (override.treatment !== undefined) set.treatment = override.treatment;
    if (changed) set.revision = entry.revision + 1;

    const [updated] = await this.db.update(schema.translationGlossary).set(set).where(eq(schema.translationGlossary.id, id)).returning();
    if (changed) await this.markDependentsStale(this.db, projectId, [id]);
    return updated ?? entry;
  }

  /**
   * Marks the entry not-a-term and nothing more. Deliberately no revision bump and no staleness sweep:
   * bulk-rejecting the post-seed queue is the normal first action, and staling every chapter over it
   * would make the review queue unusable.
   */
  async rejectTerm(projectId: bigint, id: bigint): Promise<Translation.GlossaryEntry> {
    const entry = await this.requireTerm(projectId, id);
    const [updated] = await this.db
      .update(schema.translationGlossary)
      .set({ status: 'rejected', decidedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.translationGlossary.id, id))
      .returning();
    return updated ?? entry;
  }

  /**
   * Clearing the review queue is one decision, so it is one transaction: a partially applied batch would
   * leave the reviewer unable to tell which rows they still owe. The staleness sweep runs once at the end
   * over every entry whose target or treatment actually moved, rather than once per approval.
   *
   * Repeated ids collapse to the caller's last word for that entry — applying both would count the term
   * twice and compute the second revision from the pre-batch row, bumping it once for two edits.
   */
  async decideTerms(projectId: bigint, decisions: TermDecision[]): Promise<{ approved: number; rejected: number }> {
    await this.requireProject(projectId);
    const wanted = new Map(decisions.map(decision => [decision.id, decision]));
    const entries = await this.db.query.translationGlossary.findMany({
      where: and(eq(schema.translationGlossary.projectId, projectId), inArray(schema.translationGlossary.id, [...wanted.keys()])),
    });
    const byId = new Map(entries.map(entry => [entry.id, entry]));
    for (const id of wanted.keys()) if (!byId.has(id)) throw AppErrorCode.TRN_007.create();

    const now = new Date();
    const changed: bigint[] = [];
    let approved = 0;
    let rejected = 0;

    await this.db.transaction(async rawTx => {
      const tx = rawTx as unknown as PrimaryDatabase;
      for (const decision of wanted.values()) {
        const entry = byId.get(decision.id) as Translation.GlossaryEntry;
        const where = eq(schema.translationGlossary.id, decision.id);
        if (decision.decision === 'reject') {
          await tx.update(schema.translationGlossary).set({ status: 'rejected', decidedAt: now, updatedAt: now }).where(where);
          rejected++;
          continue;
        }

        const moved = (decision.target !== undefined && decision.target !== entry.target) || (decision.treatment !== undefined && decision.treatment !== entry.treatment);
        await tx
          .update(schema.translationGlossary)
          .set({
            status: 'approved',
            decidedAt: now,
            updatedAt: now,
            ...(decision.target !== undefined && { target: decision.target }),
            ...(decision.treatment !== undefined && { treatment: decision.treatment }),
            ...(moved && { revision: entry.revision + 1 }),
          })
          .where(where);
        if (moved) changed.push(decision.id);
        approved++;
      }
      await this.markDependentsStale(tx, projectId, changed);
    });

    return { approved, rejected };
  }

  /**
   * One query, never N+1: the pending-term count is a correlated scalar subquery over the GIN-indexed
   * `applied_terms` keys, so a 3,000-chapter novel costs one round trip per page rather than one per row.
   */
  async listChapters(projectId: bigint, filter: ChapterListFilter = {}): Promise<Page<TranslationChapterSummary>> {
    await this.requireProject(projectId);
    const limit = Math.min(filter.limit ?? 50, 200);
    const page = Math.max(filter.page ?? 1, 1);
    const conditions = [eq(schema.chapters.projectId, projectId), isNotNull(schema.chapters.originalContent)];
    if (filter.status) conditions.push(eq(schema.chapterTranslations.status, filter.status));
    if (filter.stale !== undefined) {
      const stale = sql`coalesce(${schema.chapterTranslations.glossaryStale} or ${schema.chapterTranslations.sourceStale}, false)`;
      conditions.push(filter.stale ? stale : sql`not ${stale}`);
    }
    const where = and(...conditions);
    const join = and(eq(schema.chapterTranslations.projectId, schema.chapters.projectId), eq(schema.chapterTranslations.chapter, schema.chapters.number));

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select({
          chapter: schema.chapters.number,
          originalTitle: schema.chapters.originalTitle,
          title: schema.chapterTranslations.title,
          status: schema.chapterTranslations.status,
          issueCount: sql<number>`coalesce(jsonb_array_length(${schema.chapterTranslations.issues}), 0)::int`,
          pendingTerms: sql<number>`(
            select count(*)::int
            from jsonb_object_keys(coalesce(${schema.chapterTranslations.appliedTerms}, '{}'::jsonb)) as applied(key)
            join translation_glossary g on g.id = applied.key::bigint and g.project_id = ${schema.chapters.projectId}
            where g.status = 'suggested'
          )`,
          glossaryStale: schema.chapterTranslations.glossaryStale,
          sourceStale: schema.chapterTranslations.sourceStale,
          revision: schema.chapterTranslations.revision,
          updatedAt: schema.chapterTranslations.updatedAt,
        })
        .from(schema.chapters)
        .leftJoin(schema.chapterTranslations, join)
        .where(where)
        .orderBy(asc(schema.chapters.number))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.chapters)
        .leftJoin(schema.chapterTranslations, join)
        .where(where),
    ]);

    const items = rows.map(row => ({
      ...row,
      glossaryStale: row.glossaryStale ?? false,
      sourceStale: row.sourceStale ?? false,
      revision: row.revision ?? 0,
    }));
    return { items, total: totalRow?.count ?? 0, page, limit };
  }

  async getChapter(projectId: bigint, chapter: number): Promise<TranslationChapterDetail> {
    await this.requireProject(projectId);
    const original = await this.db.query.chapters.findFirst({
      where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapter)),
      columns: { originalTitle: true, originalContent: true },
    });
    if (!original) throw AppErrorCode.TRN_012.create();
    const translation = await this.requireTranslation(projectId, chapter, AppErrorCode.TRN_002);

    return {
      chapter,
      original: { title: original.originalTitle, content: original.originalContent },
      translation,
      appliedTerms: await this.summarizeAppliedTerms(projectId, translation.appliedTerms),
    };
  }

  async editTranslation(projectId: bigint, chapter: number, edit: TranslationEdit): Promise<Translation.ChapterTranslation> {
    const translation = await this.requireTranslation(projectId, chapter, AppErrorCode.TRN_008);
    if (translation.status === 'finalized') throw AppErrorCode.TRN_004.create();

    const now = new Date();
    const set: Partial<typeof schema.chapterTranslations.$inferInsert> = { revision: translation.revision + 1, editedAt: now, updatedAt: now };
    if (edit.title !== undefined) set.title = sanitizeMarkdown(edit.title);
    if (edit.body !== undefined) set.body = sanitizeMarkdown(edit.body);

    const [updated] = await this.db.update(schema.chapterTranslations).set(set).where(eq(schema.chapterTranslations.id, translation.id)).returning();
    return updated ?? translation;
  }

  /**
   * The only path that writes canon. Every gate is checked before the transaction
   * opens, so a refusal costs no lock; the republish decision inside reuses the amend path's rule, which
   * schedules only when the reader-facing digest actually moved.
   */
  async finalize(projectId: bigint, chapter: number): Promise<FinalizeResult> {
    const translation = await this.requireTranslation(projectId, chapter, AppErrorCode.TRN_008);
    if (translation.status === 'failed') throw AppErrorCode.TRN_008.create();
    if (translation.status === 'finalized') throw AppErrorCode.TRN_004.create();

    const pending = await this.countPendingTerms(projectId, translation.appliedTerms);
    if (pending > 0) throw AppErrorCode.TRN_005.create({ count: pending });
    if (translation.glossaryStale) throw AppErrorCode.TRN_006.create();
    if (translation.sourceStale) throw AppErrorCode.TRN_011.create();

    const { wordCount, decision } = await this.db.transaction(async rawTx => {
      const tx = rawTx as unknown as PrimaryDatabase;
      const now = new Date();
      const wordCount = countWords(translation.body);
      const [committed] = await tx
        .update(schema.chapters)
        .set({ title: translation.title, content: translation.body, wordCount, locked: true, updatedAt: now })
        .where(and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapter)))
        .returning();
      if (!committed) throw AppErrorCode.TRN_012.create();

      await tx.update(schema.chapterTranslations).set({ status: 'finalized', finalizedAt: now, updatedAt: now }).where(eq(schema.chapterTranslations.id, translation.id));

      return { wordCount, decision: await applyAmendRepublish(tx, projectId, chapter, renderChapterPayload(committed)) };
    });

    this.logger.info('translated chapter finalized', { projectId, chapter, wordCount, republish: decision });
    return { chapter, wordCount, republished: decision.republish, ...(decision.republish && { publicationRevision: decision.revision }) };
  }

  /** `chapters.content` and `locked` survive: the last finalized text stays canonical (and published) until the next finalize replaces it. */
  async reopen(projectId: bigint, chapter: number): Promise<Translation.ChapterTranslation> {
    const translation = await this.requireTranslation(projectId, chapter, AppErrorCode.TRN_008);
    if (translation.status !== 'finalized') return translation;

    const [reopened] = await this.db
      .update(schema.chapterTranslations)
      .set({ status: 'translated', finalizedAt: null, updatedAt: new Date() })
      .where(eq(schema.chapterTranslations.id, translation.id))
      .returning();
    return reopened ?? translation;
  }

  async renderManuscript(projectId: bigint): Promise<TranslationManuscript> {
    await this.requireProject(projectId);
    const [finalized, originals] = await Promise.all([
      this.db.query.chapterTranslations.findMany({
        where: and(eq(schema.chapterTranslations.projectId, projectId), eq(schema.chapterTranslations.status, 'finalized')),
        orderBy: [asc(schema.chapterTranslations.chapter)],
        columns: { chapter: true, title: true, body: true },
      }),
      this.db
        .select({ chapter: schema.chapters.number })
        .from(schema.chapters)
        .where(and(eq(schema.chapters.projectId, projectId), isNotNull(schema.chapters.originalContent)))
        .orderBy(asc(schema.chapters.number)),
    ]);

    const done = new Set(finalized.map(row => row.chapter));
    return {
      markdown: finalized.map(row => `# ${row.title ?? `Chapter ${row.chapter}`}\n\n${row.body}`).join('\n\n'),
      pendingChapters: originals.map(row => row.chapter).filter(chapter => !done.has(chapter)),
    };
  }

  /** The kind gate every route funnels through — a non-translation project must never read as an empty translation. */
  private async requireProject(projectId: bigint) {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    if (project.kind !== 'translation') throw AppErrorCode.TRN_003.create();
    return project;
  }

  private async requireTerm(projectId: bigint, id: bigint): Promise<Translation.GlossaryEntry> {
    await this.requireProject(projectId);
    const entry = await this.db.query.translationGlossary.findFirst({
      where: and(eq(schema.translationGlossary.projectId, projectId), eq(schema.translationGlossary.id, id)),
    });
    if (!entry) throw AppErrorCode.TRN_007.create();
    return entry;
  }

  private async requireTranslation(projectId: bigint, chapter: number, absent: AppErrorCode): Promise<Translation.ChapterTranslation> {
    await this.requireProject(projectId);
    const translation = await this.db.query.chapterTranslations.findFirst({
      where: and(eq(schema.chapterTranslations.projectId, projectId), eq(schema.chapterTranslations.chapter, chapter)),
    });
    if (!translation) throw absent.create();
    return translation;
  }

  /** `jsonb_exists_any` rather than the `?|` operator: `?` collides with the driver's parameter placeholder. */
  private async markDependentsStale(tx: DbExecutor, projectId: bigint, ids: bigint[]): Promise<void> {
    if (ids.length === 0) return;
    const keys = sql.join(
      ids.map(id => sql`${id.toString()}`),
      sql`, `,
    );
    await tx
      .update(schema.chapterTranslations)
      .set({ glossaryStale: true, updatedAt: new Date() })
      .where(and(eq(schema.chapterTranslations.projectId, projectId), sql`jsonb_exists_any(${schema.chapterTranslations.appliedTerms}, ARRAY[${keys}]::text[])`));
  }

  private async countPendingTerms(projectId: bigint, appliedTerms: Record<string, number> | null): Promise<number> {
    const ids = Object.keys(appliedTerms ?? {});
    if (ids.length === 0) return 0;
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.translationGlossary)
      .where(and(eq(schema.translationGlossary.projectId, projectId), inArray(schema.translationGlossary.id, ids.map(BigInt)), eq(schema.translationGlossary.status, 'suggested')));
    return row?.count ?? 0;
  }

  private async summarizeAppliedTerms(projectId: bigint, appliedTerms: Record<string, number> | null): Promise<AppliedTermSummary[]> {
    const applied = appliedTerms ?? {};
    const ids = Object.keys(applied);
    if (ids.length === 0) return [];
    const entries = await this.db.query.translationGlossary.findMany({
      where: and(eq(schema.translationGlossary.projectId, projectId), inArray(schema.translationGlossary.id, ids.map(BigInt))),
      orderBy: [asc(schema.translationGlossary.sourceTerm)],
      columns: { id: true, sourceTerm: true, target: true, status: true, revision: true },
    });
    return entries.map(entry => {
      const appliedRevision = applied[entry.id.toString()] ?? 0;
      return { ...entry, appliedRevision, stale: entry.revision !== appliedRevision };
    });
  }

  /**
   * Catches the paste that would otherwise be "translated" from English to English. Only meaningful for a
   * non-Latin source script: plain ASCII prose is not itself evidence of a language, so a Latin-script
   * project skips the check rather than guessing.
   */
  private assertOriginalText(content: string, language: string | null): void {
    if (content.length === 0) throw new ValidationError('content', 'Original chapter text is empty');
    const profile = scriptProfileFor(language);
    if (profile === LATIN_PROFILE) return;
    if (scriptRatio(content, profile) >= MIN_SOURCE_SCRIPT_RATIO) return;
    throw new ValidationError('content', `This does not look like ${language}. Paste the original, not a translation.`);
  }
}
