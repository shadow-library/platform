import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, sql, sum } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { assertActiveProject, declaredDraftFields, isFinalizable, markDescendantDraftsStale, renderBriefBody, renderChapterBrief, selectGenerationBatch } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type Ai, type Generation, type Job, type Plan, type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { ContextAssembler } from '../ai/context/context-assembler.service';
import { type ContextSection } from '../ai/context/sections';
import { truncateAtParagraph } from '../ai/context/token-budget';
import { applyContinuityDelta, continuityHasHeldEntries, filterToHeldEntries } from '../ai/graphs/apply-continuity';
import { type WorkflowRunResult, WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService } from '../ai/model-router.service';
import { buildOutlinePrompt, PROMPT_REGISTRY } from '../ai/prompts';
import { IndexingService } from '../ai/retrieval/indexing.service';
import { RetrievalService } from '../ai/retrieval/retrieval.service';
import { type ChapterExtractOutput } from '../ai/schemas/chapter-extract.schema';
import { type ContinuityOutput } from '../ai/schemas/continuity.schema';
import { renderEndingContract } from '../ai/schemas/ending-contract.schema';
import { type EpitomeOutput } from '../ai/schemas/epitome.schema';
import { type JudgeOutput, JudgeSchema } from '../ai/schemas/judge.schema';
import { parseSchema } from '../ai/schemas/validate';
import { TelemetryHandler } from '../ai/telemetry.handler';
import { runToolLoop } from '../ai/tools/tool-loop';
import { ToolRegistryService } from '../ai/tools/tool-registry.service';
import { applyBriefReveals } from '../bible/fact/knowledge-view';
import { approveVolumePlan } from '../bible/volume/volume.approve';
import { redactJobForResponse } from '../jobs/job-response';
import { JobExecutor } from '../jobs/job.executor';
import { JobService } from '../jobs/job.service';
import { type ChangeOp } from '../refinement/change-set';
import { ProposalService } from '../refinement/proposal.service';
import { ChapterImageService } from './chapter-image.service';
import {
  type ChapterSummarizeResponse,
  type FeedbackBody,
  type FinalizeBody,
  type GenerateBody,
  type GenerateUnrestrictedBody,
  type ImportDraftBody,
  type OutlineArcBody,
  type OutlineBody,
  type PlanBody,
  type ReviseDraftBody,
  type SeedFromBriefBody,
  type UpdateBriefBody,
  type UpdateContinuityBody,
  type UpdateDraftBody,
} from './generation.dto';

export interface RunContextSectionSummary {
  key: string;
  tier: string;
  segment: string;
  tokens: number;
  truncated: boolean;
}

export interface RunContextPackSummary {
  id: string;
  purpose: string;
  budgetTokens: number | null;
  usedTokens: number | null;
  sections: RunContextSectionSummary[];
}

export interface JudgeResult {
  verdict: string;
  findings: { severity: string; text: string }[];
}

export interface ReviewQueueResult {
  drafts: Generation.Draft[];
  proposals: Generation.ContinuityProposal[];
}

export interface RoleUsageResult {
  role: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AiUsageResult {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  callsPerRole: Record<string, number>;
  roles: RoleUsageResult[];
}

export interface SearchResult {
  hits: { text: string; score: number; metadata: Record<string, unknown> }[];
}

export interface JobEnqueueResult {
  jobId: string;
  kind: string;
  status: string;
  target: string;
  /** Set when an unfilled external-write slot truncated the batch before its limit (interstitial-chapter-design §8). */
  stoppedAtExternalChapter?: number;
}

const PLAN_BIBLE_DOC_TOKEN_CAP = 1_500;

/**
 * Whole-book `outline()` is the legacy planning path — arc-scoped `outlineArc` (gated on approved
 * arcs) is the intended production path per the planning hierarchy. This cap keeps an omitted or
 * oversized `count` from silently planning the entire unwritten novel in one model call.
 */
export const MAX_WHOLE_BOOK_OUTLINE_SPAN = 25;

@Injectable()
export class GenerationService {
  private readonly logger = Logger.getLogger(APP_NAME, GenerationService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly workflowRunService: WorkflowRunService,
    private readonly modelRouter: ModelRouterService,
    private readonly contextAssembler: ContextAssembler,
    private readonly telemetry: TelemetryHandler,
    private readonly retrievalService: RetrievalService,
    private readonly indexingService: IndexingService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly jobService: JobService,
    private readonly jobExecutor: JobExecutor,
    private readonly proposalService: ProposalService,
    private readonly chapterImages: ChapterImageService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async seedFromBrief(projectId: bigint, body: SeedFromBriefBody): Promise<WorkflowRunResult> {
    await this.assertActive(projectId);
    return this.workflowRunService.runBibleBuilder({ projectId, brief: body.brief, force: body.force });
  }

  private async assertActive(projectId: bigint): Promise<void> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { status: true } });
    if (!project) throw AppErrorCode.PRJ_001.create();
    assertActiveProject(project);
  }

  async plan(projectId: bigint, body: PlanBody): Promise<{ volumes: Plan.Volume[] }> {
    const [project, bibleDocs] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.db.query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, projectId), orderBy: [schema.bibleDocuments.section, schema.bibleDocuments.slug] }),
    ]);
    if (!project) throw AppErrorCode.PRJ_001.create();
    assertActiveProject(project);

    // Fresh (non-source) novels have no skeleton; a blank "Novel skeleton:" line makes weak models
    // treat the task as unanswerable and return an empty plan, so state the fallback explicitly.
    const derived = [project.skeletonPowerCurve, project.skeletonCharacterArcs ? JSON.stringify(project.skeletonCharacterArcs) : ''].filter(Boolean).join('\n\n');
    const skeleton = body.skeleton ?? (derived || 'No skeleton available — derive the character arcs and escalation curve from the brief.');

    // Same fallback pattern as `skeleton` above — an explicit placeholder rather than a silently empty var, so a
    // weak model doesn't misread a blank "Bible:" section as "no canon exists" when it just hasn't been built yet.
    const bibleDocsText =
      bibleDocs.length > 0
        ? bibleDocs.map(d => `${d.section}/${d.slug}:\n${truncateAtParagraph(d.body ?? '', PLAN_BIBLE_DOC_TOKEN_CAP).text}`).join('\n\n')
        : '(no bible written yet)';

    this.logger.info('plan: generating volume plan', { projectId, volumeCount: body.volumeCount, chaptersPerVolume: body.chaptersPerVolume });
    const ctx = { projectId, promptKey: PROMPT_REGISTRY.plan.key, promptVersion: PROMPT_REGISTRY.plan.version, role: PROMPT_REGISTRY.plan.key };
    const planOutput = await this.modelRouter.structured(
      PROMPT_REGISTRY.plan,
      { skeleton, volumeCount: body.volumeCount, chaptersPerVolume: body.chaptersPerVolume, projectBrief: project.brief ?? '', bibleDocs: bibleDocsText },
      ctx,
      project as never,
    );

    const volumeSpecs = planOutput as {
      volumeKey: string;
      ordinal: number;
      title: string;
      objective: string;
      conflict: string;
      payoff: string;
      startChapter: number;
      endChapter: number;
      cast?: string[];
    }[];

    const upserted = await Promise.all(
      volumeSpecs.map(v =>
        this.db
          .insert(schema.volumes)
          .values({
            projectId,
            volumeKey: v.volumeKey,
            ordinal: v.ordinal,
            title: v.title,
            objective: v.objective,
            conflict: v.conflict,
            payoff: v.payoff,
            startChapter: v.startChapter,
            endChapter: v.endChapter,
            targetChapterCount: v.endChapter - v.startChapter + 1,
            cast: v.cast as never,
            status: 'draft',
          })
          .onConflictDoUpdate({
            target: [schema.volumes.projectId, schema.volumes.volumeKey],
            set: {
              ordinal: v.ordinal,
              title: v.title,
              objective: v.objective,
              conflict: v.conflict,
              payoff: v.payoff,
              startChapter: v.startChapter,
              endChapter: v.endChapter,
              targetChapterCount: v.endChapter - v.startChapter + 1,
              cast: v.cast as never,
              status: 'draft',
              updatedAt: new Date(),
            },
          })
          .returning()
          .then(rows => rows[0]),
      ),
    );

    this.logger.info('plan: volumes upserted', { projectId, volumes: upserted.filter(Boolean).length });
    return { volumes: upserted.filter((v): v is Plan.Volume => v != null) };
  }

  approvePlan(projectId: bigint): Promise<{ volumesApproved: number; approved: boolean }> {
    return approveVolumePlan(this.db, projectId);
  }

  async outline(projectId: bigint, body: OutlineBody): Promise<{ briefs: Generation.Brief[] }> {
    await this.assertActive(projectId);
    const [catalog, volumes] = await Promise.all([
      this.contextAssembler.catalog(projectId),
      this.db.query.volumes.findMany({ where: and(eq(schema.volumes.projectId, projectId), ne(schema.volumes.status, 'draft')), orderBy: asc(schema.volumes.ordinal) }),
    ]);

    const start = body.start ?? 1;
    const requestedCount = body.count ?? volumes.reduce((acc, v) => acc + ((v.endChapter ?? 0) - (v.startChapter ?? 0) + 1), 0);
    const count = Math.min(requestedCount, MAX_WHOLE_BOOK_OUTLINE_SPAN);
    if (requestedCount > MAX_WHOLE_BOOK_OUTLINE_SPAN) {
      this.logger.warn('outline: requested span exceeds the whole-book outline cap — clamping', { projectId, requestedCount, cap: MAX_WHOLE_BOOK_OUTLINE_SPAN });
    }
    const end = start + count - 1;

    const relevantVolumes = volumes.filter(v => v.startChapter !== null && v.endChapter !== null && v.endChapter >= start && v.startChapter <= end);
    if (relevantVolumes.length === 0) {
      this.logger.debug('outline: no volumes overlap the requested range — nothing to outline', { projectId, start, end });
      return { briefs: [] };
    }
    this.logger.info('outline: generating briefs', { projectId, start, end, volumes: relevantVolumes.length });

    const volumePlan = relevantVolumes
      .map(
        v =>
          `## ${v.title ?? v.volumeKey} (${v.volumeKey})\nChs ${v.startChapter}–${v.endChapter}\nObjective: ${v.objective ?? ''}\nConflict: ${v.conflict ?? ''}\nPayoff: ${v.payoff ?? ''}`,
      )
      .join('\n\n');

    const prompt = buildOutlinePrompt(start, end);
    const ctx = { projectId, promptKey: prompt.key, promptVersion: prompt.version, role: prompt.key };
    const outlineOutput = await this.modelRouter.structured(prompt, { catalog, volumePlan, startChapter: start, endChapter: end, extraContext: body.context ?? '' }, ctx);

    const chapters = outlineOutput as unknown as {
      chapter: number;
      volumeKey: string;
      title: string;
      objective: string;
      events: string[];
      requiredContext: string[];
      pov?: string;
      continuesIntoNextChapter?: boolean;
      startsFromPreviousChapter?: boolean;
      handoffBeat?: string;
      endingContract?: Record<string, unknown>;
      knowledgeContract?: Record<string, unknown>;
      chapterPurpose?: string;
      readerValue?: string[];
      repetitionRisks?: string[];
    }[];

    await this.dropUnresolvedContextRefs(projectId, chapters);

    const { chapters: protectedChapters, briefs: preservedBriefs } = await this.protectedBriefsInRange(projectId, start, end);
    const upserted = await Promise.all(
      chapters.map(c => {
        if (protectedChapters.has(c.chapter)) return Promise.resolve(preservedBriefs.get(c.chapter));

        const briefBody = renderBriefBody(c);
        const values = {
          volumeKey: c.volumeKey,
          title: c.title,
          body: briefBody,
          contextRefs: c.requiredContext as never,
          pov: c.pov ?? null,
          endingContract: c.endingContract,
          knowledgeContract: c.knowledgeContract ?? null,
          chapterPurpose: c.chapterPurpose ?? null,
          readerValue: c.readerValue ?? null,
          repetitionRisks: c.repetitionRisks ?? null,
          staleReason: null,
          handEdited: false,
        };
        return this.db
          .insert(schema.briefs)
          .values({ projectId, chapter: c.chapter, ...values })
          .onConflictDoUpdate({ target: [schema.briefs.projectId, schema.briefs.chapter], set: { ...values, updatedAt: new Date() } })
          .returning()
          .then(rows => rows[0]);
      }),
    );

    if (protectedChapters.size > 0) this.logger.info('outline: preserved protected briefs', { projectId, chapters: [...protectedChapters] });
    this.logger.info('outline: briefs upserted', { projectId, briefs: upserted.filter(Boolean).length });
    return { briefs: upserted.filter(Boolean) as Generation.Brief[] };
  }

  /**
   * Arc-scoped outlining (refinement design §9.2): briefs for exactly the arc's chapter range, with
   * the arc's escalation/hook and the next arc's intent in view so ending contracts chain across the
   * boundary. Gated on the whole volume's arcs being approved (design §4 gate 2).
   */
  async outlineArc(projectId: bigint, arcKey: string, body: OutlineArcBody): Promise<{ briefs: Generation.Brief[] }> {
    await this.assertActive(projectId);
    const arc = await this.db.query.arcs.findFirst({ where: and(eq(schema.arcs.projectId, projectId), eq(schema.arcs.arcKey, arcKey)) });
    if (!arc) throw AppErrorCode.ARC_001.create();
    if (arc.chapterStart === null || arc.chapterEnd === null) throw AppErrorCode.ARC_002.create();

    const latestFinalized = await this.db.query.chapters.findFirst({
      where: and(
        eq(schema.chapters.projectId, projectId),
        eq(schema.chapters.status, 'done'),
        gte(schema.chapters.number, arc.chapterStart),
        lte(schema.chapters.number, arc.chapterEnd),
      ),
      orderBy: desc(schema.chapters.number),
      columns: { number: true },
    });
    // Reconciliation re-outlines mid-arc, so the pack must be assembled as of what has actually been
    // written inside the arc — anchoring on chapterStart would hide every chapter the arc already spent.
    const asOfChapter = latestFinalized ? latestFinalized.number + 1 : arc.chapterStart;

    const [contextPack, siblings, project] = await Promise.all([
      this.contextAssembler.forOutline(projectId, asOfChapter),
      this.db.query.arcs.findMany({ where: and(eq(schema.arcs.projectId, projectId), eq(schema.arcs.volumeKey, arc.volumeKey)), orderBy: asc(schema.arcs.ordinal) }),
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
    ]);
    if (siblings.some(a => a.status !== 'approved')) throw AppErrorCode.ARC_004.create();
    this.logger.info('outlineArc: generating briefs for arc', { projectId, arcKey, chapterStart: arc.chapterStart, chapterEnd: arc.chapterEnd });

    const nextArc = siblings.find(a => a.ordinal > arc.ordinal);
    const catalog = contextPack.rendered;
    // The volume objective/conflict/payoff is already covered by forOutline's `volume_objective`
    // section above, so it is deliberately left out of this arc-specific block to avoid duplication.
    const volumePlan = [
      `## Arc: ${arc.title ?? arc.arcKey} (${arc.arcKey})\nChs ${arc.chapterStart}–${arc.chapterEnd}\nObjective: ${arc.objective ?? ''}\nEscalation: ${arc.escalation ?? ''}\nPayoff: ${arc.payoff ?? ''}\nArc hook (the final chapter's handoff): ${arc.hook ?? ''}`,
      nextArc ? `## Next arc intent (contracts must chain into it): ${nextArc.objective ?? ''} (opens at ch ${nextArc.chapterStart ?? '?'})` : '',
      arc.body ? `## Arc material\n${arc.body}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const prompt = buildOutlinePrompt(arc.chapterStart, arc.chapterEnd);
    const ctx = { projectId, promptKey: prompt.key, promptVersion: prompt.version, role: prompt.key };
    const outlineOutput = await this.modelRouter.structured(
      prompt,
      { catalog, volumePlan, startChapter: arc.chapterStart, endChapter: arc.chapterEnd, extraContext: body.context ?? '' },
      ctx,
      project as never,
    );

    const chapters = (
      outlineOutput as unknown as {
        chapter: number;
        volumeKey: string;
        title: string;
        objective: string;
        events: string[];
        requiredContext: string[];
        pov?: string;
        endingContract?: Record<string, unknown>;
        knowledgeContract?: Record<string, unknown>;
        chapterPurpose?: string;
        readerValue?: string[];
        repetitionRisks?: string[];
      }[]
    ).filter(c => c.chapter >= (arc.chapterStart as number) && c.chapter <= (arc.chapterEnd as number));

    await this.dropUnresolvedContextRefs(projectId, chapters);

    const { chapters: protectedChapters, briefs: preservedBriefs } = await this.protectedBriefsInRange(projectId, arc.chapterStart, arc.chapterEnd);
    const upserted = await Promise.all(
      chapters.map(c => {
        if (protectedChapters.has(c.chapter)) return Promise.resolve(preservedBriefs.get(c.chapter));

        const briefBody = renderBriefBody(c);
        const values = {
          volumeKey: arc.volumeKey,
          arcKey,
          title: c.title,
          body: briefBody,
          contextRefs: c.requiredContext as never,
          pov: c.pov ?? null,
          endingContract: c.endingContract,
          knowledgeContract: c.knowledgeContract ?? null,
          chapterPurpose: c.chapterPurpose ?? null,
          readerValue: c.readerValue ?? null,
          repetitionRisks: c.repetitionRisks ?? null,
          staleReason: null,
          handEdited: false,
        };
        return this.db
          .insert(schema.briefs)
          .values({ projectId, chapter: c.chapter, ...values })
          .onConflictDoUpdate({ target: [schema.briefs.projectId, schema.briefs.chapter], set: { ...values, updatedAt: new Date() } })
          .returning()
          .then(rows => rows[0]);
      }),
    );

    if (protectedChapters.size > 0) this.logger.info('outlineArc: preserved protected briefs', { projectId, arcKey, chapters: [...protectedChapters] });
    return { briefs: upserted.filter(Boolean) as Generation.Brief[] };
  }

  /**
   * Chapters a re-outline must never overwrite: a human authored the brief, the chapter is already
   * written canon, or prose has been drafted against the brief as it stands — rewriting the plan under
   * an existing draft leaves the two disagreeing with nothing to reconcile them. The briefs map carries
   * the rows as they stand so callers still see current state — a finalized chapter may have no brief
   * row at all, hence the separate chapter set.
   */
  private async protectedBriefsInRange(projectId: bigint, chapterStart: number, chapterEnd: number): Promise<{ chapters: Set<number>; briefs: Map<number, Generation.Brief> }> {
    const [existing, finalized, drafted] = await Promise.all([
      this.db.query.briefs.findMany({ where: and(eq(schema.briefs.projectId, projectId), gte(schema.briefs.chapter, chapterStart), lte(schema.briefs.chapter, chapterEnd)) }),
      this.db.query.chapters.findMany({
        where: and(
          eq(schema.chapters.projectId, projectId),
          eq(schema.chapters.status, 'done'),
          gte(schema.chapters.number, chapterStart),
          lte(schema.chapters.number, chapterEnd),
        ),
        columns: { number: true },
      }),
      this.db.query.drafts.findMany({
        where: and(eq(schema.drafts.projectId, projectId), gte(schema.drafts.chapter, chapterStart), lte(schema.drafts.chapter, chapterEnd)),
        columns: { chapter: true },
      }),
    ]);

    const chapters = new Set(finalized.map(c => c.number));
    for (const draft of drafted) chapters.add(draft.chapter);
    for (const brief of existing) if (brief.handEdited) chapters.add(brief.chapter);
    return { chapters, briefs: new Map(existing.filter(b => chapters.has(b.chapter)).map(b => [b.chapter, b])) };
  }

  /**
   * Strips requiredContext refs the model invented — ones that don't resolve against the actual
   * catalog — so an unresolvable ref never reaches a persisted brief. Repairs in place; does not
   * fail the outline call over one bad ref.
   */
  private async dropUnresolvedContextRefs(projectId: bigint, briefs: { chapter: number; requiredContext: string[] }[]): Promise<void> {
    await Promise.all(
      briefs.map(async brief => {
        if (brief.requiredContext.length === 0) return;
        const { unresolved } = await this.contextAssembler.resolveRefs(projectId, brief.requiredContext);
        if (unresolved.length === 0) return;
        const unresolvedSet = new Set(unresolved);
        brief.requiredContext = brief.requiredContext.filter(ref => !unresolvedSet.has(ref));
        this.logger.warn('outline: dropped unresolved context refs', { projectId, chapter: brief.chapter, unresolved });
      }),
    );
  }

  listBriefs(projectId: bigint): Promise<Pick<Generation.Brief, 'chapter' | 'volumeKey' | 'arcKey' | 'title' | 'staleReason' | 'updatedAt'>[]> {
    return this.db.query.briefs.findMany({
      where: eq(schema.briefs.projectId, projectId),
      columns: { chapter: true, volumeKey: true, arcKey: true, title: true, staleReason: true, updatedAt: true },
      orderBy: asc(schema.briefs.chapter),
    });
  }

  async getBrief(projectId: bigint, chapter: number): Promise<Generation.Brief> {
    const brief = await this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) });
    if (!brief) throw AppErrorCode.DRF_001.create();
    return brief;
  }

  async updateBrief(projectId: bigint, chapter: number, body: UpdateBriefBody): Promise<Generation.Brief> {
    const contract = body.knowledgeContract ? ({ pov: body.knowledgeContract.pov, learns: body.knowledgeContract.learns ?? [] } as Record<string, unknown>) : undefined;
    const [result] = await this.db
      .insert(schema.briefs)
      .values({ projectId, chapter, title: body.title, body: body.body, knowledgeContract: contract ?? null, handEdited: true })
      .onConflictDoUpdate({
        target: [schema.briefs.projectId, schema.briefs.chapter],
        set: { title: body.title, body: body.body, ...(contract !== undefined ? { knowledgeContract: contract } : {}), handEdited: true, updatedAt: new Date() },
      })
      .returning();
    if (!result) throw AppErrorCode.DRF_001.create();
    return result;
  }

  async generate(projectId: bigint, body: GenerateBody): Promise<JobEnqueueResult> {
    await this.assertActive(projectId);
    const limit = body.limit ?? 1;

    const approvedVolumes = await this.db.query.volumes.findMany({ where: and(eq(schema.volumes.projectId, projectId), inArray(schema.volumes.status, ['approved', 'source'])) });
    if (approvedVolumes.length === 0) throw AppErrorCode.PLN_001.create();

    // Ordering guard: never run two generation streams at once. Overlapping streams both pick "the next
    // chapter" and persist drafts out of order (the cause of chapters landing as 9,10,11 with 1–8 missing).
    // If a generation job is already active, return it unchanged instead of starting a competing one.
    const activeJob = await this.db.query.jobs.findFirst({
      where: and(eq(schema.jobs.projectId, projectId), eq(schema.jobs.kind, 'generate'), inArray(schema.jobs.status, ['pending', 'in_progress'])),
    });
    if (activeJob) {
      this.logger.debug('generate: a generation job is already active — returning it', { projectId, jobId: activeJob.id, status: activeJob.status });
      return { jobId: activeJob.id, kind: 'generate', status: activeJob.status, target: activeJob.target ?? '' };
    }

    const contradiction = await this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.reviewStatus, 'contradiction')) });
    if (contradiction) throw AppErrorCode.DRF_003.create();

    // Generate strictly in ascending chapter order: the next chapters that have a brief but no draft yet,
    // truncated at the first unfilled external-write slot (see `selectGenerationBatch`). Because each chapter
    // is drafted before the next begins, generation only advances once the previous chapter is done — no gaps,
    // no skipping ahead.
    const allBriefs = await this.db.query.briefs.findMany({ where: eq(schema.briefs.projectId, projectId), orderBy: asc(schema.briefs.chapter) });
    const existingDrafts = await this.db.query.drafts.findMany({ where: eq(schema.drafts.projectId, projectId), columns: { chapter: true } });
    const finalizedChapters = await this.db.query.chapters.findMany({
      where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.status, 'done')),
      columns: { number: true },
    });
    const started = new Set(existingDrafts.map(d => d.chapter));
    const finalized = new Set(finalizedChapters.map(c => c.number));

    const { chapters, stoppedAtExternalChapter } = selectGenerationBatch(allBriefs, started, finalized, limit);
    if (chapters.length === 0 && allBriefs.length === 0) throw AppErrorCode.BRF_001.create();

    const briefByChapter = new Map(allBriefs.map(brief => [brief.chapter, brief]));
    const staleChapters = chapters.filter(chapter => briefByChapter.get(chapter)?.staleReason != null);
    if (staleChapters.length > 0) throw AppErrorCode.BRF_002.create({ chapters: staleChapters.join(', ') });

    // Guard: when a chapter's volume has arcs, the covering arc must be approved (refinement design §4 gate 3).
    // Arc-less volumes (e.g. source-imported ones) keep the volume-scoped path.
    const arcs = await this.db.query.arcs.findMany({ where: eq(schema.arcs.projectId, projectId) });
    for (const chapter of arcs.length > 0 ? chapters : []) {
      const volume = approvedVolumes.find(v => v.startChapter !== null && v.endChapter !== null && chapter >= v.startChapter && chapter <= v.endChapter);
      if (!volume) continue;
      const volumeArcs = arcs.filter(a => a.volumeKey === volume.volumeKey);
      if (volumeArcs.length === 0) continue;
      const covering = volumeArcs.find(a => a.chapterStart !== null && a.chapterEnd !== null && chapter >= a.chapterStart && chapter <= a.chapterEnd);
      if (!covering || covering.status !== 'approved') throw AppErrorCode.ARC_004.create();
    }

    const target = [...chapters].sort((a, b) => a - b).join(',');
    const payload = { chapters, autoFix: body.autoFix, maxFixes: body.maxFixes, guidance: body.guidance };
    this.logger.info('generate: enqueueing chapters', { projectId, chapters, limit, autoFix: body.autoFix, stoppedAtExternalChapter });

    const jobId = await this.jobService.enqueue(projectId, 'generate', target, payload);
    this.jobExecutor.dispatch(jobId).catch(err => this.logger.error('generate job dispatch failed', { err, jobId }));

    return { jobId, kind: 'generate', status: 'pending', target, stoppedAtExternalChapter };
  }

  async listDrafts(projectId: bigint): Promise<Generation.Draft[]> {
    return this.db.query.drafts.findMany({ where: eq(schema.drafts.projectId, projectId), orderBy: asc(schema.drafts.chapter) });
  }

  async getDraft(projectId: bigint, chapter: number): Promise<Generation.Draft> {
    const draft = await this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)) });
    if (!draft) throw AppErrorCode.DRF_001.create();
    return draft;
  }

  async updateDraft(projectId: bigint, chapter: number, body: UpdateDraftBody): Promise<Generation.Draft> {
    const existing = await this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)) });
    if (existing?.status === 'final') throw AppErrorCode.DRF_002.create();

    const [draft] = await this.db
      .insert(schema.drafts)
      .values({
        projectId,
        chapter,
        title: body.title,
        body: body.body,
        summary: body.summary,
        state: body.state as never,
        status: 'draft',
        reviewStatus: 'needs_review',
        staleReason: null,
        generator: 'human',
      })
      .onConflictDoUpdate({
        target: [schema.drafts.projectId, schema.drafts.chapter],
        set: {
          title: body.title,
          body: body.body,
          summary: body.summary,
          state: body.state as never,
          revision: sql`${schema.drafts.revision} + 1`,
          reviewStatus: 'needs_review',
          staleReason: null,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!draft) throw AppErrorCode.DRF_001.create();

    await this.db
      .insert(schema.draftRevisions)
      .values({ projectId, draftId: draft.id, revision: draft.revision, source: 'hand_edited', body: draft.body, summary: draft.summary })
      .onConflictDoNothing();

    await markDescendantDraftsStale(this.db, projectId, chapter, `ancestor chapter ${chapter} was hand_edited`);

    return draft;
  }

  async reviseDraft(projectId: bigint, chapter: number, body: ReviseDraftBody): Promise<Generation.Draft> {
    this.logger.info('reviseDraft: revising draft', { projectId, chapter });
    this.logger.debug('reviseDraft: feedback note', { projectId, chapter, note: body.note });
    const draft = await this.getDraft(projectId, chapter);
    if (draft.status === 'final') throw AppErrorCode.DRF_002.create();

    const [feedback] = await this.db
      .insert(schema.userFeedback)
      .values({ projectId, artifactType: 'draft', artifactRef: String(chapter), disposition: 'revision_requested', note: body.note })
      .returning();

    const pack = await this.contextAssembler.forChapter(projectId, chapter);
    const brief = await this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) });
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });

    const ctx = { projectId, promptKey: PROMPT_REGISTRY.revision.key, promptVersion: PROMPT_REGISTRY.revision.version, role: PROMPT_REGISTRY.revision.key };
    const revised = (await this.modelRouter.structured(
      PROMPT_REGISTRY.revision,
      { contextPack: pack.rendered, chapterBrief: renderChapterBrief(brief), draftBody: draft.body, feedback: body.note },
      ctx,
      project as never,
    )) as { title: string; body: string; summary: string; state?: Record<string, string> };

    const newRevision = draft.revision + 1;
    const [updated] = await this.db
      .update(schema.drafts)
      .set({
        title: revised.title,
        body: revised.body,
        summary: revised.summary,
        state: revised.state as never,
        revision: newRevision,
        reviewStatus: 'needs_review',
        staleReason: null,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)))
      .returning();
    if (!updated) throw AppErrorCode.DRF_001.create();

    await this.db
      .insert(schema.draftRevisions)
      .values({
        projectId,
        draftId: draft.id,
        revision: newRevision,
        source: 'revised',
        body: revised.body,
        summary: revised.summary,
        state: revised.state as never,
        feedbackId: feedback?.id,
      })
      .onConflictDoNothing();

    await markDescendantDraftsStale(this.db, projectId, chapter, `ancestor chapter ${chapter} was revised`);

    return updated;
  }

  async judgeDraft(projectId: bigint, chapter: number): Promise<JudgeResult> {
    this.logger.debug('judgeDraft: starting', { projectId, chapter });
    const draft = await this.getDraft(projectId, chapter);
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });

    const pack = await this.contextAssembler.forChapter(projectId, chapter);
    const model = this.modelRouter.chatFor('judge', project as never);

    const runId = `judge-${projectId}-${chapter}-${Date.now()}`;
    const tools = this.toolRegistry.forNode('judge', { chapter, db: this.db, node: 'judge', projectId, retrieval: this.retrievalService, runId });
    const rawTools = this.toolRegistry.getRaw('judge');

    const judgeSystemMsg = new SystemMessage(PROMPT_REGISTRY.judge.system);
    const judgeHumanMsg = new HumanMessage(`${pack.rendered}\n\nDraft chapter ${chapter}:\n${draft.body}`);
    const messages = [...(PROMPT_REGISTRY.judge.fewShots ?? []), judgeSystemMsg, judgeHumanMsg];

    const runJudgeModel = async (): Promise<JudgeOutput | null> => {
      const { messages: resultMessages } = await runToolLoop(
        model,
        tools,
        rawTools,
        messages,
        { chapter, db: this.db, node: 'judge', projectId, retrieval: this.retrievalService, runId },
        this.db,
        { maxRounds: 4 },
      );
      const lastAi = [...resultMessages].reverse().find(m => m._getType() === 'ai');
      const rawContent = lastAi ? (typeof lastAi.content === 'string' ? lastAi.content : JSON.stringify(lastAi.content)) : '{}';
      const parsed = parseSchema<JudgeOutput>(JudgeSchema, this.tryParseJson(rawContent));
      return parsed.success ? parsed.data : null;
    };

    let judgeOutput = await runJudgeModel();
    if (!judgeOutput) {
      this.logger.warn('judgeDraft: judge output failed to parse — retrying once', { projectId, chapter });
      judgeOutput = await runJudgeModel();
    }

    const evaluationFailed = !judgeOutput;
    const verdict = judgeOutput?.verdict ?? 'evaluation_failed';
    const findings = [...(judgeOutput?.findings ?? [])];
    if (evaluationFailed) {
      this.logger.warn('judgeDraft: judge output unparseable after retry — routing to human review', { projectId, chapter });
      findings.push({ severity: 'hard', text: 'judge output unparseable' });
    }
    this.logger.info('judgeDraft: verdict', { projectId, chapter, verdict, findings: findings.length });

    await this.db
      .update(schema.drafts)
      .set({
        judge: verdict,
        judgeNote: findings.map(f => `[${f.severity}] ${f.text}`).join('\n') || null,
        reviewStatus: verdict === 'consistent' ? 'needs_review' : 'contradiction',
        updatedAt: new Date(),
      })
      .where(and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)));

    return { verdict, findings };
  }

  async feedbackDraft(projectId: bigint, chapter: number, body: FeedbackBody): Promise<Ai.UserFeedback> {
    const [feedback] = await this.db
      .insert(schema.userFeedback)
      .values({ projectId, artifactType: 'draft', artifactRef: String(chapter), disposition: body.disposition ?? 'comment', note: body.note })
      .returning();
    if (!feedback) throw AppErrorCode.DRF_001.create();
    return feedback;
  }

  async approveDraft(projectId: bigint, chapter: number, options?: { reviewerId?: string; idempotencyKey?: string }): Promise<Generation.Draft> {
    const draft = await this.getDraft(projectId, chapter);
    if (draft.status === 'final') throw AppErrorCode.DRF_002.create();
    if (draft.staleReason) throw AppErrorCode.DRF_007.create();

    // Record the approval and flip the draft's review status in one transaction: a crash can never
    // leave an approval logged without the draft approved, or the draft approved with no audit row.
    // `idempotencyKey` (unique) makes a retried approve a no-op instead of a duplicate approval row.
    const updated = await this.db.transaction(async tx => {
      await tx
        .insert(schema.userFeedback)
        .values({
          projectId,
          artifactType: 'draft',
          artifactRef: String(chapter),
          disposition: 'approved',
          reviewerId: options?.reviewerId ?? null,
          idempotencyKey: options?.idempotencyKey ?? null,
          note: null,
        })
        .onConflictDoNothing({ target: schema.userFeedback.idempotencyKey });

      const [row] = await tx
        .update(schema.drafts)
        .set({ reviewStatus: 'approved', updatedAt: new Date() })
        .where(and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)))
        .returning();

      // Approval is the deterministic reveal gate (character-knowledge design §4): the brief's
      // `learns` declarations become ledger rows in the same transaction as the approval itself.
      const reveals = await applyBriefReveals(tx, projectId, chapter);
      if (reveals.applied > 0) this.logger.info('brief reveals ledgered', { projectId, chapter, applied: reveals.applied });

      return row;
    });

    if (!updated) throw AppErrorCode.DRF_001.create();
    this.logger.info('draft approved', { projectId, chapter, reviewerId: options?.reviewerId });
    return updated;
  }

  async listRevisions(projectId: bigint, chapter: number): Promise<Ai.DraftRevision[]> {
    const draft = await this.getDraft(projectId, chapter);
    return this.db.query.draftRevisions.findMany({ where: eq(schema.draftRevisions.draftId, draft.id), orderBy: asc(schema.draftRevisions.revision) });
  }

  async getRevision(projectId: bigint, chapter: number, revision: number): Promise<Ai.DraftRevision> {
    const draft = await this.getDraft(projectId, chapter);
    const rev = await this.db.query.draftRevisions.findFirst({ where: and(eq(schema.draftRevisions.draftId, draft.id), eq(schema.draftRevisions.revision, revision)) });
    if (!rev) throw AppErrorCode.DRF_001.create();
    return rev;
  }

  async getDraftPrompt(projectId: bigint, chapter: number): Promise<{ markdown: string }> {
    const pack = await this.contextAssembler.forChapter(projectId, chapter);
    return { markdown: pack.rendered };
  }

  /**
   * Deletes one drafted chapter and leaves a hole at that number. Later chapters are deliberately not
   * renumbered: a draft's prose is written against the brief at the same chapter number, and briefs
   * (plus the arc ranges and knowledge contracts keyed off them) are not shifted, so closing the gap
   * would silently pair every later draft with someone else's brief.
   */
  async deleteDraft(projectId: bigint, chapter: number): Promise<void> {
    this.logger.info('deleteDraft: deleting draft', { projectId, chapter });
    const draft = await this.getDraft(projectId, chapter);
    if (draft.status === 'final') throw AppErrorCode.DRF_002.create();

    await this.db.transaction(async tx => {
      const deleted = await tx
        .delete(schema.drafts)
        .where(and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)))
        .returning({ id: schema.drafts.id });
      if (deleted.length === 0) throw AppErrorCode.DRF_001.create();

      // draft_revisions cascade via FK; the deleted chapter's continuity review is cleared here.
      await tx.delete(schema.continuityProposals).where(and(eq(schema.continuityProposals.projectId, projectId), eq(schema.continuityProposals.chapter, chapter)));
    });

    // Scene images live outside the draft transaction (they touch disk).
    await this.chapterImages.onChapterDeleted(projectId, chapter);
  }

  async importDraft(projectId: bigint, chapter: number, body: ImportDraftBody): Promise<Generation.Draft> {
    const existing = await this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)) });
    if (existing?.status === 'final') throw AppErrorCode.DRF_002.create();

    const declared = declaredDraftFields(body);
    const [draft] = await this.db
      .insert(schema.drafts)
      .values({
        projectId,
        chapter,
        title: body.title,
        body: body.prose,
        summary: body.summary,
        status: 'draft',
        reviewStatus: 'needs_review',
        staleReason: null,
        generator: 'human',
        ...declared,
      })
      .onConflictDoUpdate({
        target: [schema.drafts.projectId, schema.drafts.chapter],
        set: {
          title: body.title,
          body: body.prose,
          summary: body.summary,
          revision: sql`${schema.drafts.revision} + 1`,
          reviewStatus: 'needs_review',
          staleReason: null,
          generator: 'human',
          ...declared,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!draft) throw AppErrorCode.DRF_001.create();

    await this.db
      .insert(schema.draftRevisions)
      .values({ projectId, draftId: draft.id, revision: draft.revision, source: 'imported', body: draft.body, summary: draft.summary })
      .onConflictDoNothing();

    await markDescendantDraftsStale(this.db, projectId, chapter, `ancestor chapter ${chapter} was imported`);

    return draft;
  }

  async finalize(projectId: bigint, body: FinalizeBody): Promise<WorkflowRunResult> {
    let draft: Generation.Draft | null = null;
    if (body.chapter !== undefined) {
      draft = (await this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, body.chapter)) })) ?? null;
    } else {
      draft =
        (await this.db.query.drafts.findFirst({
          where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.reviewStatus, 'approved')),
          orderBy: asc(schema.drafts.chapter),
        })) ?? null;
    }

    if (!draft) throw AppErrorCode.DRF_001.create();
    if (draft.status === 'final') {
      if (await this.isChapterFinalized(projectId, draft.chapter, draft.isolated)) throw AppErrorCode.DRF_002.create();
      this.logger.warn('finalize: resuming a partially finalized chapter', { projectId, chapter: draft.chapter, draftId: draft.id });
    } else if (draft.reviewStatus !== 'approved') throw AppErrorCode.DRF_004.create();
    if (!isFinalizable(draft)) throw AppErrorCode.CHP_005.create();
    this.logger.info('finalize: finalizing chapter', { projectId, chapter: draft.chapter, draftId: draft.id, generator: draft.generator });

    if (draft.chapter > 1) {
      const prevFinal = await this.db.query.drafts.findFirst({
        where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, draft.chapter - 1), eq(schema.drafts.status, 'final')),
      });
      if (!prevFinal) throw AppErrorCode.FIN_001.create();
    }

    // Enforce bible/chapter consistency: an earlier finalized chapter invalidated by a canon change must
    // be re-validated before we build the next chapter on top of stale context.
    const stale = await this.db.query.chapters.findFirst({
      where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.needsRevalidation, true), lt(schema.chapters.number, draft.chapter)),
    });
    if (stale) throw AppErrorCode.FIN_002.create();

    const latestReport = await this.db.query.validationReports.findFirst({
      where: and(eq(schema.validationReports.projectId, projectId), eq(schema.validationReports.scope, 'novel')),
      orderBy: desc(schema.validationReports.createdAt),
    });
    const reportIssues = (latestReport?.payload as { issues?: { chapter?: number; severity?: string }[] } | undefined)?.issues ?? [];
    if (reportIssues.some(i => i.severity === 'error' && i.chapter === draft.chapter)) throw AppErrorCode.FIN_003.create();

    const result = await this.workflowRunService.runChapterFinalization({
      projectId,
      chapter: draft.chapter,
      draftId: draft.id,
      prose: draft.body,
      summary: draft.summary ?? '',
      title: draft.title ?? undefined,
      continuationState: draft.state as Record<string, string> | undefined,
      generator: draft.generator,
      isolated: draft.isolated,
    });

    if (result.status !== 'completed') return result;

    await this.maybeReconcileArc(projectId, draft.chapter);
    await this.maybeWriteVolumeEpitome(projectId, draft.chapter);
    return result;
  }

  /**
   * Whether chapter N reached the *end* of the finalization pipeline, as opposed to only its first
   * (prose-committing) node. `commitProse` flips the draft to `final` before continuity extraction and
   * the cursor advance run, so a draft's own status cannot answer this — a failure anywhere downstream
   * leaves a `final` draft over a half-finalized chapter that must be allowed to finish.
   */
  private async isChapterFinalized(projectId: bigint, chapter: number, isolated: boolean): Promise<boolean> {
    const [chapterRow, project] = await Promise.all([
      this.db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapter)) }),
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
    ]);
    if (!chapterRow) return false;
    // Isolated chapters bypass continuity extraction entirely, so their flag never turns true.
    if (!chapterRow.continuityApplied && !isolated) return false;
    return (project?.storyCurrentChapter ?? 0) >= chapter;
  }

  /**
   * Re-outlines the *remaining* chapters of the arc the just-finalized chapter belongs to, every
   * `generation.reconciliation.cadence` finalized chapters or as soon as a remaining brief is marked
   * stale. Best-effort: a failed reconciliation must never fail the finalization that triggered it.
   */
  private async maybeReconcileArc(projectId: bigint, chapter: number): Promise<void> {
    const arc = await this.db.query.arcs.findFirst({
      where: and(eq(schema.arcs.projectId, projectId), eq(schema.arcs.status, 'approved'), lte(schema.arcs.chapterStart, chapter), gte(schema.arcs.chapterEnd, chapter)),
    });
    if (!arc || arc.chapterStart === null || arc.chapterEnd === null) return;
    if (chapter >= arc.chapterEnd) return;

    // Finalization is strictly sequential (the FIN_001 gate above), so position within the arc is the count.
    const finalizedInArc = chapter - arc.chapterStart + 1;
    const cadence = Config.get('generation.reconciliation.cadence');
    const cadenceReached = cadence > 0 && finalizedInArc % cadence === 0;

    let reason = 'cadence';
    if (!cadenceReached) {
      const stale = await this.db.query.briefs.findFirst({
        where: and(eq(schema.briefs.projectId, projectId), gt(schema.briefs.chapter, chapter), lte(schema.briefs.chapter, arc.chapterEnd), isNotNull(schema.briefs.staleReason)),
      });
      if (!stale) return;
      reason = 'stale';
    }

    this.logger.info('finalize: reconciling arc briefs', { projectId, arcKey: arc.arcKey, chapter, finalizedInArc, cadence, reason });
    await this.outlineArc(projectId, arc.arcKey, {}).catch(err => this.logger.warn('finalize: arc reconciliation failed', { projectId, arcKey: arc.arcKey, chapter, err }));
  }

  /**
   * Distils a volume into `volumes.epitome` the one time its last chapter finalizes, so the outliner's
   * serial memory stays O(volumes) instead of O(chapters). Best-effort: a failed epitome must never fail
   * the finalization that triggered it, and an epitome already on the row is never rewritten.
   */
  private async maybeWriteVolumeEpitome(projectId: bigint, chapter: number): Promise<void> {
    const volume = await this.db.query.volumes.findFirst({
      where: and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.status, 'approved'), eq(schema.volumes.endChapter, chapter)),
    });
    if (!volume || volume.startChapter === null || volume.endChapter === null || volume.epitome !== null) return;

    const chapters = await this.db.query.chapters.findMany({
      where: and(
        eq(schema.chapters.projectId, projectId),
        eq(schema.chapters.status, 'done'),
        gte(schema.chapters.number, volume.startChapter),
        lte(schema.chapters.number, volume.endChapter),
      ),
      orderBy: asc(schema.chapters.number),
    });
    const chapterSummaries = chapters
      .filter(c => c.summary)
      .map(c => `Ch ${c.number}: ${c.summary}`)
      .join('\n');
    if (!chapterSummaries) {
      this.logger.warn('finalize: skipping volume epitome — no chapter summaries in range', { projectId, volumeKey: volume.volumeKey, chapter });
      return;
    }

    const volumePlan = `## ${volume.title ?? volume.volumeKey} (${volume.volumeKey})\nObjective: ${volume.objective ?? ''}\nConflict: ${volume.conflict ?? ''}\nPayoff: ${volume.payoff ?? ''}`;
    const prompt = PROMPT_REGISTRY.epitome;
    const ctx = { projectId, promptKey: prompt.key, promptVersion: prompt.version, role: prompt.key };

    this.logger.info('finalize: writing volume epitome', { projectId, volumeKey: volume.volumeKey, chapter, summaries: chapters.length });
    await this.modelRouter
      .structured(prompt, { volumePlan, chapterSummaries, startChapter: volume.startChapter, endChapter: volume.endChapter }, ctx)
      .then(output => {
        const epitome = (output as EpitomeOutput).epitome?.trim();
        if (!epitome) throw new Error('epitome prompt returned an empty epitome');
        return this.db
          .update(schema.volumes)
          .set({ epitome, updatedAt: new Date() })
          .where(and(eq(schema.volumes.id, volume.id), isNull(schema.volumes.epitome)));
      })
      .catch(err => this.logger.warn('finalize: volume epitome failed', { projectId, volumeKey: volume.volumeKey, chapter, err }));
  }

  async generateUnrestricted(projectId: bigint, chapter: number, body: GenerateUnrestrictedBody): Promise<Generation.Draft> {
    const locked = await this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)) });
    if (locked?.status === 'final') throw AppErrorCode.DRF_002.create();

    const [brief, project] = await Promise.all([
      this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) }),
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
    ]);

    const pack = await this.contextAssembler.forChapter(projectId, chapter);
    const ctx = { projectId, promptKey: PROMPT_REGISTRY.generation.key, promptVersion: PROMPT_REGISTRY.generation.version, role: PROMPT_REGISTRY.generation.key };

    const result = (await this.modelRouter.structured(
      PROMPT_REGISTRY.generation,
      {
        stableContext: pack.renderedStable,
        volatileContext: pack.renderedVolatile,
        chapterBrief: renderChapterBrief(brief),
        endingContract: renderEndingContract(brief?.endingContract),
        guidance: body.guidance ?? '',
      },
      ctx,
      { ...project, contentMode: 'unrestricted' } as never,
    )) as {
      title: string;
      body: string;
      summary: string;
      state?: Record<string, string>;
    };

    // The replacement and the descendant invalidation it forces commit together: a crash between them
    // would leave later drafts looking valid against prose that no longer exists. `setWhere` re-checks
    // finality as part of the write itself, closing the window the pre-model guard above cannot.
    const declared = declaredDraftFields({ contentRating: body.contentRating });
    const draft = await this.db.transaction(async tx => {
      const [row] = await tx
        .insert(schema.drafts)
        .values({
          projectId,
          chapter,
          title: result.title,
          body: result.body,
          summary: result.summary,
          state: result.state as never,
          generator: 'unrestricted',
          isolated: true,
          reviewStatus: 'needs_review',
          staleReason: null,
          status: 'draft',
          ...declared,
        })
        .onConflictDoUpdate({
          target: [schema.drafts.projectId, schema.drafts.chapter],
          set: {
            title: result.title,
            body: result.body,
            summary: result.summary,
            state: result.state as never,
            generator: 'unrestricted',
            isolated: true,
            revision: sql`${schema.drafts.revision} + 1`,
            reviewStatus: 'needs_review',
            staleReason: null,
            ...declared,
            updatedAt: new Date(),
          },
          setWhere: ne(schema.drafts.status, 'final'),
        })
        .returning();

      if (!row) {
        const blocked = await tx.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)) });
        if (blocked?.status === 'final') throw AppErrorCode.DRF_002.create();
        throw AppErrorCode.DRF_001.create();
      }

      await markDescendantDraftsStale(tx, projectId, chapter, `ancestor chapter ${chapter} was regenerated`);

      return row;
    });

    if (!draft) throw AppErrorCode.DRF_001.create();
    return draft;
  }

  /**
   * Runs a permissive model over a draft's existing prose and returns `{ summary, state }` without
   * persisting anything — the author reviews and edits before saving through `PUT /drafts/:n`, so a bad
   * result is simply discarded rather than becoming the value the finalize gate (CHP_005) checks.
   */
  async summarizeChapter(projectId: bigint, chapter: number): Promise<ChapterSummarizeResponse> {
    const draft = await this.getDraft(projectId, chapter);
    if (!draft.body || draft.body.trim().length === 0) throw AppErrorCode.CHP_007.create();

    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const ctx = {
      projectId,
      promptKey: PROMPT_REGISTRY['chapter-summarize'].key,
      promptVersion: PROMPT_REGISTRY['chapter-summarize'].version,
      role: PROMPT_REGISTRY['chapter-summarize'].key,
    };

    const result = (await this.modelRouter.structured(PROMPT_REGISTRY['chapter-summarize'], { chapterProse: draft.body }, ctx, {
      ...project,
      contentMode: 'unrestricted',
    } as never)) as { summary: string; state: Record<string, unknown> };

    return { summary: result.summary, state: result.state };
  }

  async proposeContinuity(projectId: bigint, chapter: number): Promise<Generation.ContinuityProposal> {
    const draft = await this.getDraft(projectId, chapter);
    const pack = await this.contextAssembler.forChapter(projectId, chapter);
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });

    const ctx = { projectId, promptKey: PROMPT_REGISTRY.continuity.key, promptVersion: PROMPT_REGISTRY.continuity.version, role: PROMPT_REGISTRY.continuity.key };
    const proposal = await this.modelRouter.structured(
      PROMPT_REGISTRY.continuity,
      { contextPack: pack.rendered, chapterNumber: chapter, chapterProse: draft.body },
      ctx,
      project as never,
    );

    const [row] = await this.db
      .insert(schema.continuityProposals)
      .values({ projectId, chapter, status: 'pending', proposal: proposal as never })
      .onConflictDoUpdate({
        target: [schema.continuityProposals.projectId, schema.continuityProposals.chapter],
        set: { proposal: proposal as never, status: 'pending', appliedAt: null, updatedAt: new Date() },
      })
      .returning();
    if (!row) throw AppErrorCode.CNT_001.create();
    return row;
  }

  /**
   * Folds the canon a (usually hand-authored) chapter establishes back into the story bible. Runs the
   * chapter-extract prompt to derive a change-set of entity/bible ops, then stages it as a normal
   * refinement proposal so the author reviews it on the Proposals page alongside every other canon edit
   * — rather than the parallel continuity-proposal path. Throws DRF_005 when the chapter adds nothing new.
   */
  async extractChapterToBible(projectId: bigint, chapter: number): Promise<Refinement.Proposal> {
    const draft = await this.getDraft(projectId, chapter);
    const pack = await this.contextAssembler.forChapter(projectId, chapter);
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });

    const promptModule = PROMPT_REGISTRY['chapter-extract'];
    const ctx = { projectId, promptKey: promptModule.key, promptVersion: promptModule.version, role: promptModule.role ?? promptModule.key };
    const output = (await this.modelRouter.structured(
      promptModule,
      { contextPack: pack.rendered, chapterNumber: chapter, chapterProse: draft.body },
      ctx,
      project as never,
    )) as ChapterExtractOutput;

    const changeSet = (output.changeSet ?? []) as unknown as ChangeOp[];
    this.logger.debug('extractChapterToBible: derived change-set', { projectId, chapter, ops: changeSet.length });
    if (changeSet.length === 0) throw AppErrorCode.DRF_005.create();

    return this.proposalService.create(projectId, {
      scopeType: 'brief',
      scopeRef: `chapter:${chapter}`,
      kind: 'chapter_extract',
      summary: output.summary?.trim() || `Canon from chapter ${chapter}`,
      changeSet,
      allowedOps: ['entity.upsert', 'entity.remove', 'bible_document.upsert', 'bible_document.remove'],
      model: this.modelRouter.resolveModel(promptModule.role ?? 'extraction', project as never).model,
    });
  }

  async getContinuityProposal(projectId: bigint, chapter: number): Promise<Generation.ContinuityProposal> {
    const proposal = await this.db.query.continuityProposals.findFirst({
      where: and(eq(schema.continuityProposals.projectId, projectId), eq(schema.continuityProposals.chapter, chapter), eq(schema.continuityProposals.status, 'pending')),
    });
    if (!proposal) throw AppErrorCode.CNT_001.create();
    return proposal;
  }

  async updateContinuityProposal(projectId: bigint, chapter: number, body: UpdateContinuityBody): Promise<Generation.ContinuityProposal> {
    const existing = await this.getContinuityProposal(projectId, chapter);
    const [updated] = await this.db
      .update(schema.continuityProposals)
      .set({ proposal: body.proposal as never, updatedAt: new Date() })
      .where(eq(schema.continuityProposals.id, existing.id))
      .returning();
    if (!updated) throw AppErrorCode.CNT_001.create();
    return updated;
  }

  async applyContinuityProposal(projectId: bigint, chapter: number): Promise<Generation.ContinuityProposal> {
    this.logger.info('applyContinuityProposal: applying', { projectId, chapter });
    const proposalRow = await this.getContinuityProposal(projectId, chapter);
    const delta = proposalRow.proposal as unknown as ContinuityOutput;

    // Apply every canon mutation, mark the proposal applied, and flag the chapter in one transaction:
    // a partial application must never be recorded as `applied`.
    // A proposal holding low-confidence entries stays `pending` so it remains reachable for review — only a
    // delta that applied in full becomes `applied`.
    const hasHeldEntries = continuityHasHeldEntries(delta);

    const updated = await this.db.transaction(async tx => {
      await applyContinuityDelta(tx, projectId, chapter, delta);

      const [row] = await tx
        .update(schema.continuityProposals)
        .set(hasHeldEntries ? { proposal: filterToHeldEntries(delta) as never, updatedAt: new Date() } : { status: 'applied', appliedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.continuityProposals.id, proposalRow.id))
        .returning();

      await tx
        .update(schema.chapters)
        .set({ continuityApplied: true, updatedAt: new Date() })
        .where(and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapter)));

      return row;
    });

    return updated ?? proposalRow;
  }

  async discardContinuityProposal(projectId: bigint, chapter: number): Promise<Generation.ContinuityProposal> {
    const proposalRow = await this.getContinuityProposal(projectId, chapter);
    const [updated] = await this.db
      .update(schema.continuityProposals)
      .set({ status: 'discarded', updatedAt: new Date() })
      .where(eq(schema.continuityProposals.id, proposalRow.id))
      .returning();
    return updated ?? proposalRow;
  }

  async validate(projectId: bigint): Promise<WorkflowRunResult> {
    this.logger.info('validate: running full-novel validation', { projectId });
    return this.workflowRunService.runNovelValidation({ projectId });
  }

  async reviewChapter(projectId: bigint, chapter: number): Promise<{ disposition: string; note?: string; findings?: { severity: string; text: string }[] }> {
    const draft = await this.getDraft(projectId, chapter);
    const [pack, brief] = await Promise.all([
      this.contextAssembler.forChapter(projectId, chapter),
      this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) }),
    ]);
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });

    const ctx = { projectId, promptKey: PROMPT_REGISTRY.review.key, promptVersion: PROMPT_REGISTRY.review.version, role: PROMPT_REGISTRY.review.key };
    const review = (await this.modelRouter.structured(
      PROMPT_REGISTRY.review,
      { contextPack: pack.rendered, chapterBrief: brief?.body ?? '', draftBody: draft.body },
      ctx,
      project as never,
    )) as {
      disposition: string;
      note?: string;
      findings?: { severity: string; text: string }[];
    };
    return review;
  }

  async getReviewQueue(projectId: bigint): Promise<ReviewQueueResult> {
    const [drafts, proposals] = await Promise.all([
      this.db.query.drafts.findMany({
        where: and(eq(schema.drafts.projectId, projectId), inArray(schema.drafts.reviewStatus, ['needs_review', 'contradiction'])),
        orderBy: asc(schema.drafts.chapter),
      }),
      this.db.query.continuityProposals.findMany({
        where: and(eq(schema.continuityProposals.projectId, projectId), eq(schema.continuityProposals.status, 'pending')),
        orderBy: asc(schema.continuityProposals.chapter),
      }),
    ]);
    return { drafts, proposals };
  }

  // The runs screen is a reference view — only the latest 20 matter; older runs stay queryable by id.
  async listRuns(projectId: bigint): Promise<Ai.WorkflowRun[]> {
    return this.db.query.workflowRuns.findMany({ where: eq(schema.workflowRuns.projectId, projectId), orderBy: [desc(schema.workflowRuns.startedAt)], limit: 20 });
  }

  async getRun(projectId: bigint, runId: string): Promise<Ai.WorkflowRun & { modelCalls: Ai.ModelCall[]; toolCalls: Ai.ToolCall[]; contextPack?: RunContextPackSummary }> {
    const run = await this.db.query.workflowRuns.findFirst({ where: and(eq(schema.workflowRuns.projectId, projectId), eq(schema.workflowRuns.id, runId)) });
    if (!run) throw AppErrorCode.PRJ_001.create();
    const [modelCalls, toolCalls, contextPack] = await Promise.all([
      this.db.query.modelCalls.findMany({
        where: and(eq(schema.modelCalls.projectId, projectId), eq(schema.modelCalls.runId, runId)),
        orderBy: asc(schema.modelCalls.createdAt),
      }),
      this.db.query.toolCalls.findMany({ where: eq(schema.toolCalls.runId, runId), orderBy: asc(schema.toolCalls.createdAt) }),
      this.loadPackSummary(run.contextPackId),
    ]);
    // Omitted (never null) when unlinked — the route serialiser cannot build nullable nested objects.
    return { ...run, modelCalls, toolCalls, ...(contextPack ? { contextPack } : {}) };
  }

  private async loadPackSummary(contextPackId: bigint | null): Promise<RunContextPackSummary | null> {
    if (contextPackId === null) return null;
    const pack = await this.db.query.contextPacks.findFirst({ where: eq(schema.contextPacks.id, contextPackId) });
    if (!pack) return null;
    const sections = ((pack.sections as ContextSection[] | null) ?? []).map(s => ({ key: s.key, tier: s.tier, segment: s.segment, tokens: s.tokens, truncated: s.truncated }));
    return { id: String(pack.id), purpose: pack.purpose, budgetTokens: pack.budgetTokens, usedTokens: pack.usedTokens, sections };
  }

  async getRunCall(projectId: bigint, runId: string, callId: bigint): Promise<Ai.ModelCall> {
    const call = await this.db.query.modelCalls.findFirst({
      where: and(eq(schema.modelCalls.projectId, projectId), eq(schema.modelCalls.runId, runId), eq(schema.modelCalls.id, callId)),
    });
    if (!call) throw AppErrorCode.PRJ_001.create();
    return call;
  }

  async getRunContext(projectId: bigint, runId: string): Promise<RunContextPackSummary & { rendered: string }> {
    const run = await this.db.query.workflowRuns.findFirst({ where: and(eq(schema.workflowRuns.projectId, projectId), eq(schema.workflowRuns.id, runId)) });
    if (!run) throw AppErrorCode.PRJ_001.create();
    const summary = await this.loadPackSummary(run.contextPackId);
    if (!summary) throw AppErrorCode.CTX_001.create();
    const pack = await this.db.query.contextPacks.findFirst({ where: eq(schema.contextPacks.id, BigInt(summary.id)) });
    return { ...summary, rendered: pack?.rendered ?? '' };
  }

  async getAiUsage(projectId: bigint): Promise<AiUsageResult> {
    const rows = await this.db
      .select({
        role: schema.modelCalls.role,
        count: sql<number>`count(*)::int`,
        inputTokens: sum(schema.modelCalls.inputTokens),
        outputTokens: sum(schema.modelCalls.outputTokens),
        costUsd: sum(schema.modelCalls.costUsd),
      })
      .from(schema.modelCalls)
      .where(eq(schema.modelCalls.projectId, projectId))
      .groupBy(schema.modelCalls.role);

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostUsd = 0;
    const callsPerRole: Record<string, number> = {};
    const roles: RoleUsageResult[] = [];

    for (const row of rows) {
      const inputTokens = Number(row.inputTokens ?? 0);
      const outputTokens = Number(row.outputTokens ?? 0);
      const costUsd = Number(row.costUsd ?? 0);
      callsPerRole[row.role] = row.count;
      roles.push({ role: row.role, calls: row.count, inputTokens, outputTokens, costUsd });
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      totalCostUsd += costUsd;
    }

    roles.sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens));

    return { totalInputTokens, totalOutputTokens, totalCostUsd, callsPerRole, roles };
  }

  async search(projectId: bigint, query: { q: string; index?: string; k?: number }): Promise<SearchResult> {
    const k = query.k ?? 5;
    const idx = query.index ?? 'both';

    const [proseHits, loreHits] = await Promise.all([
      idx !== 'lore' ? this.retrievalService.searchProse(projectId, query.q, k) : Promise.resolve([]),
      idx !== 'prose' ? this.retrievalService.searchLore(projectId, query.q, k) : Promise.resolve([]),
    ]);

    const hits = [...proseHits, ...loreHits].sort((a, b) => b.score - a.score).slice(0, k);
    return { hits: hits.map(h => ({ text: h.text, score: h.score, metadata: h.metadata as Record<string, unknown> })) };
  }

  async getManuscript(projectId: bigint): Promise<{ markdown: string }> {
    const finalDrafts = await this.db.query.drafts.findMany({
      where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.status, 'final')),
      orderBy: asc(schema.drafts.chapter),
    });

    const markdown = finalDrafts.map(d => `# ${d.title ?? `Chapter ${d.chapter}`}\n\n${d.body}`).join('\n\n---\n\n');
    return { markdown };
  }

  async listJobs(projectId: bigint): Promise<Job.Row[]> {
    const jobs = await this.jobService.listByProject(projectId);
    return jobs.map(redactJobForResponse);
  }

  async backfill(projectId: bigint): Promise<JobEnqueueResult> {
    this.logger.info('backfill: enqueueing reindex', { projectId });
    const jobId = await this.jobService.enqueue(projectId, 'backfill', 'all');
    this.jobExecutor.dispatch(jobId).catch(err => this.logger.error('backfill job dispatch failed', { err, jobId }));
    return { jobId, kind: 'backfill', status: 'pending', target: 'all' };
  }

  private tryParseJson(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      let depth = 0;
      let start = -1;
      for (let i = 0; i < raw.length; i++) {
        if (raw[i] === '{') {
          if (depth === 0) start = i;
          depth++;
        } else if (raw[i] === '}') {
          depth--;
          if (depth === 0 && start !== -1) {
            try {
              return JSON.parse(raw.slice(start, i + 1));
            } catch {
              start = -1;
            }
          }
        }
      }
      return null;
    }
  }
}
