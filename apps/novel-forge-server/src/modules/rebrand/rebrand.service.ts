/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Rebrand, schema } from '@server/database';

import { ContextAssembler } from '../ai/context/context-assembler.service';
import { truncateAtParagraph } from '../ai/context/token-budget';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { PROMPT_REGISTRY } from '../ai/prompts';
import { type RebrandGlossarySeedOutput } from '../ai/schemas';

/**
 * Defining types
 */

export interface RebrandConfigUpdate {
  directives?: string | null;
  settings?: Rebrand.Settings;
}

export interface RebrandStatusResult {
  rebrand: Rebrand.Row;
  sourceChapters: number;
  glossaryCount: number;
  counts: { converted: number; attention: number; failed: number };
}

export interface GlossaryListFilter {
  category?: Rebrand.GlossaryCategory;
  page?: number;
  limit?: number;
}

export interface SeedGlossaryResult {
  seeded: boolean;
  mappings: number;
}

/**
 * Declaring the constants
 */

const OPENING_CHAPTER_COUNT = 3;
const OPENING_CHAPTER_TOKENS = 1_500;

@Injectable()
export class RebrandService {
  private readonly logger = Logger.getLogger(APP_NAME, RebrandService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly contextAssembler: ContextAssembler,
    private readonly modelRouter: ModelRouterService,
    private readonly workflowRunService: WorkflowRunService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** Upsert-on-read: the rebrand row exists from the first touch, so config and status never 404. */
  async getOrCreate(projectId: bigint): Promise<Rebrand.Row> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    if (project.kind !== 'source') throw AppErrorCode.RBR_003.create();

    const existing = await this.db.query.rebrands.findFirst({ where: eq(schema.rebrands.projectId, projectId) });
    if (existing) return existing;

    const [inserted] = await this.db.insert(schema.rebrands).values({ projectId }).onConflictDoNothing().returning();
    if (inserted) return inserted;
    const raced = await this.db.query.rebrands.findFirst({ where: eq(schema.rebrands.projectId, projectId) });
    if (!raced) throw AppErrorCode.RBR_001.create();
    return raced;
  }

  async updateConfig(projectId: bigint, update: RebrandConfigUpdate): Promise<Rebrand.Row> {
    const rebrand = await this.getOrCreate(projectId);
    const set: Partial<typeof schema.rebrands.$inferInsert> = { updatedAt: new Date() };
    if (update.directives !== undefined) set.directives = update.directives;
    if (update.settings !== undefined) set.settings = update.settings;
    this.logger.info('rebrand config updated', { projectId, directivesChanged: update.directives !== undefined, settingsChanged: update.settings !== undefined });
    this.logger.debug('rebrand config payload', { projectId, directives: update.directives, settings: update.settings });
    const [updated] = await this.db.update(schema.rebrands).set(set).where(eq(schema.rebrands.id, rebrand.id)).returning();
    return updated ?? rebrand;
  }

  async status(projectId: bigint): Promise<RebrandStatusResult> {
    const rebrand = await this.getOrCreate(projectId);
    const [statusRows, [chapterCount], [glossaryCount]] = await Promise.all([
      this.db
        .select({ status: schema.chapterConversions.status, count: sql<number>`count(*)::int` })
        .from(schema.chapterConversions)
        .where(eq(schema.chapterConversions.projectId, projectId))
        .groupBy(schema.chapterConversions.status),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.chapters)
        .where(eq(schema.chapters.projectId, projectId)),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.rebrandGlossary)
        .where(eq(schema.rebrandGlossary.projectId, projectId)),
    ]);

    const counts = { converted: 0, attention: 0, failed: 0 };
    for (const row of statusRows) counts[row.status] = row.count;

    return { rebrand, sourceChapters: chapterCount?.count ?? 0, glossaryCount: glossaryCount?.count ?? 0, counts };
  }

  async listGlossary(projectId: bigint, filter: GlossaryListFilter = {}): Promise<Rebrand.GlossaryEntry[]> {
    const limit = Math.min(filter.limit ?? 100, 500);
    const offset = ((filter.page ?? 1) - 1) * limit;
    const where = filter.category
      ? and(eq(schema.rebrandGlossary.projectId, projectId), eq(schema.rebrandGlossary.category, filter.category))
      : eq(schema.rebrandGlossary.projectId, projectId);
    return this.db.query.rebrandGlossary.findMany({ where, orderBy: [asc(schema.rebrandGlossary.sourceName)], limit, offset });
  }

  /** Per-chapter status summaries for the UI list — bodies stay out, they're fetched per chapter. */
  async listConversions(
    projectId: bigint,
  ): Promise<{ chapter: number; title: string | null; status: Rebrand.ConversionStatus; issueCount: number; revision: number; updatedAt: Date }[]> {
    const rows = await this.db.query.chapterConversions.findMany({
      where: eq(schema.chapterConversions.projectId, projectId),
      orderBy: [asc(schema.chapterConversions.chapter)],
      columns: { chapter: true, title: true, status: true, issues: true, revision: true, updatedAt: true },
    });
    return rows.map(r => ({
      chapter: r.chapter,
      title: r.title,
      status: r.status,
      issueCount: Array.isArray(r.issues) ? r.issues.length : 0,
      revision: r.revision,
      updatedAt: r.updatedAt,
    }));
  }

  async getConversion(projectId: bigint, chapter: number): Promise<Rebrand.Conversion> {
    const conversion = await this.db.query.chapterConversions.findFirst({
      where: and(eq(schema.chapterConversions.projectId, projectId), eq(schema.chapterConversions.chapter, chapter)),
    });
    if (!conversion) throw AppErrorCode.RBR_002.create();
    return conversion;
  }

  /** The converted manuscript; `attention` rows are included — flagged, not blocked (design §1). */
  async renderManuscript(projectId: bigint): Promise<string> {
    const conversions = await this.db.query.chapterConversions.findMany({
      where: and(eq(schema.chapterConversions.projectId, projectId), ne(schema.chapterConversions.status, 'failed')),
      orderBy: [asc(schema.chapterConversions.chapter)],
    });
    return conversions.map(c => `# ${c.title ?? `Chapter ${c.chapter}`}\n\n${c.body}`).join('\n\n---\n\n');
  }

  /**
   * Seeds the world notes and initial name mappings (rebrand design §2). Idempotent: a rebrand with
   * worldNotes already set is a no-op, so job resume never re-seeds or re-bills.
   */
  async seedGlossary(projectId: bigint, jobId?: string): Promise<SeedGlossaryResult> {
    const rebrand = await this.getOrCreate(projectId);
    if (rebrand.worldNotes) {
      this.logger.debug('seedGlossary: worldNotes already present — skipping (idempotent)', { projectId, jobId });
      return { seeded: false, mappings: 0 };
    }
    this.logger.info('seedGlossary: seeding world notes and name mappings', { projectId, jobId });

    const [project, pack, openingRows] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.contextAssembler.forRebrandSeed(projectId),
      this.db.query.chapters.findMany({ where: eq(schema.chapters.projectId, projectId), orderBy: [asc(schema.chapters.number)], limit: OPENING_CHAPTER_COUNT }),
    ]);
    const openingChapters = openingRows
      .map(ch => `Chapter ${ch.number}${ch.title ? ` — ${ch.title}` : ''}:\n${truncateAtParagraph(ch.content ?? '', OPENING_CHAPTER_TOKENS).text}`)
      .join('\n\n---\n\n');

    const prompt = PROMPT_REGISTRY['rebrand-glossary'];
    const { result } = await this.workflowRunService.runChain(projectId, 'rebrand-glossary', 'seed', { jobId }, async runId => {
      if (pack.id) await this.workflowRunService.linkContextPack(runId, pack.id);
      const ctx = { projectId, runId, node: 'seedGlossary', promptKey: prompt.key, promptVersion: prompt.version, role: 'rebrand' };
      const output = (await this.modelRouter.structured(prompt, { contextPack: pack.rendered, openingChapters }, ctx, project as ProjectConfig)) as RebrandGlossarySeedOutput;

      await this.db.update(schema.rebrands).set({ worldNotes: output.worldNotes, updatedAt: new Date() }).where(eq(schema.rebrands.id, rebrand.id));
      if (output.mappings.length > 0) {
        await this.db
          .insert(schema.rebrandGlossary)
          .values(
            output.mappings.map(m => ({
              projectId,
              sourceName: m.sourceName,
              variants: m.variants ?? null,
              replacement: m.replacement,
              category: m.category,
              notes: m.notes ?? null,
              createdChapter: 0,
            })),
          )
          .onConflictDoNothing();
      }
      return { seeded: true, mappings: output.mappings.length };
    });

    this.logger.info('rebrand glossary seeded', { projectId, mappings: result.mappings });
    return result;
  }
}
