/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { and, asc, eq, isNotNull, lt, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Chapter, type PrimaryDatabase, type Project, schema } from '@server/database';

import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { PROMPT_REGISTRY } from '../ai/prompts';
import { type RecombineOutput } from '../ai/schemas';
import { type AmbiguousBoundary, applyBoundaryMerges, buildGroupingPlan, type ChapterLike, type RecombinePlan } from './title-parts';

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

const MAX_BOUNDARIES_PER_CALL = 50;
const EXCERPT_CHARS = 300;

function countWords(text: string | null): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
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

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly modelRouter: ModelRouterService,
    private readonly workflowRunService: WorkflowRunService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async recombine(projectId: bigint, options: RecombineOptions = {}): Promise<RecombineResult> {
    this.logger.debug('recombine: starting', { projectId, dryRun: options.dryRun ?? false, useAi: options.useAi ?? false });
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    if (project.kind !== 'source') throw AppErrorCode.PRJ_003.create();

    const chapters = await this.loadChapters(projectId);
    const plan = await this.buildPlan(projectId, chapters, options.useAi ?? false, project);
    this.logger.debug('recombine: plan built', { projectId, before: plan.before, after: plan.after, groups: plan.groups.length, ambiguous: plan.ambiguous.length });
    if (options.dryRun) {
      this.logger.debug('recombine: dry-run — not applying', { projectId });
      return this.toResult(plan, false);
    }

    // Chapters are supplied externally for a source project — nothing to recombine until at least one exists.
    if (chapters.length === 0) throw AppErrorCode.SRC_002.create();
    await this.assertNoDerivedData(projectId);
    if (plan.after === plan.before) {
      this.logger.debug('recombine: no merges to apply (before == after)', { projectId, before: plan.before });
      return this.toResult(plan, false);
    }

    await this.apply(projectId, plan);
    this.logger.info('recombined translator chapters', { projectId, before: plan.before, after: plan.after, merged: plan.before - plan.after });
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
      this.logger.warn('autoRecombine skipped', { projectId, reason: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  private async loadChapters(projectId: bigint): Promise<LoadedChapter[]> {
    const rows = await this.db.query.chapters.findMany({ where: eq(schema.chapters.projectId, projectId), orderBy: [asc(schema.chapters.number)] });
    return rows.map(row => ({ number: row.number, title: row.title, words: row.wordCount ?? countWords(row.content), row }));
  }

  private async buildPlan(projectId: bigint, chapters: LoadedChapter[], useAi: boolean, project: Project.Row): Promise<RecombinePlan> {
    const plan = buildGroupingPlan(chapters);
    if (!useAi || plan.ambiguous.length === 0) return plan;

    // An AI failure falls back to the deterministic plan — every unresolved boundary defaults to
    // split, which is always the safe direction (recombine design §3).
    try {
      this.logger.debug('buildPlan: resolving ambiguous boundaries with AI', { projectId, ambiguous: plan.ambiguous.length });
      const mergeAfter = await this.resolveBoundaries(projectId, chapters, plan.ambiguous, project);
      this.logger.debug('buildPlan: AI resolved boundaries to merge', { projectId, mergeAfter });
      return applyBoundaryMerges(plan, mergeAfter);
    } catch (err) {
      this.logger.warn('AI boundary resolution failed — keeping the deterministic plan', { projectId, err });
      return plan;
    }
  }

  private async resolveBoundaries(projectId: bigint, chapters: LoadedChapter[], ambiguous: AmbiguousBoundary[], project: Project.Row): Promise<number[]> {
    const prompt = PROMPT_REGISTRY['recombine'];
    const mergeAfter: number[] = [];

    for (const batch of chunk(ambiguous, MAX_BOUNDARIES_PER_CALL)) {
      const boundaries = this.renderBoundaries(batch, chapters);
      const valid = new Set(batch.map(b => b.afterNumber));

      const { result } = await this.workflowRunService.runChain(projectId, 'recombine', 'boundaries', { boundaries: batch.length }, async runId => {
        const ctx = { projectId, runId, node: 'resolveBoundaries', promptKey: prompt.key, promptVersion: prompt.version, role: 'skeleton' };
        return (await this.modelRouter.structured(prompt, { boundaries }, ctx, project as ProjectConfig)) as RecombineOutput;
      });

      // Verdicts for boundaries the ladder already decided are ignored — the model only ever joins
      // what deterministic parsing left separate, never the other way around.
      for (const decision of result.decisions) {
        if (decision.verdict === 'merge' && valid.has(decision.afterChapter)) mergeAfter.push(decision.afterChapter);
      }
    }

    return mergeAfter;
  }

  private renderBoundaries(batch: AmbiguousBoundary[], chapters: LoadedChapter[]): string {
    const indexByNumber = new Map(chapters.map((c, i) => [c.number, i]));
    return batch
      .map(boundary => {
        const prevIndex = indexByNumber.get(boundary.afterNumber) ?? -1;
        const prev = chapters[prevIndex];
        const next = chapters[prevIndex + 1];
        if (!prev || !next) return null;
        const tail = (prev.row.content ?? '').slice(-EXCERPT_CHARS).trim();
        const head = (next.row.content ?? '').slice(0, EXCERPT_CHARS).trim();
        return [
          `Boundary after chapter ${prev.number} (flag: ${boundary.reason})`,
          `<- #${prev.number} "${prev.title ?? 'untitled'}" (${prev.words} words) ends: …${tail}`,
          `-> #${next.number} "${next.title ?? 'untitled'}" (${next.words} words) starts: ${head}…`,
        ].join('\n');
      })
      .filter(Boolean)
      .join('\n\n');
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
    if (extracted || appearances || beats || chunks || briefs || conversions || drafts) {
      // Naming the blocking table makes an auto-recombine no-op self-explanatory in the logs.
      this.logger.debug('recombine blocked by existing derived data', {
        projectId,
        extracted: !!extracted,
        appearances: !!appearances,
        beats: !!beats,
        chunks: !!chunks,
        briefs: !!briefs,
        conversions: !!conversions,
        drafts: !!drafts,
      });
      throw AppErrorCode.SRC_003.create();
    }
  }

  private async apply(projectId: bigint, plan: RecombinePlan): Promise<void> {
    await this.db.transaction(async tx => {
      for (const [index, group] of plan.groups.entries()) {
        const newNumber = index + 1;
        const members = group.members as LoadedChapter[];
        const winner = members[0] as LoadedChapter;

        if (members.length > 1) {
          const content = members.map(m => m.row.content ?? '').join('\n\n');
          const mergedFrom: Chapter.MergedPart[] = members.map(m => ({ number: m.number, title: m.title, words: m.words }));
          this.logger.debug('recombine: merging group', { projectId, newNumber, title: group.title, absorbing: members.map(m => m.number) });
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
