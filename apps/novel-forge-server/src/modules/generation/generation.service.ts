import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { and, asc, desc, eq, gt, inArray, lt, ne, sql, sum } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { renderBriefBody } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type Ai, type Generation, type Job, type Plan, type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { ContextAssembler } from '../ai/context/context-assembler.service';
import { type ContextSection } from '../ai/context/sections';
import { type WorkflowRunResult, WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService } from '../ai/model-router.service';
import { PROMPT_REGISTRY } from '../ai/prompts';
import { IndexingService } from '../ai/retrieval/indexing.service';
import { RetrievalService } from '../ai/retrieval/retrieval.service';
import { type ChapterExtractOutput } from '../ai/schemas/chapter-extract.schema';
import { type ContinuityOutput } from '../ai/schemas/continuity.schema';
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
  type FeedbackBody,
  type FinalizeBody,
  type GenerateBody,
  type GenerateGrokBody,
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
}

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
    return this.workflowRunService.runBibleBuilder({ projectId, brief: body.brief, force: body.force });
  }

  async plan(projectId: bigint, body: PlanBody): Promise<{ volumes: Plan.Volume[] }> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();

    // Fresh (non-source) novels have no skeleton; a blank "Novel skeleton:" line makes weak models
    // treat the task as unanswerable and return an empty plan, so state the fallback explicitly.
    const derived = [project.skeletonPowerCurve, project.skeletonCharacterArcs ? JSON.stringify(project.skeletonCharacterArcs) : ''].filter(Boolean).join('\n\n');
    const skeleton = body.skeleton ?? (derived || 'No skeleton available — derive the character arcs and escalation curve from the brief.');

    this.logger.info('plan: generating volume plan', { projectId, volumeCount: body.volumeCount, chaptersPerVolume: body.chaptersPerVolume });
    const ctx = { projectId, promptKey: PROMPT_REGISTRY.plan.key, promptVersion: PROMPT_REGISTRY.plan.version, role: PROMPT_REGISTRY.plan.key };
    const planOutput = await this.modelRouter.structured(
      PROMPT_REGISTRY.plan,
      { skeleton, volumeCount: body.volumeCount, chaptersPerVolume: body.chaptersPerVolume, projectBrief: project.brief ?? '' },
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
    const [catalog, volumes] = await Promise.all([
      this.contextAssembler.catalog(projectId),
      this.db.query.volumes.findMany({ where: and(eq(schema.volumes.projectId, projectId), ne(schema.volumes.status, 'draft')), orderBy: asc(schema.volumes.ordinal) }),
    ]);

    const start = body.start ?? 1;
    const count = body.count ?? volumes.reduce((acc, v) => acc + ((v.endChapter ?? 0) - (v.startChapter ?? 0) + 1), 0);
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

    const ctx = { projectId, promptKey: PROMPT_REGISTRY.outline.key, promptVersion: PROMPT_REGISTRY.outline.version, role: PROMPT_REGISTRY.outline.key };
    const outlineOutput = await this.modelRouter.structured(
      PROMPT_REGISTRY.outline,
      { catalog, volumePlan, startChapter: start, endChapter: end, extraContext: body.context ?? '' },
      ctx,
    );

    const chapters = outlineOutput as {
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
    }[];

    const upserted = await Promise.all(
      chapters.map(c => {
        const briefBody = renderBriefBody(c);
        return this.db
          .insert(schema.briefs)
          .values({
            projectId,
            chapter: c.chapter,
            volumeKey: c.volumeKey,
            title: c.title,
            body: briefBody,
            contextRefs: c.requiredContext as never,
            endingContract: c.endingContract,
          })
          .onConflictDoUpdate({
            target: [schema.briefs.projectId, schema.briefs.chapter],
            set: { volumeKey: c.volumeKey, title: c.title, body: briefBody, contextRefs: c.requiredContext as never, endingContract: c.endingContract, updatedAt: new Date() },
          })
          .returning()
          .then(rows => rows[0]);
      }),
    );

    this.logger.info('outline: briefs upserted', { projectId, briefs: upserted.filter(Boolean).length });
    return { briefs: upserted.filter(Boolean) as Generation.Brief[] };
  }

  /**
   * Arc-scoped outlining (refinement design §9.2): briefs for exactly the arc's chapter range, with
   * the arc's escalation/hook and the next arc's intent in view so ending contracts chain across the
   * boundary. Gated on the whole volume's arcs being approved (design §4 gate 2).
   */
  async outlineArc(projectId: bigint, arcKey: string, body: OutlineArcBody): Promise<{ briefs: Generation.Brief[] }> {
    const arc = await this.db.query.arcs.findFirst({ where: and(eq(schema.arcs.projectId, projectId), eq(schema.arcs.arcKey, arcKey)) });
    if (!arc) throw AppErrorCode.ARC_001.create();
    if (arc.chapterStart === null || arc.chapterEnd === null) throw AppErrorCode.ARC_002.create();

    const [catalog, volume, siblings, project] = await Promise.all([
      this.contextAssembler.catalog(projectId),
      this.db.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, arc.volumeKey)) }),
      this.db.query.arcs.findMany({ where: and(eq(schema.arcs.projectId, projectId), eq(schema.arcs.volumeKey, arc.volumeKey)), orderBy: asc(schema.arcs.ordinal) }),
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
    ]);
    if (siblings.some(a => a.status !== 'approved')) throw AppErrorCode.ARC_004.create();
    this.logger.info('outlineArc: generating briefs for arc', { projectId, arcKey, chapterStart: arc.chapterStart, chapterEnd: arc.chapterEnd });

    const nextArc = siblings.find(a => a.ordinal > arc.ordinal);
    const volumePlan = [
      `## Arc: ${arc.title ?? arc.arcKey} (${arc.arcKey})\nChs ${arc.chapterStart}–${arc.chapterEnd}\nObjective: ${arc.objective ?? ''}\nEscalation: ${arc.escalation ?? ''}\nPayoff: ${arc.payoff ?? ''}\nArc hook (the final chapter's handoff): ${arc.hook ?? ''}`,
      volume ? `## Volume: ${volume.title ?? volume.volumeKey}\nObjective: ${volume.objective ?? ''}\nConflict: ${volume.conflict ?? ''}\nPayoff: ${volume.payoff ?? ''}` : '',
      nextArc ? `## Next arc intent (contracts must chain into it): ${nextArc.objective ?? ''} (opens at ch ${nextArc.chapterStart ?? '?'})` : '',
      arc.body ? `## Arc material\n${arc.body}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const ctx = { projectId, promptKey: PROMPT_REGISTRY.outline.key, promptVersion: PROMPT_REGISTRY.outline.version, role: PROMPT_REGISTRY.outline.key };
    const outlineOutput = await this.modelRouter.structured(
      PROMPT_REGISTRY.outline,
      { catalog, volumePlan, startChapter: arc.chapterStart, endChapter: arc.chapterEnd, extraContext: body.context ?? '' },
      ctx,
      project as never,
    );

    const chapters = (
      outlineOutput as {
        chapter: number;
        volumeKey: string;
        title: string;
        objective: string;
        events: string[];
        requiredContext: string[];
        endingContract?: Record<string, unknown>;
      }[]
    ).filter(c => c.chapter >= (arc.chapterStart as number) && c.chapter <= (arc.chapterEnd as number));

    const upserted = await Promise.all(
      chapters.map(c => {
        const briefBody = renderBriefBody(c);
        const values = {
          volumeKey: arc.volumeKey,
          arcKey,
          title: c.title,
          body: briefBody,
          contextRefs: c.requiredContext as never,
          endingContract: c.endingContract,
          staleReason: null,
        };
        return this.db
          .insert(schema.briefs)
          .values({ projectId, chapter: c.chapter, ...values })
          .onConflictDoUpdate({ target: [schema.briefs.projectId, schema.briefs.chapter], set: { ...values, updatedAt: new Date() } })
          .returning()
          .then(rows => rows[0]);
      }),
    );

    return { briefs: upserted.filter(Boolean) as Generation.Brief[] };
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
      .values({ projectId, chapter, title: body.title, body: body.body, knowledgeContract: contract ?? null })
      .onConflictDoUpdate({
        target: [schema.briefs.projectId, schema.briefs.chapter],
        set: { title: body.title, body: body.body, ...(contract !== undefined ? { knowledgeContract: contract } : {}), updatedAt: new Date() },
      })
      .returning();
    if (!result) throw AppErrorCode.DRF_001.create();
    return result;
  }

  async generate(projectId: bigint, body: GenerateBody): Promise<JobEnqueueResult> {
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

    // Generate strictly in ascending chapter order: the next chapters that have a brief but no draft yet.
    // Because each chapter is drafted before the next begins, generation only advances once the previous
    // chapter is done — no gaps, no skipping ahead.
    const allBriefs = await this.db.query.briefs.findMany({ where: eq(schema.briefs.projectId, projectId), orderBy: asc(schema.briefs.chapter) });
    const existingDrafts = await this.db.query.drafts.findMany({ where: eq(schema.drafts.projectId, projectId), columns: { chapter: true } });
    const started = new Set(existingDrafts.map(d => d.chapter));
    const pending = allBriefs.map(b => b.chapter).filter(chapter => !started.has(chapter));

    let chapters = pending.slice(0, limit);
    if (chapters.length === 0 && allBriefs.length === 0) chapters = [approvedVolumes[0]?.startChapter ?? 1];

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
    this.logger.info('generate: enqueueing chapters', { projectId, chapters, limit, autoFix: body.autoFix });

    const jobId = await this.jobService.enqueue(projectId, 'generate', target, payload);
    this.jobExecutor.dispatch(jobId).catch(err => this.logger.error('generate job dispatch failed', { err, jobId }));

    return { jobId, kind: 'generate', status: 'pending', target };
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
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!draft) throw AppErrorCode.DRF_001.create();

    await this.db
      .insert(schema.draftRevisions)
      .values({ projectId, draftId: draft.id, revision: draft.revision, source: 'hand_edited', body: draft.body, summary: draft.summary })
      .onConflictDoNothing();

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
      { contextPack: pack.rendered, chapterBrief: brief?.body ?? '', draftBody: draft.body, feedback: body.note },
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

    const judgeOutput = parsed.success ? parsed.data : { verdict: 'consistent' as const, findings: [] };
    if (!parsed.success) this.logger.warn('judgeDraft: judge output failed to parse — defaulting to consistent', { projectId, chapter });
    this.logger.info('judgeDraft: verdict', { projectId, chapter, verdict: judgeOutput.verdict, findings: judgeOutput.findings.length });

    await this.db
      .update(schema.drafts)
      .set({
        judge: judgeOutput.verdict,
        judgeNote: judgeOutput.findings.map(f => `[${f.severity}] ${f.text}`).join('\n') || null,
        reviewStatus: judgeOutput.verdict === 'contradiction' ? 'contradiction' : 'needs_review',
        updatedAt: new Date(),
      })
      .where(and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)));

    return { verdict: judgeOutput.verdict, findings: judgeOutput.findings };
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
   * Deletes a drafted chapter and closes the gap so the chapter list stays contiguous: every later
   * chapter (and its continuity review) shifts down by one. The whole thing runs in a transaction so a
   * failed shift can never leave the manuscript half-renumbered. Scope is the drafted chapters — the
   * plan (briefs/arcs/volumes) and derived indexes are deliberately left alone.
   */
  async deleteDraft(projectId: bigint, chapter: number): Promise<void> {
    this.logger.info('deleteDraft: deleting and renumbering', { projectId, chapter });
    await this.db.transaction(async tx => {
      const deleted = await tx
        .delete(schema.drafts)
        .where(and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)))
        .returning({ id: schema.drafts.id });
      if (deleted.length === 0) throw AppErrorCode.DRF_001.create();

      // draft_revisions cascade via FK; the deleted chapter's continuity review is cleared here.
      await tx.delete(schema.continuityProposals).where(and(eq(schema.continuityProposals.projectId, projectId), eq(schema.continuityProposals.chapter, chapter)));

      // Shift later chapters down one at a time in ascending order, so each freed slot is reused
      // immediately and the (project, chapter) unique constraint is never transiently violated.
      const later = await tx
        .select({ chapter: schema.drafts.chapter })
        .from(schema.drafts)
        .where(and(eq(schema.drafts.projectId, projectId), gt(schema.drafts.chapter, chapter)))
        .orderBy(asc(schema.drafts.chapter));
      for (const row of later) {
        await tx
          .update(schema.drafts)
          .set({ chapter: row.chapter - 1, updatedAt: new Date() })
          .where(and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, row.chapter)));
        await tx
          .update(schema.continuityProposals)
          .set({ chapter: row.chapter - 1, updatedAt: new Date() })
          .where(and(eq(schema.continuityProposals.projectId, projectId), eq(schema.continuityProposals.chapter, row.chapter)));
      }
    });

    // Scene images live outside the draft transaction (they touch disk); purge the deleted chapter's
    // images and shift later chapters' images down to match the renumber above.
    await this.chapterImages.onChapterDeleted(projectId, chapter);
  }

  async importDraft(projectId: bigint, chapter: number, body: ImportDraftBody): Promise<Generation.Draft> {
    const [draft] = await this.db
      .insert(schema.drafts)
      .values({ projectId, chapter, title: body.title, body: body.prose, summary: body.summary, status: 'draft', reviewStatus: 'needs_review', generator: 'human' })
      .onConflictDoUpdate({
        target: [schema.drafts.projectId, schema.drafts.chapter],
        set: { title: body.title, body: body.prose, summary: body.summary, revision: sql`${schema.drafts.revision} + 1`, reviewStatus: 'needs_review', updatedAt: new Date() },
      })
      .returning();
    if (!draft) throw AppErrorCode.DRF_001.create();

    await this.db
      .insert(schema.draftRevisions)
      .values({ projectId, draftId: draft.id, revision: draft.revision, source: 'imported', body: draft.body, summary: draft.summary })
      .onConflictDoNothing();

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
    if (draft.reviewStatus !== 'approved') throw AppErrorCode.DRF_004.create();
    if (draft.status === 'final') throw AppErrorCode.DRF_002.create();
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

    return this.workflowRunService.runChapterFinalization({
      projectId,
      chapter: draft.chapter,
      draftId: draft.id,
      prose: draft.body,
      summary: draft.summary ?? '',
      title: draft.title ?? undefined,
      continuationState: draft.state as Record<string, string> | undefined,
      generator: draft.generator,
    });
  }

  async generateGrok(projectId: bigint, chapter: number, body: GenerateGrokBody): Promise<Generation.Draft> {
    const [brief, project] = await Promise.all([
      this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) }),
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
    ]);

    const pack = await this.contextAssembler.forChapter(projectId, chapter);
    const ctx = { projectId, promptKey: PROMPT_REGISTRY.generation.key, promptVersion: PROMPT_REGISTRY.generation.version, role: PROMPT_REGISTRY.generation.key };

    const result = (await this.modelRouter.structured(
      PROMPT_REGISTRY.generation,
      { contextPack: pack.rendered, chapterBrief: brief?.body ?? '', guidance: body.guidance ?? '' },
      ctx,
      { contentMode: 'grok_only', config: project?.config as never },
    )) as {
      title: string;
      body: string;
      summary: string;
      state?: Record<string, string>;
    };

    const [draft] = await this.db
      .insert(schema.drafts)
      .values({
        projectId,
        chapter,
        title: result.title,
        body: result.body,
        summary: result.summary,
        state: result.state as never,
        generator: 'grok',
        reviewStatus: 'needs_review',
        status: 'draft',
      })
      .onConflictDoUpdate({
        target: [schema.drafts.projectId, schema.drafts.chapter],
        set: {
          title: result.title,
          body: result.body,
          summary: result.summary,
          state: result.state as never,
          generator: 'grok',
          revision: sql`${schema.drafts.revision} + 1`,
          reviewStatus: 'needs_review',
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!draft) throw AppErrorCode.DRF_001.create();
    return draft;
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
    const updated = await this.db.transaction(async tx => {
      if (delta.newEntities && delta.newEntities.length > 0) {
        await tx
          .insert(schema.entities)
          .values(
            delta.newEntities.map(e => ({
              projectId,
              entityKey: e.entityKey,
              name: e.name,
              type: e.type,
              notes: e.notes,
              origin: 'generated' as const,
              firstSeenChapter: chapter,
            })),
          )
          .onConflictDoNothing();
      }

      if (delta.appeared && delta.appeared.length > 0) {
        const entityRows = await tx.query.entities.findMany({ where: and(eq(schema.entities.projectId, projectId), inArray(schema.entities.entityKey, delta.appeared)) });
        for (const entity of entityRows) {
          await tx.insert(schema.entityAppearances).values({ entityId: entity.id, projectId, chapter, firstChapter: chapter }).onConflictDoNothing();
        }
      }

      if (delta.threads && delta.threads.length > 0) {
        for (const t of delta.threads) {
          await tx
            .insert(schema.plotThreads)
            .values({
              projectId,
              threadKey: t.threadKey,
              status: t.status,
              summary: t.summary,
              openedChapter: t.status === 'open' ? chapter : undefined,
              intentionallyOpen: t.intentionallyOpen ?? false,
            })
            .onConflictDoUpdate({
              target: [schema.plotThreads.projectId, schema.plotThreads.threadKey],
              set: {
                status: t.status,
                summary: t.summary,
                closedChapter: t.status === 'closed' ? chapter : undefined,
                intentionallyOpen: t.intentionallyOpen ?? false,
                updatedAt: new Date(),
              },
            });
        }
      }

      if (delta.mysteries && delta.mysteries.length > 0) {
        for (const m of delta.mysteries) {
          await tx
            .insert(schema.mysteries)
            .values({
              projectId,
              mysteryKey: m.mysteryKey,
              status: m.status,
              question: m.question ?? '',
              openedChapter: m.status === 'open' ? chapter : undefined,
              resolvedChapter: m.status === 'resolved' ? chapter : undefined,
              intentionallyOpen: m.intentionallyOpen ?? false,
            })
            .onConflictDoUpdate({
              target: [schema.mysteries.projectId, schema.mysteries.mysteryKey],
              set: {
                status: m.status,
                question: m.question ?? undefined,
                resolvedChapter: m.status === 'resolved' ? chapter : undefined,
                intentionallyOpen: m.intentionallyOpen ?? false,
                updatedAt: new Date(),
              },
            });
        }
      }

      const [row] = await tx
        .update(schema.continuityProposals)
        .set({ status: 'applied', appliedAt: new Date(), updatedAt: new Date() })
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
