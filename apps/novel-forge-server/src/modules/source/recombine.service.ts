/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';
import { and, asc, eq, isNotNull, lt, sql } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Chapter, type PrimaryDatabase, type Project, schema } from '@server/database';

import { type AmbiguousBoundary, type ChapterLike, type RecombinePlan, buildGroupingPlan } from './title-parts';

/**
 * Defining types
 */

export interface RecombineOptions {
  dryRun?: boolean;
  useAi?: boolean;
}

export interface MergedChapterSummary {
  number: number;
  title: string | null;
  parts: number;
}

export interface RecombineResult {
  applied: boolean;
  before: number;
  after: number;
  merged: MergedChapterSummary[];
  ambiguous: AmbiguousBoundary[];
}

interface LoadedChapter extends ChapterLike {
  row: Chapter.Row;
}

/**
 * Declaring the constants
 */

function countWords(text: string | null): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Merges translator-split chapter parts back into original source chapters (recombine design):
 * deterministic title-driven grouping, transactional merge + contiguous renumbering, with a
 * dry-run mode and a derived-data guard — chapter numbers are referenced by extraction, briefs,
 * and conversions, so renumbering is only legal before any of them exist.
 */
@Injectable()
export class RecombineService {
  private readonly logger = Logger.getLogger(APP_NAME, RecombineService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async recombine(projectId: bigint, options: RecombineOptions = {}): Promise<RecombineResult> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw new ServerError(AppErrorCode.PRJ_001);
    if (project.kind !== 'source') throw new ServerError(AppErrorCode.PRJ_003);

    const chapters = await this.loadChapters(projectId);
    const plan = await this.buildPlan(projectId, chapters, options.useAi ?? false, project);
    if (options.dryRun) return this.toResult(plan, false);

    if (!project.scrapeComplete) throw new ServerError(AppErrorCode.SRC_002);
    await this.assertNoDerivedData(projectId);
    if (plan.after === plan.before) return this.toResult(plan, false);

    await this.apply(projectId, plan);
    this.logger.info('recombined translator chapters', { projectId: String(projectId), before: plan.before, after: plan.after });
    return this.toResult(plan, true);
  }

  /**
   * Pipeline hook (ingest completion, rebrand phase 1.5): recombines when legal, quietly no-ops when
   * the guards say otherwise — automatic hygiene must never fail a job.
   */
  async autoRecombine(projectId: bigint): Promise<RecombineResult | null> {
    try {
      return await this.recombine(projectId, { useAi: true });
    } catch (err) {
      this.logger.warn('autoRecombine skipped', { projectId: String(projectId), reason: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  private async loadChapters(projectId: bigint): Promise<LoadedChapter[]> {
    const rows = await this.db.query.chapters.findMany({ where: eq(schema.chapters.projectId, projectId), orderBy: [asc(schema.chapters.number)] });
    return rows.map(row => ({ number: row.number, title: row.title, words: row.wordCount ?? countWords(row.content), row }));
  }

  // RC2 extends this with the AI boundary-resolution call; deterministic grouping only for now.
  private async buildPlan(projectId: bigint, chapters: LoadedChapter[], useAi: boolean, project: Project.Row): Promise<RecombinePlan> {
    void projectId;
    void useAi;
    void project;
    return buildGroupingPlan(chapters);
  }

  /** Renumbering corrupts anything keyed by chapter number — refuse once derived data exists. */
  private async assertNoDerivedData(projectId: bigint): Promise<void> {
    const [extracted, appearances, beats, chunks, briefs, conversions, drafts] = await Promise.all([
      this.db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), isNotNull(schema.chapters.summary)), columns: { id: true } }),
      this.db.query.entityAppearances.findFirst({ where: eq(schema.entityAppearances.projectId, projectId), columns: { chapter: true } }),
      this.db.query.beats.findFirst({ where: eq(schema.beats.projectId, projectId), columns: { id: true } }),
      this.db.query.chapterChunks.findFirst({ where: eq(schema.chapterChunks.projectId, projectId), columns: { id: true } }),
      this.db.query.briefs.findFirst({ where: eq(schema.briefs.projectId, projectId), columns: { id: true } }),
      this.db.query.chapterConversions.findFirst({ where: eq(schema.chapterConversions.projectId, projectId), columns: { id: true } }),
      this.db.query.drafts.findFirst({ where: eq(schema.drafts.projectId, projectId), columns: { id: true } }),
    ]);
    if (extracted || appearances || beats || chunks || briefs || conversions || drafts) throw new ServerError(AppErrorCode.SRC_003);
  }

  private async apply(projectId: bigint, plan: RecombinePlan): Promise<void> {
    await this.db.transaction(async tx => {
      for (const [index, group] of plan.groups.entries()) {
        const newNumber = index + 1;
        const members = group.members as LoadedChapter[];
        const winner = members[0] as LoadedChapter;

        if (members.length > 1) {
          const content = members.map(m => m.row.content ?? '').join('\n\n');
          const mergedFrom: Chapter.MergedPart[] = members.map(m => ({ number: m.number, title: m.title, words: m.words, url: m.row.url }));
          await tx
            .update(schema.chapters)
            .set({ content, title: group.title, wordCount: countWords(content), mergedFrom, updatedAt: new Date() })
            .where(and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, winner.number)));

          for (const absorbed of members.slice(1)) {
            await tx.delete(schema.chapters).where(and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, absorbed.number)));
          }
        }

        // Phase 1 of the renumber: park survivors on negative numbers so the (projectId, number)
        // unique constraint never collides mid-shuffle; phase 2 below flips them all at once.
        if (winner.number !== newNumber) {
          await tx
            .update(schema.chapters)
            .set({ number: -newNumber })
            .where(and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, winner.number)));
        }
      }

      await tx
        .update(schema.chapters)
        .set({ number: sql`-${schema.chapters.number}`, updatedAt: new Date() })
        .where(and(eq(schema.chapters.projectId, projectId), lt(schema.chapters.number, 0)));

      await tx
        .update(schema.projects)
        .set({ scrapeNextNumber: plan.after + 1, updatedAt: new Date() })
        .where(eq(schema.projects.id, projectId));
    });
  }

  private toResult(plan: RecombinePlan, applied: boolean): RecombineResult {
    const merged: MergedChapterSummary[] = [];
    for (const [index, group] of plan.groups.entries()) {
      if (group.members.length > 1) merged.push({ number: index + 1, title: group.title, parts: group.members.length });
    }
    return { applied, before: plan.before, after: plan.after, merged, ambiguous: plan.ambiguous };
  }
}
