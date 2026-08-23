import { and, asc, desc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type ReforgeTransform, schema } from '@server/database';

import { ContextAssembler } from '../ai/context/context-assembler.service';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { PROMPT_REGISTRY } from '../ai/prompts';
import { type ReforgePlanOutput, type ReforgePlanSpanSchema } from '../ai/schemas/reforge-transform.schema';
import { buildBridgeDirectives } from './cut-ledger';
import { DEFAULT_MAX_SPAN_SOURCE_CHAPTERS, DEFAULT_MIN_SPAN_CHAPTERS, deriveOutputNumbering, type PlanSpanLike, spanKeyFor, validateTransformPlan } from './plan-validation';
import { ReforgeAnalysisService } from './reforge-analysis.service';
import { ReforgeCutService } from './reforge-cut.service';
import { ReforgeService } from './reforge.service';

export interface PlanSpanInput extends PlanSpanLike {
  arcLabel?: string | null;
  rationale?: string | null;
  cutThreads?: string[] | null;
  findingIds?: string[] | null;
}

export interface PlanResult {
  plan: ReforgeTransform.Plan;
  spans: (ReforgeTransform.PlanSpan & { firstOutputChapter: number | null; lastOutputChapter: number | null })[];
  outputChapterCount: number;
}

const NO_RENAME_BIBLE = 'No rename bible has been seeded for this project yet.';

@Injectable()
export class ReforgePlanService {
  private readonly logger = Logger.getLogger(APP_NAME, ReforgePlanService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly reforgeService: ReforgeService,
    private readonly analysisService: ReforgeAnalysisService,
    private readonly cutService: ReforgeCutService,
    private readonly contextAssembler: ContextAssembler,
    private readonly modelRouter: ModelRouterService,
    private readonly workflowRunService: WorkflowRunService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** The current plan of a project: the newest revision, whatever its status. */
  async getLatest(projectId: bigint): Promise<ReforgeTransform.Plan> {
    const plan = await this.db.query.reforgePlans.findFirst({
      where: eq(schema.reforgePlans.projectId, projectId),
      orderBy: [desc(schema.reforgePlans.revision)],
    });
    if (!plan) throw AppErrorCode.REF_005.create();
    return plan;
  }

  async getApproved(projectId: bigint): Promise<ReforgeTransform.Plan> {
    const plan = await this.getLatest(projectId);
    if (plan.status !== 'approved') throw AppErrorCode.REF_005.create();
    return plan;
  }

  async get(projectId: bigint): Promise<PlanResult> {
    return this.load(await this.getLatest(projectId));
  }

  /** Drafts a plan from the latest analysis; the human edits and approves it, and only then is it authority. */
  async draft(projectId: bigint, jobId?: string): Promise<PlanResult> {
    const reforge = await this.reforgeService.getOrCreate(projectId);
    const analysis = await this.analysisService.getLatest(projectId);
    if (analysis.status !== 'done') throw AppErrorCode.REF_004.create();

    const [project, rebrand, cards, sourceChapterCount] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.db.query.rebrands.findFirst({ where: eq(schema.rebrands.projectId, projectId) }),
      this.db.query.reforgeChapterCards.findMany({ where: eq(schema.reforgeChapterCards.analysisId, analysis.id), orderBy: [asc(schema.reforgeChapterCards.chapter)] }),
      this.db.$count(schema.chapters, eq(schema.chapters.projectId, projectId)),
    ]);

    const maxSpanSourceChapters = reforge.settings?.maxSpanSourceChapters ?? DEFAULT_MAX_SPAN_SOURCE_CHAPTERS;
    const minSpanChapters = reforge.settings?.minSpanChapters ?? DEFAULT_MIN_SPAN_CHAPTERS;
    const targetCompression = reforge.settings?.targetCompression;
    const prompt = PROMPT_REGISTRY['reforge-plan'];
    const pack = await this.contextAssembler.forReforgeAnalysis(projectId, null, {
      worldNotes: rebrand?.worldNotes ?? NO_RENAME_BIBLE,
      glossarySlice: null,
      signalDigest: null,
      carryState: reforge.instructions,
    });

    const planBrief = [
      `The source has ${sourceChapterCount} chapters — your spans must cover chapters 1 to ${sourceChapterCount} exactly once.`,
      `No output chapter may be written from more than ${maxSpanSourceChapters} source chapters.`,
      `No span may be shorter than ${minSpanChapters} source chapter(s).`,
      targetCompression
        ? `The author wants roughly ${Math.round(targetCompression * 100)}% of the source length — about ${Math.round(sourceChapterCount * targetCompression)} output chapters — distributed where it does the most good.`
        : 'The author set no compression target; cut what the analysis shows to be dead weight and no more.',
    ].join('\n');

    const { result } = await this.workflowRunService.runChain(projectId, 'reforge-plan', `plan-${projectId}`, { jobId }, async runId => {
      if (pack.id) await this.workflowRunService.linkContextPack(runId, pack.id);
      const ctx = { projectId, runId, node: 'draftPlan', promptKey: prompt.key, promptVersion: prompt.version, role: 'plan' };
      const vars = {
        stableContext: pack.renderedStable,
        report: analysis.report ?? '',
        cardIndex: cards.map(card => `${card.chapter} [${card.movement}] ${card.card.summary}`).join('\n'),
        planBrief,
      };
      return (await this.modelRouter.structured(prompt, vars, ctx, project as ProjectConfig)) as ReforgePlanOutput;
    });

    const spans = result.spans.map(toSpanInput);
    const issues = validateTransformPlan(spans, { sourceChapterCount, maxSpanSourceChapters, minSpanChapters });
    if (issues.length > 0) throw AppErrorCode.REF_006.create({ issues });

    return this.writeRevision(projectId, spans, { analysisId: analysis.id, summary: result.summary, sourceChapterCount });
  }

  /**
   * Replaces the span set wholesale as a new revision — an approved plan is never mutated, because
   * outputs name the exact revision they were written under. Spans whose bounds, action, and target
   * are unchanged keep their `spanKey`, which is what lets already-written outputs carry forward.
   */
  async replaceSpans(projectId: bigint, spans: PlanSpanInput[], baseRevision?: number): Promise<PlanResult> {
    const reforge = await this.reforgeService.getOrCreate(projectId);
    const current = await this.getLatest(projectId);
    if (baseRevision !== undefined && baseRevision !== current.revision) throw AppErrorCode.REF_010.create({ revision: current.revision });

    const sourceChapterCount = await this.db.$count(schema.chapters, eq(schema.chapters.projectId, projectId));
    const issues = validateTransformPlan(spans, {
      sourceChapterCount,
      maxSpanSourceChapters: reforge.settings?.maxSpanSourceChapters ?? DEFAULT_MAX_SPAN_SOURCE_CHAPTERS,
      minSpanChapters: reforge.settings?.minSpanChapters ?? DEFAULT_MIN_SPAN_CHAPTERS,
    });
    if (issues.length > 0) throw AppErrorCode.REF_006.create({ issues });

    return this.writeRevision(projectId, spans, { analysisId: current.analysisId, summary: current.summary, sourceChapterCount });
  }

  /**
   * The moment a human decides what their novel is — explicit, idempotent, and never automatic. The
   * plan is re-validated here because it is validated before it is stored AND before it becomes
   * authority; nothing may reach the writer that was not checked twice.
   */
  async approve(projectId: bigint, baseRevision?: number): Promise<PlanResult> {
    const reforge = await this.reforgeService.getOrCreate(projectId);
    const plan = await this.getLatest(projectId);
    if (baseRevision !== undefined && baseRevision !== plan.revision) throw AppErrorCode.REF_010.create({ revision: plan.revision });
    if (plan.status === 'approved') return this.load(plan);

    const spans = await this.loadSpans(plan.id);
    const sourceChapterCount = await this.db.$count(schema.chapters, eq(schema.chapters.projectId, projectId));
    const issues = validateTransformPlan(spans, {
      sourceChapterCount,
      maxSpanSourceChapters: reforge.settings?.maxSpanSourceChapters ?? DEFAULT_MAX_SPAN_SOURCE_CHAPTERS,
      minSpanChapters: reforge.settings?.minSpanChapters ?? DEFAULT_MIN_SPAN_CHAPTERS,
    });
    if (issues.length > 0) throw AppErrorCode.REF_006.create({ issues });

    // Seeding and bridging before the freeze keeps the invariant simple: an approved plan always has
    // its ledger and its seam directives, so the writer never has to check for them.
    await this.cutService.seed(plan.id, spans);
    for (const [ordinal, directive] of buildBridgeDirectives(spans)) {
      await this.db
        .update(schema.reforgePlanSpans)
        .set({ bridgeDirective: directive, updatedAt: new Date() })
        .where(and(eq(schema.reforgePlanSpans.planId, plan.id), eq(schema.reforgePlanSpans.ordinal, ordinal)));
    }

    const [approved] = await this.db
      .update(schema.reforgePlans)
      .set({ status: 'approved', approvedAt: new Date(), outputChapterCount: deriveOutputNumbering(spans).outputChapterCount, updatedAt: new Date() })
      .where(eq(schema.reforgePlans.id, plan.id))
      .returning();
    if (!approved) throw AppError.internal(`failed to approve reforge plan ${plan.id}`);

    this.logger.info('reforge plan approved', { projectId, planId: approved.id, revision: approved.revision, outputChapters: approved.outputChapterCount });
    return this.load(approved);
  }

  private async writeRevision(
    projectId: bigint,
    spans: PlanSpanInput[],
    meta: { analysisId: bigint | null; summary: string | null; sourceChapterCount: number },
  ): Promise<PlanResult> {
    const previous = await this.db.query.reforgePlans.findFirst({ where: eq(schema.reforgePlans.projectId, projectId), orderBy: [desc(schema.reforgePlans.revision)] });
    const { outputChapterCount } = deriveOutputNumbering(spans);

    const plan = await this.db.transaction(async tx => {
      if (previous) await tx.update(schema.reforgePlans).set({ status: 'superseded', updatedAt: new Date() }).where(eq(schema.reforgePlans.id, previous.id));
      const [created] = await tx
        .insert(schema.reforgePlans)
        .values({
          projectId,
          analysisId: meta.analysisId,
          revision: (previous?.revision ?? 0) + 1,
          status: 'draft',
          summary: meta.summary,
          sourceChapterCount: meta.sourceChapterCount,
          outputChapterCount,
        })
        .returning();
      if (!created) throw AppError.internal(`failed to open a reforge plan revision for project ${projectId}`);

      await tx.insert(schema.reforgePlanSpans).values(
        spans.map(span => ({
          planId: created.id,
          ordinal: span.ordinal,
          spanKey: spanKeyFor(span),
          fromChapter: span.fromChapter,
          toChapter: span.toChapter,
          action: span.action,
          targetChapters: span.targetChapters,
          arcLabel: span.arcLabel ?? null,
          rationale: span.rationale ?? null,
          keptBeats: span.keptBeats ?? null,
          cutThreads: span.cutThreads ?? null,
          continuityNotes: span.continuityNotes ?? null,
          findingIds: span.findingIds ?? null,
        })),
      );
      return created;
    });

    this.logger.info('reforge plan revision written', { projectId, planId: plan.id, revision: plan.revision, spans: spans.length, outputChapterCount });
    return this.load(plan);
  }

  private async loadSpans(planId: bigint): Promise<ReforgeTransform.PlanSpan[]> {
    return this.db.query.reforgePlanSpans.findMany({ where: eq(schema.reforgePlanSpans.planId, planId), orderBy: [asc(schema.reforgePlanSpans.ordinal)] });
  }

  private async load(plan: ReforgeTransform.Plan): Promise<PlanResult> {
    const spans = await this.loadSpans(plan.id);
    const derived = deriveOutputNumbering(spans);
    return {
      plan,
      spans: spans.map((span, index) => ({
        ...span,
        firstOutputChapter: derived.spans[index]?.firstOutputChapter ?? null,
        lastOutputChapter: derived.spans[index]?.lastOutputChapter ?? null,
      })),
      outputChapterCount: derived.outputChapterCount,
    };
  }
}

function toSpanInput(span: ReforgePlanSpanSchema): PlanSpanInput {
  return {
    ordinal: span.ordinal,
    fromChapter: span.fromChapter,
    toChapter: span.toChapter,
    action: span.action,
    targetChapters: span.targetChapters,
    arcLabel: span.arcLabel ?? null,
    rationale: span.rationale,
    keptBeats: span.keptBeats,
    cutThreads: span.cutThreads ?? null,
    continuityNotes: span.continuityNotes ?? null,
    findingIds: span.findingIds ?? null,
  };
}
