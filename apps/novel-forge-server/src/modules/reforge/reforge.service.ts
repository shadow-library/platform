import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Reforge, type ReforgeTransform, schema } from '@server/database';

export interface ReforgeConfigUpdate {
  instructions?: string | null;
  fidelity?: Reforge.Fidelity;
  mode?: Reforge.Mode;
  settings?: Reforge.Settings;
}

export interface ReforgeTransformStatus {
  /** Absent until the project has a plan at all — never null, so the response schema stays a plain object. */
  plan?: {
    id: bigint;
    revision: number;
    status: ReforgeTransform.PlanStatus;
    sourceChapterCount: number;
    outputChapterCount: number;
    approvedAt: Date | null;
    promotedProjectId: bigint | null;
  };
  counts: { written: number; attention: number; failed: number };
  cuts: number;
}

export interface ReforgeStatusResult {
  reforge: Reforge.Row;
  sourceChapters: number;
  glossaryCount: number;
  counts: { reforged: number; attention: number; failed: number };
  transform?: ReforgeTransformStatus;
}

export interface ReforgeOutputSummary {
  outputChapter: number;
  spanOrdinal: number;
  fromChapter: number;
  toChapter: number;
  indexInSpan: number;
  title: string | null;
  status: ReforgeTransform.OutputStatus;
  issueCount: number;
  wordCount: number | null;
  revision: number;
  updatedAt: Date;
}

export interface ReforgeSummary {
  chapter: number;
  title: string | null;
  status: Reforge.ChapterStatus;
  issueCount: number;
  wordCount: number | null;
  revision: number;
  updatedAt: Date;
}

@Injectable()
export class ReforgeService {
  private readonly logger = Logger.getLogger(APP_NAME, ReforgeService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** Upsert-on-read: the reforge row exists from the first touch, so config and status never 404. */
  async getOrCreate(projectId: bigint): Promise<Reforge.Row> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    if (project.kind !== 'source') throw AppErrorCode.REF_003.create();

    const existing = await this.db.query.reforges.findFirst({ where: eq(schema.reforges.projectId, projectId) });
    if (existing) return existing;

    const [inserted] = await this.db.insert(schema.reforges).values({ projectId }).onConflictDoNothing().returning();
    if (inserted) return inserted;
    const raced = await this.db.query.reforges.findFirst({ where: eq(schema.reforges.projectId, projectId) });
    if (!raced) throw AppErrorCode.REF_001.create();
    return raced;
  }

  async updateConfig(projectId: bigint, update: ReforgeConfigUpdate): Promise<Reforge.Row> {
    const reforge = await this.getOrCreate(projectId);
    const set: Partial<typeof schema.reforges.$inferInsert> = { updatedAt: new Date() };
    if (update.instructions !== undefined) set.instructions = update.instructions;
    if (update.fidelity !== undefined) set.fidelity = update.fidelity;
    if (update.mode !== undefined) set.mode = update.mode;
    if (update.settings !== undefined) set.settings = update.settings;

    // Transform requires and forces `loose`: the plan subsumes the within-chapter latitude the fidelity
    // enum expresses, so any other value is a config the writer could not honour (design §7).
    const mode = update.mode ?? reforge.mode;
    if (mode === 'transform') {
      if (update.fidelity !== undefined && update.fidelity !== 'loose') throw AppErrorCode.REF_008.create();
      set.fidelity = 'loose';
    }

    this.logger.info('reforge config updated', {
      projectId,
      instructionsChanged: update.instructions !== undefined,
      fidelityChanged: update.fidelity !== undefined,
      modeChanged: update.mode !== undefined,
      settingsChanged: update.settings !== undefined,
    });
    this.logger.debug('reforge config payload', { projectId, instructions: update.instructions, fidelity: update.fidelity, settings: update.settings });
    const [updated] = await this.db.update(schema.reforges).set(set).where(eq(schema.reforges.id, reforge.id)).returning();
    return updated ?? reforge;
  }

  async status(projectId: bigint): Promise<ReforgeStatusResult> {
    const reforge = await this.getOrCreate(projectId);
    const [statusRows, [chapterCount], [glossaryCount]] = await Promise.all([
      this.db
        .select({ status: schema.chapterReforges.status, count: sql<number>`count(*)::int` })
        .from(schema.chapterReforges)
        .where(eq(schema.chapterReforges.projectId, projectId))
        .groupBy(schema.chapterReforges.status),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.chapters)
        .where(eq(schema.chapters.projectId, projectId)),
      // The rename bible is shared with rebrand; the glossary count reflects the same table.
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.rebrandGlossary)
        .where(eq(schema.rebrandGlossary.projectId, projectId)),
    ]);

    const counts = { reforged: 0, attention: 0, failed: 0 };
    for (const row of statusRows) counts[row.status] = row.count;

    const result: ReforgeStatusResult = { reforge, sourceChapters: chapterCount?.count ?? 0, glossaryCount: glossaryCount?.count ?? 0, counts };
    // The two modes write different tables (design §5); chapter mode's response is untouched by the
    // transform tables' existence, and transform mode reads its progress off the plan's outputs.
    if (reforge.mode === 'transform') result.transform = await this.transformStatus(projectId);
    return result;
  }

  private async transformStatus(projectId: bigint): Promise<ReforgeTransformStatus> {
    const plan = await this.latestPlan(projectId);
    const counts = { written: 0, attention: 0, failed: 0 };
    if (!plan) return { counts, cuts: 0 };

    const [statusRows, [cutCount]] = await Promise.all([
      this.db
        .select({ status: schema.reforgeOutputs.status, count: sql<number>`count(*)::int` })
        .from(schema.reforgeOutputs)
        .where(eq(schema.reforgeOutputs.planId, plan.id))
        .groupBy(schema.reforgeOutputs.status),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.reforgeCuts)
        .where(eq(schema.reforgeCuts.planId, plan.id)),
    ]);
    for (const row of statusRows) counts[row.status] = row.count;

    return {
      plan: {
        id: plan.id,
        revision: plan.revision,
        status: plan.status,
        sourceChapterCount: plan.sourceChapterCount,
        outputChapterCount: plan.outputChapterCount,
        approvedAt: plan.approvedAt,
        promotedProjectId: plan.promotedProjectId,
      },
      counts,
      cuts: cutCount?.count ?? 0,
    };
  }

  /** The newest revision, whatever its status — an output written under a superseded plan is stale, not current. */
  private latestPlan(projectId: bigint): Promise<ReforgeTransform.Plan | undefined> {
    return this.db.query.reforgePlans.findFirst({ where: eq(schema.reforgePlans.projectId, projectId), orderBy: [desc(schema.reforgePlans.revision)] });
  }

  async listOutputs(projectId: bigint): Promise<ReforgeOutputSummary[]> {
    const plan = await this.latestPlan(projectId);
    if (!plan) return [];
    const rows = await this.db.query.reforgeOutputs.findMany({
      where: eq(schema.reforgeOutputs.planId, plan.id),
      orderBy: [asc(schema.reforgeOutputs.outputChapter)],
    });
    return rows.map(r => ({
      outputChapter: r.outputChapter,
      spanOrdinal: r.spanOrdinal,
      fromChapter: r.fromChapter,
      toChapter: r.toChapter,
      indexInSpan: r.indexInSpan,
      title: r.title,
      status: r.status,
      issueCount: Array.isArray(r.issues) ? r.issues.length : 0,
      wordCount: r.wordCount,
      revision: r.revision,
      updatedAt: r.updatedAt,
    }));
  }

  async getOutput(projectId: bigint, outputChapter: number): Promise<ReforgeTransform.Output> {
    const plan = await this.latestPlan(projectId);
    const output = plan
      ? await this.db.query.reforgeOutputs.findFirst({ where: and(eq(schema.reforgeOutputs.planId, plan.id), eq(schema.reforgeOutputs.outputChapter, outputChapter)) })
      : undefined;
    if (!output) throw AppErrorCode.REF_007.create();
    return output;
  }

  async listCuts(projectId: bigint): Promise<ReforgeTransform.Cut[]> {
    const plan = await this.latestPlan(projectId);
    if (!plan) return [];
    return this.db.query.reforgeCuts.findMany({
      where: eq(schema.reforgeCuts.planId, plan.id),
      orderBy: [asc(schema.reforgeCuts.effectiveFromOutput), asc(schema.reforgeCuts.cutKey)],
    });
  }

  async listReforges(projectId: bigint): Promise<ReforgeSummary[]> {
    const rows = await this.db.query.chapterReforges.findMany({
      where: eq(schema.chapterReforges.projectId, projectId),
      orderBy: [asc(schema.chapterReforges.chapter)],
      columns: { chapter: true, title: true, status: true, issues: true, wordCount: true, revision: true, updatedAt: true },
    });
    return rows.map(r => ({
      chapter: r.chapter,
      title: r.title,
      status: r.status,
      issueCount: Array.isArray(r.issues) ? r.issues.length : 0,
      wordCount: r.wordCount,
      revision: r.revision,
      updatedAt: r.updatedAt,
    }));
  }

  async getReforge(projectId: bigint, chapter: number): Promise<Reforge.Chapter> {
    const reforge = await this.db.query.chapterReforges.findFirst({
      where: and(eq(schema.chapterReforges.projectId, projectId), eq(schema.chapterReforges.chapter, chapter)),
    });
    if (!reforge) throw AppErrorCode.REF_002.create();
    return reforge;
  }

  /** A gap is never silent: a failed chapter is both reported in `failedChapters` and called out inline. Transform mode is untouched — it never fails a chapter silently the same way, so it always reports none. */
  async renderManuscript(projectId: bigint): Promise<{ markdown: string; failedChapters: number[] }> {
    const reforge = await this.db.query.reforges.findFirst({ where: eq(schema.reforges.projectId, projectId) });
    if (reforge?.mode === 'transform') return { markdown: await this.renderTransformManuscript(projectId), failedChapters: [] };

    const reforges = await this.db.query.chapterReforges.findMany({
      where: eq(schema.chapterReforges.projectId, projectId),
      orderBy: [asc(schema.chapterReforges.chapter)],
    });
    const failedChapters = reforges.filter(r => r.status === 'failed').map(r => r.chapter);
    const body = reforges
      .filter(r => r.status !== 'failed')
      .map(r => `# ${r.title ?? `Chapter ${r.chapter}`}\n\n${r.body}`)
      .join('\n\n---\n\n');
    const markdown = failedChapters.length > 0 ? `<!-- WARNING: chapter(s) ${failedChapters.join(', ')} failed reforging and are missing below -->\n\n${body}` : body;
    return { markdown, failedChapters };
  }

  private async renderTransformManuscript(projectId: bigint): Promise<string> {
    const plan = await this.latestPlan(projectId);
    if (!plan) return '';
    const outputs = await this.db.query.reforgeOutputs.findMany({
      where: and(eq(schema.reforgeOutputs.planId, plan.id), ne(schema.reforgeOutputs.status, 'failed')),
      orderBy: [asc(schema.reforgeOutputs.outputChapter)],
    });
    return outputs.map(o => `# ${o.title ?? `Chapter ${o.outputChapter}`}\n\n${o.body}`).join('\n\n---\n\n');
  }
}
