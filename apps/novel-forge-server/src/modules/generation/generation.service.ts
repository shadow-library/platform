/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';
import { and, asc, eq, inArray, ne, sql, sum } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Ai, type Generation, type PrimaryDatabase, schema } from '@server/database';

import {
  type FeedbackBody,
  type FinalizeBody,
  type GenerateBody,
  type GenerateGrokBody,
  type ImportDraftBody,
  type OutlineBody,
  type PlanBody,
  type ReviseDraftBody,
  type SeedFromBriefBody,
  type UpdateBriefBody,
  type UpdateContinuityBody,
  type UpdateDraftBody,
} from './generation.dto';
import { ContextAssembler } from '../ai/context/context-assembler.service';
import { type WorkflowRunResult, WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService } from '../ai/model-router.service';
import { PROMPT_REGISTRY } from '../ai/prompts';
import { IndexingService } from '../ai/retrieval/indexing.service';
import { RetrievalService } from '../ai/retrieval/retrieval.service';
import { type ContinuityOutput } from '../ai/schemas/continuity.schema';
import { type JudgeOutput, JudgeSchema } from '../ai/schemas/judge.schema';
import { parseSchema } from '../ai/schemas/validate';
import { TelemetryHandler } from '../ai/telemetry.handler';
import { runToolLoop } from '../ai/tools/tool-loop';
import { ToolRegistryService } from '../ai/tools/tool-registry.service';
import { JobExecutor } from '../jobs/job.executor';
import { JobService } from '../jobs/job.service';

/**
 * Defining types
 */

export interface JudgeResult {
  verdict: string;
  findings: { severity: string; text: string }[];
}

export interface ReviewQueueResult {
  drafts: Generation.Draft[];
  proposals: Generation.ContinuityProposal[];
}

export interface AiUsageResult {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  callsPerRole: Record<string, number>;
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

/**
 * Declaring the constants
 */

// Folds outline-time continuation decisions into the stored brief body so the drafter — which only
// ever reads `chapterBrief` as plain text — actually sees them (see docs on the generation prompt).
function renderBriefBody(c: { objective: string; events: string[]; continuesIntoNextChapter?: boolean; startsFromPreviousChapter?: boolean; handoffBeat?: string }): string {
  const lines = [c.objective, ...(c.events ?? [])];
  if (c.continuesIntoNextChapter) lines.push("[CONTINUES INTO NEXT CHAPTER] Do not resolve this chapter's central action/tension.");
  if (c.startsFromPreviousChapter) lines.push('[STARTS FROM PREVIOUS CHAPTER] Open in the exact beat the previous chapter handed off — no time skip, no recap.');
  if (c.handoffBeat) lines.push(`Handoff beat: ${c.handoffBeat}`);
  return lines.join('\n');
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
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  // ─── Planning ────────────────────────────────────────────────────────────────

  async seedFromBrief(projectId: bigint, body: SeedFromBriefBody): Promise<WorkflowRunResult> {
    return this.workflowRunService.runBibleBuilder({ projectId, brief: body.brief, force: body.force });
  }

  async plan(projectId: bigint, body: PlanBody): Promise<{ volumes: Ai.WorkflowRun[] }> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw new ServerError(AppErrorCode.PRJ_001);

    const skeleton = body.skeleton ?? [project.skeletonPowerCurve, JSON.stringify(project.skeletonCharacterArcs ?? {})].filter(Boolean).join('\n\n');

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
              cast: v.cast as never,
              status: 'draft',
              updatedAt: new Date(),
            },
          })
          .returning()
          .then(rows => rows[0]),
      ),
    );

    return { volumes: upserted.filter(Boolean) as never };
  }

  async approvePlan(projectId: bigint): Promise<{ volumesApproved: number; approved: boolean }> {
    const result = await this.db
      .update(schema.volumes)
      .set({ status: 'approved', updatedAt: new Date() })
      .where(and(eq(schema.volumes.projectId, projectId), ne(schema.volumes.status, 'source')))
      .returning();
    return { volumesApproved: result.length, approved: result.length > 0 };
  }

  // ─── Outlines / Briefs ───────────────────────────────────────────────────────

  async outline(projectId: bigint, body: OutlineBody): Promise<{ briefs: Generation.Brief[] }> {
    const [catalog, volumes] = await Promise.all([
      this.contextAssembler.catalog(projectId),
      this.db.query.volumes.findMany({ where: and(eq(schema.volumes.projectId, projectId), ne(schema.volumes.status, 'draft')), orderBy: asc(schema.volumes.ordinal) }),
    ]);

    const start = body.start ?? 1;
    const count = body.count ?? volumes.reduce((acc, v) => acc + ((v.endChapter ?? 0) - (v.startChapter ?? 0) + 1), 0);
    const end = start + count - 1;

    const relevantVolumes = volumes.filter(v => v.startChapter !== null && v.endChapter !== null && v.endChapter >= start && v.startChapter <= end);
    if (relevantVolumes.length === 0) return { briefs: [] };

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
    }[];

    const upserted = await Promise.all(
      chapters.map(c => {
        const briefBody = renderBriefBody(c);
        return this.db
          .insert(schema.briefs)
          .values({ projectId, chapter: c.chapter, volumeKey: c.volumeKey, title: c.title, body: briefBody, contextRefs: c.requiredContext as never })
          .onConflictDoUpdate({
            target: [schema.briefs.projectId, schema.briefs.chapter],
            set: { volumeKey: c.volumeKey, title: c.title, body: briefBody, contextRefs: c.requiredContext as never, updatedAt: new Date() },
          })
          .returning()
          .then(rows => rows[0]);
      }),
    );

    return { briefs: upserted.filter(Boolean) as Generation.Brief[] };
  }

  async getBrief(projectId: bigint, chapter: number): Promise<Generation.Brief> {
    const brief = await this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) });
    if (!brief) throw new ServerError(AppErrorCode.DRF_001);
    return brief;
  }

  async updateBrief(projectId: bigint, chapter: number, body: UpdateBriefBody): Promise<Generation.Brief> {
    const [result] = await this.db
      .insert(schema.briefs)
      .values({ projectId, chapter, title: body.title, body: body.body })
      .onConflictDoUpdate({
        target: [schema.briefs.projectId, schema.briefs.chapter],
        set: { title: body.title, body: body.body, updatedAt: new Date() },
      })
      .returning();
    if (!result) throw new ServerError(AppErrorCode.DRF_001);
    return result;
  }

  // ─── Generation + Drafts ─────────────────────────────────────────────────────

  async generate(projectId: bigint, body: GenerateBody): Promise<JobEnqueueResult> {
    const limit = body.limit ?? 1;

    // Guard: volumes must be approved before generating.
    const approvedVolumes = await this.db.query.volumes.findMany({ where: and(eq(schema.volumes.projectId, projectId), inArray(schema.volumes.status, ['approved', 'source'])) });
    if (approvedVolumes.length === 0) throw new ServerError(AppErrorCode.PLN_001);

    // Guard: no unresolved contradiction drafts.
    const contradiction = await this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.reviewStatus, 'contradiction')) });
    if (contradiction) throw new ServerError(AppErrorCode.DRF_003);

    // Find next chapters to generate (have briefs, no final draft).
    const briefs = await this.db.query.briefs.findMany({ where: eq(schema.briefs.projectId, projectId), orderBy: asc(schema.briefs.chapter), limit: limit * 2 });
    const finalDrafts = await this.db.query.drafts.findMany({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.status, 'final')) });
    const finalChapters = new Set(finalDrafts.map(d => d.chapter));

    const chaptersToGenerate = briefs.filter(b => !finalChapters.has(b.chapter)).slice(0, limit);

    // Determine the concrete list of chapter numbers to enqueue.
    let chapters: number[];
    if (chaptersToGenerate.length === 0) {
      const firstVolume = approvedVolumes[0];
      chapters = [firstVolume?.startChapter ?? 1];
    } else {
      chapters = chaptersToGenerate.map(b => b.chapter);
    }

    const target = [...chapters].sort((a, b) => a - b).join(',');
    const payload = { chapters, autoFix: body.autoFix, maxFixes: body.maxFixes, guidance: body.guidance };

    const jobId = await this.jobService.enqueue(projectId, 'generate', target, payload);
    this.jobExecutor.dispatch(jobId).catch(err => this.logger.error('generate job dispatch failed', { err, jobId }));

    return { jobId, kind: 'generate', status: 'pending', target };
  }

  async listDrafts(projectId: bigint): Promise<Generation.Draft[]> {
    return this.db.query.drafts.findMany({ where: eq(schema.drafts.projectId, projectId), orderBy: asc(schema.drafts.chapter) });
  }

  async getDraft(projectId: bigint, chapter: number): Promise<Generation.Draft> {
    const draft = await this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)) });
    if (!draft) throw new ServerError(AppErrorCode.DRF_001);
    return draft;
  }

  async updateDraft(projectId: bigint, chapter: number, body: UpdateDraftBody): Promise<Generation.Draft> {
    // Upsert draft and log a hand_edited revision.
    const [draft] = await this.db
      .insert(schema.drafts)
      .values({ projectId, chapter, title: body.title, body: body.body, summary: body.summary, state: body.state as never, status: 'draft', reviewStatus: 'needs_review' })
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
    if (!draft) throw new ServerError(AppErrorCode.DRF_001);

    // Upsert a draft_revisions row for this hand edit.
    await this.db
      .insert(schema.draftRevisions)
      .values({ projectId, draftId: draft.id, revision: draft.revision, source: 'hand_edited', body: draft.body, summary: draft.summary })
      .onConflictDoNothing();

    return draft;
  }

  async reviseDraft(projectId: bigint, chapter: number, body: ReviseDraftBody): Promise<Generation.Draft> {
    const draft = await this.getDraft(projectId, chapter);
    if (draft.status === 'final') throw new ServerError(AppErrorCode.DRF_002);

    // Create user_feedback row for this revision request.
    const [feedback] = await this.db
      .insert(schema.userFeedback)
      .values({ projectId, artifactType: 'draft', artifactRef: String(chapter), disposition: 'revision_requested', note: body.note })
      .returning();

    // Get context pack for this chapter.
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
    if (!updated) throw new ServerError(AppErrorCode.DRF_001);

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

    // Parse the last AI message as JudgeOutput.
    const lastAi = [...resultMessages].reverse().find(m => m._getType() === 'ai');
    const rawContent = lastAi ? (typeof lastAi.content === 'string' ? lastAi.content : JSON.stringify(lastAi.content)) : '{}';
    const parsed = parseSchema<JudgeOutput>(JudgeSchema, this.tryParseJson(rawContent));

    const judgeOutput = parsed.success ? parsed.data : { verdict: 'consistent' as const, findings: [] };

    // Update draft with judge result.
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
    if (!feedback) throw new ServerError(AppErrorCode.DRF_001);
    return feedback;
  }

  async approveDraft(projectId: bigint, chapter: number): Promise<Generation.Draft> {
    const draft = await this.getDraft(projectId, chapter);
    if (draft.status === 'final') throw new ServerError(AppErrorCode.DRF_002);

    await this.db.insert(schema.userFeedback).values({ projectId, artifactType: 'draft', artifactRef: String(chapter), disposition: 'approved', note: null });

    const [updated] = await this.db
      .update(schema.drafts)
      .set({ reviewStatus: 'approved', updatedAt: new Date() })
      .where(and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)))
      .returning();
    if (!updated) throw new ServerError(AppErrorCode.DRF_001);
    return updated;
  }

  async listRevisions(projectId: bigint, chapter: number): Promise<Ai.DraftRevision[]> {
    const draft = await this.getDraft(projectId, chapter);
    return this.db.query.draftRevisions.findMany({ where: eq(schema.draftRevisions.draftId, draft.id), orderBy: asc(schema.draftRevisions.revision) });
  }

  async getRevision(projectId: bigint, chapter: number, revision: number): Promise<Ai.DraftRevision> {
    const draft = await this.getDraft(projectId, chapter);
    const rev = await this.db.query.draftRevisions.findFirst({ where: and(eq(schema.draftRevisions.draftId, draft.id), eq(schema.draftRevisions.revision, revision)) });
    if (!rev) throw new ServerError(AppErrorCode.DRF_001);
    return rev;
  }

  async getDraftPrompt(projectId: bigint, chapter: number): Promise<{ markdown: string }> {
    const pack = await this.contextAssembler.forChapter(projectId, chapter);
    return { markdown: pack.rendered };
  }

  async importDraft(projectId: bigint, chapter: number, body: ImportDraftBody): Promise<Generation.Draft> {
    const [draft] = await this.db
      .insert(schema.drafts)
      .values({ projectId, chapter, title: body.title, body: body.prose, summary: body.summary, status: 'draft', reviewStatus: 'needs_review', generator: 'standard' })
      .onConflictDoUpdate({
        target: [schema.drafts.projectId, schema.drafts.chapter],
        set: { title: body.title, body: body.prose, summary: body.summary, revision: sql`${schema.drafts.revision} + 1`, reviewStatus: 'needs_review', updatedAt: new Date() },
      })
      .returning();
    if (!draft) throw new ServerError(AppErrorCode.DRF_001);

    await this.db
      .insert(schema.draftRevisions)
      .values({ projectId, draftId: draft.id, revision: draft.revision, source: 'imported', body: draft.body, summary: draft.summary })
      .onConflictDoNothing();

    return draft;
  }

  // ─── Finalize ────────────────────────────────────────────────────────────────

  async finalize(projectId: bigint, body: FinalizeBody): Promise<WorkflowRunResult> {
    // Find the target draft.
    let draft: Generation.Draft | null = null;
    if (body.chapter !== undefined) {
      draft = (await this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, body.chapter)) })) ?? null;
    } else {
      // Find the first approved draft in chapter order.
      draft =
        (await this.db.query.drafts.findFirst({
          where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.reviewStatus, 'approved')),
          orderBy: asc(schema.drafts.chapter),
        })) ?? null;
    }

    if (!draft) throw new ServerError(AppErrorCode.DRF_001);
    if (draft.reviewStatus !== 'approved') throw new ServerError(AppErrorCode.DRF_004);
    if (draft.status === 'final') throw new ServerError(AppErrorCode.DRF_002);

    // Enforce order: all previous chapters must have a final draft.
    if (draft.chapter > 1) {
      const prevFinal = await this.db.query.drafts.findFirst({
        where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, draft.chapter - 1), eq(schema.drafts.status, 'final')),
      });
      if (!prevFinal) throw new ServerError(AppErrorCode.FIN_001);
    }

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

  // ─── Grok interlude ──────────────────────────────────────────────────────────

  async generateGrok(projectId: bigint, chapter: number, body: GenerateGrokBody): Promise<Generation.Draft> {
    const [brief, project] = await Promise.all([
      this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) }),
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
    ]);

    const pack = await this.contextAssembler.forChapter(projectId, chapter);
    const ctx = { projectId, promptKey: PROMPT_REGISTRY.generation.key, promptVersion: PROMPT_REGISTRY.generation.version, role: PROMPT_REGISTRY.generation.key };

    // Force xAI routing via grok_only contentMode override.
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
    if (!draft) throw new ServerError(AppErrorCode.DRF_001);
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
    if (!row) throw new ServerError(AppErrorCode.CNT_001);
    return row;
  }

  async getContinuityProposal(projectId: bigint, chapter: number): Promise<Generation.ContinuityProposal> {
    const proposal = await this.db.query.continuityProposals.findFirst({
      where: and(eq(schema.continuityProposals.projectId, projectId), eq(schema.continuityProposals.chapter, chapter), eq(schema.continuityProposals.status, 'pending')),
    });
    if (!proposal) throw new ServerError(AppErrorCode.CNT_001);
    return proposal;
  }

  async updateContinuityProposal(projectId: bigint, chapter: number, body: UpdateContinuityBody): Promise<Generation.ContinuityProposal> {
    const existing = await this.getContinuityProposal(projectId, chapter);
    const [updated] = await this.db
      .update(schema.continuityProposals)
      .set({ proposal: body.proposal as never, updatedAt: new Date() })
      .where(eq(schema.continuityProposals.id, existing.id))
      .returning();
    if (!updated) throw new ServerError(AppErrorCode.CNT_001);
    return updated;
  }

  async applyContinuityProposal(projectId: bigint, chapter: number): Promise<Generation.ContinuityProposal> {
    const proposalRow = await this.getContinuityProposal(projectId, chapter);
    const delta = proposalRow.proposal as unknown as ContinuityOutput;

    // Insert new entities introduced in this chapter.
    if (delta.newEntities && delta.newEntities.length > 0) {
      await this.db
        .insert(schema.entities)
        .values(
          delta.newEntities.map(e => ({ projectId, entityKey: e.entityKey, name: e.name, type: e.type, notes: e.notes, origin: 'generated' as const, firstSeenChapter: chapter })),
        )
        .onConflictDoNothing();
    }

    // Upsert entity appearances for appeared entities.
    if (delta.appeared && delta.appeared.length > 0) {
      const entityRows = await this.db.query.entities.findMany({ where: and(eq(schema.entities.projectId, projectId), inArray(schema.entities.entityKey, delta.appeared)) });
      for (const entity of entityRows) {
        await this.db.insert(schema.entityAppearances).values({ entityId: entity.id, projectId, chapter, firstChapter: chapter }).onConflictDoNothing();
      }
    }

    // Upsert plot threads.
    if (delta.threads && delta.threads.length > 0) {
      for (const t of delta.threads) {
        await this.db
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

    // Upsert mysteries.
    if (delta.mysteries && delta.mysteries.length > 0) {
      for (const m of delta.mysteries) {
        await this.db
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

    // Mark proposal applied and chapter continuityApplied.
    const [updated] = await this.db
      .update(schema.continuityProposals)
      .set({ status: 'applied', appliedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.continuityProposals.id, proposalRow.id))
      .returning();

    await this.db
      .update(schema.chapters)
      .set({ continuityApplied: true, updatedAt: new Date() })
      .where(and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapter)));

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

  // ─── Validation / Review ─────────────────────────────────────────────────────

  async validate(projectId: bigint): Promise<WorkflowRunResult> {
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

  // ─── Human review queue / runs ────────────────────────────────────────────────

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

  async listRuns(projectId: bigint): Promise<Ai.WorkflowRun[]> {
    return this.db.query.workflowRuns.findMany({ where: eq(schema.workflowRuns.projectId, projectId), orderBy: [asc(schema.workflowRuns.startedAt)] });
  }

  async getRun(projectId: bigint, runId: string): Promise<Ai.WorkflowRun> {
    const run = await this.db.query.workflowRuns.findFirst({ where: and(eq(schema.workflowRuns.projectId, projectId), eq(schema.workflowRuns.id, runId)) });
    if (!run) throw new ServerError(AppErrorCode.PRJ_001);
    return run;
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

    for (const row of rows) {
      callsPerRole[row.role] = row.count;
      totalInputTokens += Number(row.inputTokens ?? 0);
      totalOutputTokens += Number(row.outputTokens ?? 0);
      totalCostUsd += Number(row.costUsd ?? 0);
    }

    return { totalInputTokens, totalOutputTokens, totalCostUsd, callsPerRole };
  }

  // ─── Search ──────────────────────────────────────────────────────────────────

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

  // ─── Manuscript ──────────────────────────────────────────────────────────────

  async getManuscript(projectId: bigint): Promise<{ markdown: string }> {
    const finalDrafts = await this.db.query.drafts.findMany({
      where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.status, 'final')),
      orderBy: asc(schema.drafts.chapter),
    });

    const markdown = finalDrafts.map(d => `# ${d.title ?? `Chapter ${d.chapter}`}\n\n${d.body}`).join('\n\n---\n\n');
    return { markdown };
  }

  // ─── Backfill ────────────────────────────────────────────────────────────────

  async listJobs(projectId: bigint): Promise<unknown[]> {
    return this.jobService.listByProject(projectId);
  }

  async backfill(projectId: bigint): Promise<JobEnqueueResult> {
    const jobId = await this.jobService.enqueue(projectId, 'backfill', 'all');
    this.jobExecutor.dispatch(jobId).catch(err => this.logger.error('backfill job dispatch failed', { err, jobId }));
    return { jobId, kind: 'backfill', status: 'pending', target: 'all' };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

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
