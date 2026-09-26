import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { and, asc, desc, eq, getTableColumns, inArray, isNull, lt, ne, sql, sum } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import {
  briefContentHash,
  declaredDraftFields,
  firstUnwrittenChapter,
  isFinalizable,
  ledgerBriefReveals,
  markDescendantDraftsStale,
  nearestVolumeKey,
  normalizeBriefScenes,
  normalizeStringList,
  refusedDraftWriteError,
  revokeProvisionalReveals,
  selectGenerationBatch,
  validateBriefScenes,
} from '@server/common';
import { APP_NAME } from '@server/constants';
import { type Ai, type Generation, type Job, type PrimaryDatabase, type Project, type Refinement, schema } from '@server/database';

import { ContextAssembler } from '../ai/context/context-assembler.service';
import { type ContextSection } from '../ai/context/sections';
import { loadWriterBrief } from '../ai/context/writer-brief';
import { applyContinuityDelta, continuityHasHeldEntries, filterToHeldEntries } from '../ai/graphs/apply-continuity';
import { CHAPTER_PACK_CONSUMERS } from '../ai/graphs/chapter-generation.graph';
import { expandShortDraft } from '../ai/graphs/draft-expansion';
import { type RunTrace, splitRunTrace, type WorkflowRunResult, WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { PROMPT_REGISTRY } from '../ai/prompts';
import { generationWordTargetVars } from '../ai/prompts/generation.prompt';
import { IndexingService } from '../ai/retrieval/indexing.service';
import { RetrievalService } from '../ai/retrieval/retrieval.service';
import { type ChapterExtractOutput } from '../ai/schemas/chapter-extract.schema';
import { type ContinuityOutput } from '../ai/schemas/continuity.schema';
import { type EndingContractSchema } from '../ai/schemas/ending-contract.schema';
import { type GenerationState } from '../ai/schemas/generation.schema';
import { type JudgeOutput, JudgeSchema } from '../ai/schemas/judge.schema';
import { parseSchema } from '../ai/schemas/validate';
import { TelemetryHandler } from '../ai/telemetry.handler';
import { runToolLoop } from '../ai/tools/tool-loop';
import { ToolRegistryService } from '../ai/tools/tool-registry.service';
import { type CallRoute, resolveUnrestrictedRoute, type RoutedCall } from '../ai/unrestricted-route';
import { loadWriterForbiddenFacts, scrubForWriter } from '../bible/fact/knowledge-view';
import { resolveWordTarget } from '../eval/deterministic-metrics';
import { AuthoringClaimService } from '../jobs/authoring-claim.service';
import { redactJobForResponse } from '../jobs/job-response';
import { JobExecutor } from '../jobs/job.executor';
import { JobService } from '../jobs/job.service';
import { PluginPolicyService, raisedContainment } from '../plugins/plugin-policy.service';
import { PluginProposalService } from '../plugins/plugin-proposal.service';
import { type ChangeOp } from '../refinement/change-set';
import { ProposalService } from '../refinement/proposal.service';
import { ChapterImageService } from './chapter-image.service';
import {
  type ApproveDraftBody,
  type CancelJobResponse,
  type CancelRunResponse,
  type ChapterSummarizeResponse,
  type FeedbackBody,
  type FinalizeBody,
  type GenerateBody,
  type GenerateUnrestrictedBody,
  type ImportDraftBody,
  type ReviseDraftBody,
  type SeedFromBriefBody,
  type UpdateBriefBody,
  type UpdateContinuityBody,
  type UpdateDraftBody,
} from './generation.dto';

interface RunContextSectionSummary {
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

interface RoleUsageResult {
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

export type PresentedRun = Omit<Ai.WorkflowRun, 'nodeTrace'> & RunTrace;

function presentRun(run: Ai.WorkflowRun): PresentedRun {
  return { ...run, ...splitRunTrace(run.nodeTrace) };
}

function handEditedEndingContract(contract: EndingContractSchema): EndingContractSchema {
  const emotionalBeat = contract.emotionalBeat.trim();
  const openQuestion = contract.openQuestion.trim();
  const handoffState = contract.handoffState.trim();
  const missing = Object.entries({ emotionalBeat, openQuestion, handoffState }).flatMap(([key, value]) => (value ? [] : [key]));
  if (missing.length > 0) throw AppErrorCode.BRF_003.create({ fields: missing.join(', ') });
  const mustNotResolve = (contract.mustNotResolve ?? []).map(entry => entry.trim()).filter(Boolean);
  return { hookType: contract.hookType, emotionalBeat, openQuestion, handoffState, mustNotResolve };
}

export interface DraftSummary {
  chapter: number;
  title: string | null;
  status: Generation.DraftStatus;
  reviewStatus: Generation.DraftReviewStatus;
  judge: Generation.JudgeVerdict | null;
  isolated: boolean;
  stale: boolean;
  updatedAt: Date;
  writtenAt: Date;
}

export interface SearchResult {
  hits: { text: string; score: number; metadata: Record<string, unknown> }[];
}

export interface JobEnqueueResult {
  jobId: string;
  kind: string;
  status: string;
  target: string;
  /** Set when an unfilled external-write slot truncated the batch before its limit. */
  stoppedAtExternalChapter?: number;
  /** Set when a chapter with neither a draft nor finalized prose truncated the batch before its limit. */
  stoppedAtUnwrittenChapter?: number;
}

/**
 * Graphs the author asked for, directly or as a pipeline they started — everything `listRuns` surfaces.
 * An allowlist rather than a denylist of background graphs (`chat-title`, `chat-compact` —
 * fire-and-forget metadata graphs no `turn()` caller awaits or reports through) because a
 * forgotten entry then fails closed: a new background graph stays off this list by default and never
 * leaks into the runs rail, where a forgotten denylist entry fails open exactly as `chat-title` did.
 */
const AUTHOR_FACING_GRAPHS = [
  'chat-turn',
  'premise-enhance',
  'bible-audit',
  'illustration',
  'chapter-generation',
  'chapter-finalization',
  'bible-builder',
  'novel-validation',
] as const;

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
    private readonly pluginPolicy: PluginPolicyService,
    private readonly pluginProposals: PluginProposalService,
    private readonly claims: AuthoringClaimService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async seedFromBrief(projectId: bigint, body: SeedFromBriefBody): Promise<WorkflowRunResult> {
    await this.assertProjectExists(projectId);
    const result = await this.workflowRunService.runBibleBuilder({ projectId, brief: body.brief, force: body.force });
    if (result.outcome === 'completed') await this.stagePluginCanon(projectId);
    return result;
  }

  private async assertProjectExists(projectId: bigint): Promise<void> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { id: true } });
    if (!project) throw AppErrorCode.PRJ_001.create();
  }

  private async stagePluginCanon(projectId: bigint): Promise<void> {
    const staged = await this.pluginProposals.augmentEnabled(projectId).catch(err => {
      this.logger.warn('canon augmentation staging failed', { projectId, err });
      return [];
    });
    if (staged.length > 0) this.logger.info('canon augmentation staged proposals', { projectId, proposalIds: staged.map(proposal => proposal.id) });
  }

  listBriefs(projectId: bigint): Promise<Pick<Generation.Brief, 'chapter' | 'volumeKey' | 'title' | 'staleReason' | 'densityRisk' | 'writeMode' | 'insertedAt' | 'updatedAt'>[]> {
    return this.db.query.briefs.findMany({
      where: eq(schema.briefs.projectId, projectId),
      columns: { chapter: true, volumeKey: true, title: true, staleReason: true, densityRisk: true, writeMode: true, insertedAt: true, updatedAt: true },
      orderBy: asc(schema.briefs.chapter),
    });
  }

  async getBrief(projectId: bigint, chapter: number): Promise<Generation.Brief> {
    const brief = await this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) });
    if (!brief) throw AppErrorCode.DRF_001.create();
    return brief;
  }

  async updateBrief(projectId: bigint, chapter: number, body: UpdateBriefBody): Promise<Generation.Brief> {
    const sceneErrors = body.scenes ? validateBriefScenes(body.scenes) : [];
    if (sceneErrors.length > 0) throw AppErrorCode.BRF_004.create({ reason: sceneErrors.join('; ') });
    const edits: Partial<typeof schema.briefs.$inferInsert> = { body: body.body, densityRisk: null };
    const title = body.title?.trim();
    if (title) edits.title = title;
    if (body.knowledgeContract) edits.knowledgeContract = { pov: body.knowledgeContract.pov, learns: body.knowledgeContract.learns ?? [] };
    if (body.endingContract !== undefined) edits.endingContract = body.endingContract && handEditedEndingContract(body.endingContract);
    if (body.chapterPurpose !== undefined) edits.chapterPurpose = body.chapterPurpose.trim() || null;
    if (body.pov !== undefined) edits.pov = body.pov.trim() || null;
    if (body.guidance !== undefined) edits.guidance = body.guidance.trim() || null;
    if (body.direction !== undefined) edits.direction = body.direction?.trim() || null;
    if (body.contentMode !== undefined) edits.contentMode = body.contentMode;
    if (body.scenes !== undefined) edits.scenes = body.scenes && normalizeBriefScenes(body.scenes);
    if (body.claimedMilestones !== undefined) edits.claimedMilestones = body.claimedMilestones && normalizeStringList(body.claimedMilestones);
    if (body.isEnding !== undefined) edits.isEnding = body.isEnding;

    const result = await this.db.transaction(async tx => {
      const [existing] = await tx
        .select()
        .from(schema.briefs)
        .where(and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)))
        .for('update');
      const revision = (existing?.revision ?? 0) + 1;
      const volumeKey = existing ? existing.volumeKey : await nearestVolumeKey(tx, projectId, chapter);
      const contentHash = briefContentHash({ ...existing, chapter, volumeKey, ...edits });
      const [upserted] = await tx
        .insert(schema.briefs)
        .values({ knowledgeContract: null, ...edits, projectId, chapter, volumeKey, body: body.body, revision, contentHash, handEdited: true })
        .onConflictDoUpdate({
          target: [schema.briefs.projectId, schema.briefs.chapter],
          set: { ...edits, revision, contentHash, handEdited: true, updatedAt: new Date() },
        })
        .returning();
      return upserted;
    });
    if (!result) throw AppErrorCode.DRF_001.create();
    return result;
  }

  async generate(projectId: bigint, body: GenerateBody): Promise<JobEnqueueResult> {
    await this.assertProjectExists(projectId);
    const limit = body.limit ?? 1;

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
    // truncated at the first unfilled external-write slot or at a chapter with no prose (see `selectGenerationBatch`).
    // Because each chapter is drafted before the next begins, generation only advances once the previous chapter is
    // done — no gaps, no skipping ahead.
    const allBriefs = await this.db.query.briefs.findMany({ where: eq(schema.briefs.projectId, projectId), orderBy: asc(schema.briefs.chapter) });
    const existingDrafts = await this.db.query.drafts.findMany({ where: eq(schema.drafts.projectId, projectId), columns: { chapter: true } });
    const finalizedChapters = await this.db.query.chapters.findMany({
      where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.status, 'done')),
      columns: { number: true },
    });
    const started = new Set(existingDrafts.map(d => d.chapter));
    const finalized = new Set(finalizedChapters.map(c => c.number));

    const { chapters, stoppedAtExternalChapter, stoppedAtUnwrittenChapter, blockedChapter } = selectGenerationBatch(allBriefs, started, finalized, limit);
    if (chapters.length === 0 && allBriefs.length === 0) throw AppErrorCode.BRF_001.create();
    if (chapters.length === 0 && stoppedAtUnwrittenChapter !== undefined) {
      throw AppErrorCode.DRF_011.create({ chapter: String(blockedChapter), blocker: String(stoppedAtUnwrittenChapter) });
    }

    const briefByChapter = new Map(allBriefs.map(brief => [brief.chapter, brief]));
    const staleChapters = chapters.filter(chapter => briefByChapter.get(chapter)?.staleReason != null);
    if (staleChapters.length > 0) throw AppErrorCode.BRF_002.create({ chapters: staleChapters.join(', ') });

    this.logger.info('generate: enqueueing chapters', { projectId, chapters, limit, autoFix: body.autoFix, stoppedAtExternalChapter, stoppedAtUnwrittenChapter });
    const job = await this.enqueueGeneration(projectId, chapters, body);
    return { ...job, stoppedAtExternalChapter, stoppedAtUnwrittenChapter };
  }

  /** Drafts one planned chapter that has no draft yet; replacing an existing draft stays with {@link regenerateChapter}, which the author starts. */
  async generateChapter(projectId: bigint, chapter: number): Promise<JobEnqueueResult> {
    const draft = await this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)), columns: { id: true } });
    if (draft) throw AppErrorCode.DRF_015.create({ chapter: String(chapter) });
    return this.regenerateChapter(projectId, chapter);
  }

  /**
   * Redrafts one chapter from its current brief through the same generation job as `generate` — judge, readability,
   * writer scrubs and repairs — replacing the prose in place, so the old text stays in the draft's revision history.
   * It keeps generate's rules: chapters are drafted in order, a contradiction elsewhere or an unfilled external chapter
   * at or before this one blocks it, and only one generation job runs at a time.
   */
  async regenerateChapter(projectId: bigint, chapter: number): Promise<JobEnqueueResult> {
    await this.assertProjectExists(projectId);

    const [brief, draft, activeJob, otherContradiction, allBriefs, existingDrafts, finalizedChapters] = await Promise.all([
      this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) }),
      this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)), columns: { status: true } }),
      this.db.query.jobs.findFirst({
        where: and(eq(schema.jobs.projectId, projectId), eq(schema.jobs.kind, 'generate'), inArray(schema.jobs.status, ['pending', 'in_progress'])),
        columns: { id: true },
      }),
      this.db.query.drafts.findFirst({
        where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.reviewStatus, 'contradiction'), ne(schema.drafts.chapter, chapter)),
        columns: { chapter: true },
      }),
      this.db.query.briefs.findMany({ where: eq(schema.briefs.projectId, projectId), columns: { chapter: true, writeMode: true } }),
      this.db.query.drafts.findMany({ where: eq(schema.drafts.projectId, projectId), columns: { chapter: true } }),
      this.db.query.chapters.findMany({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.status, 'done')), columns: { number: true } }),
    ]);

    if (!brief) throw AppErrorCode.BRF_001.create();
    if (brief.staleReason) throw AppErrorCode.BRF_002.create({ chapters: String(chapter) });
    if (draft?.status === 'final') throw AppErrorCode.CHP_008.create();
    if (activeJob) throw AppErrorCode.DRF_010.create();
    if (otherContradiction) throw AppErrorCode.DRF_003.create();

    const earlierDrafts = new Set(existingDrafts.map(d => d.chapter).filter(n => n !== chapter));
    const finalized = new Set(finalizedChapters.map(c => c.number));
    if (finalized.has(chapter)) throw AppErrorCode.CHP_008.create();
    const { chapters, stoppedAtExternalChapter, stoppedAtUnwrittenChapter } = selectGenerationBatch(allBriefs, earlierDrafts, finalized, 1);
    if (stoppedAtExternalChapter !== undefined) throw AppErrorCode.DRF_012.create({ chapter: String(chapter), blocker: String(stoppedAtExternalChapter) });
    if (stoppedAtUnwrittenChapter !== undefined) throw AppErrorCode.DRF_011.create({ chapter: String(chapter), blocker: String(stoppedAtUnwrittenChapter) });
    const [next] = chapters;
    if (next !== chapter) throw AppErrorCode.DRF_011.create({ chapter: String(chapter), blocker: String(next) });

    this.logger.info('regenerate: enqueueing chapter', { projectId, chapter, hadDraft: Boolean(draft) });
    return this.enqueueGeneration(projectId, chapters, { autoFix: true });
  }

  private async enqueueGeneration(projectId: bigint, chapters: number[], options: Pick<GenerateBody, 'autoFix' | 'maxFixes' | 'guidance'>): Promise<JobEnqueueResult> {
    const target = [...chapters].sort((a, b) => a - b).join(',');
    const payload = { chapters, autoFix: options.autoFix, maxFixes: options.maxFixes, guidance: options.guidance };
    const jobId = await this.jobService.enqueue(projectId, 'generate', target, payload);
    this.jobExecutor.dispatch(jobId).catch(err => this.logger.error('generate job dispatch failed', { err, jobId }));
    return { jobId, kind: 'generate', status: 'pending', target };
  }

  async listDrafts(projectId: bigint): Promise<Generation.Draft[]> {
    return this.db.query.drafts.findMany({ where: eq(schema.drafts.projectId, projectId), orderBy: asc(schema.drafts.chapter) });
  }

  async listDraftSummaries(projectId: bigint): Promise<DraftSummary[]> {
    const drafts = schema.drafts;
    return this.db
      .select({
        chapter: drafts.chapter,
        title: drafts.title,
        status: drafts.status,
        reviewStatus: drafts.reviewStatus,
        judge: drafts.judge,
        isolated: drafts.isolated,
        stale: sql<boolean>`${drafts.staleReason} is not null`,
        updatedAt: drafts.updatedAt,
        writtenAt:
          sql<Date>`coalesce((select max(${schema.draftRevisions.createdAt}) from ${schema.draftRevisions} where ${schema.draftRevisions.draftId} = "drafts"."id"), ${drafts.createdAt})`.mapWith(
            drafts.createdAt,
          ),
      })
      .from(drafts)
      .where(eq(drafts.projectId, projectId))
      .orderBy(asc(drafts.chapter));
  }

  async getDraft(projectId: bigint, chapter: number): Promise<Generation.Draft> {
    const draft = await this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)) });
    if (!draft) throw AppErrorCode.DRF_001.create();
    return draft;
  }

  async updateDraft(projectId: bigint, chapter: number, body: UpdateDraftBody): Promise<Generation.Draft> {
    const existing = await this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)) });
    if (existing?.status === 'final') throw AppErrorCode.DRF_002.create();

    return this.db.transaction(async tx => {
      const [draft] = await tx
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
          setWhere: ne(schema.drafts.status, 'final'),
        })
        .returning();
      if (!draft) throw await refusedDraftWriteError(tx, projectId, chapter);

      await tx
        .insert(schema.draftRevisions)
        .values({ projectId, draftId: draft.id, revision: draft.revision, source: 'hand_edited', body: draft.body, summary: draft.summary })
        .onConflictDoNothing();
      await markDescendantDraftsStale(tx, projectId, chapter, `ancestor chapter ${chapter} was hand_edited`);
      await revokeProvisionalReveals(tx, projectId, chapter);

      return draft;
    });
  }

  async reviseDraft(projectId: bigint, chapter: number, body: ReviseDraftBody): Promise<Generation.Draft> {
    this.logger.info('reviseDraft: revising draft', { projectId, chapter });
    this.logger.debug('reviseDraft: feedback note', { projectId, chapter, note: body.note });
    const [draft] = await this.db
      .select({ ...getTableColumns(schema.drafts), xmin: sql<string>`${schema.drafts}.xmin::text` })
      .from(schema.drafts)
      .where(and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)));
    if (!draft) throw AppErrorCode.DRF_001.create();
    if (draft.status === 'final') throw AppErrorCode.DRF_002.create();

    const brief = await this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) });
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const { policy, project: routedProject } = await this.draftRoute(projectId, draft, { role: 'revision', chapter }, project);
    const [pack, forbidden] = await Promise.all([this.contextAssembler.forChapter(projectId, chapter, { policy }), loadWriterForbiddenFacts(this.db, projectId, chapter)]);

    const ctx = { projectId, promptKey: PROMPT_REGISTRY.revision.key, promptVersion: PROMPT_REGISTRY.revision.version, role: PROMPT_REGISTRY.revision.key };
    const revised = (await this.modelRouter.structured(
      PROMPT_REGISTRY.revision,
      {
        contextPack: pack.rendered,
        chapterBrief: (await loadWriterBrief(this.db, projectId, chapter, brief, forbidden)).chapterBrief,
        draftBody: draft.body,
        feedback: scrubForWriter(body.note, forbidden),
      },
      ctx,
      routedProject,
      policy,
    )) as { title: string; body: string; summary: string; state?: GenerationState };

    return this.db.transaction(async tx => {
      const [updated] = await tx
        .update(schema.drafts)
        .set({
          title: revised.title,
          body: revised.body,
          summary: revised.summary,
          state: revised.state as never,
          revision: sql`${schema.drafts.revision} + 1`,
          reviewStatus: 'needs_review',
          staleReason: null,
          ...(draft.isolated ? { isolated: true } : raisedContainment(policy)),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.drafts.id, draft.id),
            eq(schema.drafts.revision, draft.revision),
            ne(schema.drafts.status, 'final'),
            // xmin moves on every committed update of the row, whether or not the writer touched updated_at, and carries no clock to mis-decode.
            sql`${schema.drafts}.xmin::text = ${draft.xmin}`,
          ),
        )
        .returning();
      if (!updated) {
        this.logger.warn('reviseDraft: draft changed during the model call — revision discarded', { projectId, chapter, baseRevision: draft.revision });
        throw await refusedDraftWriteError(tx, projectId, chapter);
      }

      const [feedback] = await tx
        .insert(schema.userFeedback)
        .values({ projectId, artifactType: 'draft', artifactRef: String(chapter), disposition: 'revision_requested', note: body.note })
        .returning({ id: schema.userFeedback.id });

      await tx
        .insert(schema.draftRevisions)
        .values({
          projectId,
          draftId: updated.id,
          revision: updated.revision,
          source: 'revised',
          body: revised.body,
          summary: revised.summary,
          state: revised.state as never,
          feedbackId: feedback?.id,
        })
        .onConflictDoNothing();

      await markDescendantDraftsStale(tx, projectId, chapter, `ancestor chapter ${chapter} was revised`);
      await revokeProvisionalReveals(tx, projectId, chapter);

      return updated;
    });
  }

  async judgeDraft(projectId: bigint, chapter: number): Promise<JudgeResult> {
    this.logger.debug('judgeDraft: starting', { projectId, chapter });
    const draft = await this.getDraft(projectId, chapter);
    if (draft.status === 'final') throw AppErrorCode.DRF_002.create();
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });

    const { policy, project: routedProject } = await this.draftRoute(projectId, draft, { role: 'judge', chapter }, project);
    const pack = await this.contextAssembler.forChapter(projectId, chapter, { policy });
    const runId = `judge-${projectId}-${chapter}-${Date.now()}`;
    const telemetry = { projectId, runId, node: 'judge', promptKey: PROMPT_REGISTRY.judge.key, promptVersion: PROMPT_REGISTRY.judge.version, role: 'judge' };
    const model = await this.modelRouter.chatFor('judge', telemetry, routedProject, policy);
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

    await this.db.transaction(async tx => {
      const [judged] = await tx
        .update(schema.drafts)
        .set({
          judge: verdict,
          judgeNote: findings.map(f => `[${f.severity}] ${f.text}`).join('\n') || null,
          reviewStatus: verdict === 'consistent' ? 'needs_review' : 'contradiction',
          updatedAt: new Date(),
        })
        .where(and(eq(schema.drafts.id, draft.id), eq(schema.drafts.revision, draft.revision), ne(schema.drafts.status, 'final')))
        .returning({ id: schema.drafts.id });
      if (!judged) {
        this.logger.warn('judgeDraft: draft changed during the judge call — verdict discarded', { projectId, chapter, judgedRevision: draft.revision });
        throw await refusedDraftWriteError(tx, projectId, chapter);
      }
      await revokeProvisionalReveals(tx, projectId, chapter);
    });

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

  async approveDraft(projectId: bigint, chapter: number, body: ApproveDraftBody): Promise<Generation.Draft> {
    const draft = await this.getDraft(projectId, chapter);
    if (draft.status === 'final') throw AppErrorCode.DRF_002.create();
    if (draft.staleReason) throw AppErrorCode.DRF_007.create();
    if (draft.revision !== body.revision) throw AppErrorCode.DRF_013.create();

    // The approval, its audit row and the brief's reveals commit together, and only for the revision the author read.
    // `idempotencyKey` (unique) makes a retried approve a no-op instead of a duplicate approval row.
    const updated = await this.db.transaction(async tx => {
      const [row] = await tx
        .update(schema.drafts)
        .set({ reviewStatus: 'approved', updatedAt: new Date() })
        .where(
          and(
            eq(schema.drafts.id, draft.id),
            eq(schema.drafts.revision, body.revision),
            ne(schema.drafts.status, 'final'),
            isNull(schema.drafts.staleReason),
            ne(schema.drafts.reviewStatus, 'generating'),
          ),
        )
        .returning();
      if (!row) throw await refusedDraftWriteError(tx, projectId, chapter, 'stale_aware');

      await tx
        .insert(schema.userFeedback)
        .values({
          projectId,
          artifactType: 'draft',
          artifactRef: String(chapter),
          disposition: 'approved',
          reviewerId: body.reviewerId ?? null,
          idempotencyKey: body.idempotencyKey ?? null,
          note: null,
        })
        .onConflictDoNothing({ target: schema.userFeedback.idempotencyKey });

      const reveals = await ledgerBriefReveals(tx, projectId, chapter);
      if (reveals.applied > 0) this.logger.info('brief reveals ledgered', { projectId, chapter, revision: row.revision, applied: reveals.applied });

      return row;
    });

    this.logger.info('draft approved', { projectId, chapter, revision: updated.revision, reviewerId: body.reviewerId });
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
    const resolver = await this.pluginPolicy.scoped(projectId);
    const pack = await this.contextAssembler.forChapter(projectId, chapter, { policy: resolver.forPack({ role: 'generation', chapter }, CHAPTER_PACK_CONSUMERS) });
    return { markdown: pack.rendered };
  }

  /**
   * Deletes one drafted chapter and leaves a hole at that number. Later chapters are deliberately not
   * renumbered: a draft's prose is written against the brief at the same chapter number, and briefs
   * (plus the knowledge contracts keyed off them) are not shifted, so closing the gap
   * would silently pair every later draft with someone else's brief.
   */
  async deleteDraft(projectId: bigint, chapter: number): Promise<void> {
    this.logger.info('deleteDraft: deleting draft', { projectId, chapter });
    const draft = await this.getDraft(projectId, chapter);
    if (draft.status === 'final') throw AppErrorCode.DRF_002.create();

    await this.db.transaction(async tx => {
      const deleted = await tx
        .delete(schema.drafts)
        .where(and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter), ne(schema.drafts.status, 'final')))
        .returning({ id: schema.drafts.id });
      if (deleted.length === 0) throw await refusedDraftWriteError(tx, projectId, chapter);
      await revokeProvisionalReveals(tx, projectId, chapter);

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
    return this.db.transaction(async tx => {
      const [draft] = await tx
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
          setWhere: ne(schema.drafts.status, 'final'),
        })
        .returning();
      if (!draft) throw await refusedDraftWriteError(tx, projectId, chapter);

      await tx
        .insert(schema.draftRevisions)
        .values({ projectId, draftId: draft.id, revision: draft.revision, source: 'imported', body: draft.body, summary: draft.summary })
        .onConflictDoNothing();
      await markDescendantDraftsStale(tx, projectId, chapter, `ancestor chapter ${chapter} was imported`);
      await revokeProvisionalReveals(tx, projectId, chapter);

      return draft;
    });
  }

  /** Finalizing commits knowledge, milestones and reader disclosure the next chapter's writer reads, so it holds the authoring claim like a job. */
  async finalize(projectId: bigint, body: FinalizeBody): Promise<WorkflowRunResult> {
    return this.claims.runExclusive(
      projectId,
      'finalize',
      () => AppErrorCode.JOB_002.create(),
      () => this.finalizeClaimed(projectId, body),
    );
  }

  private async finalizeClaimed(projectId: bigint, body: FinalizeBody): Promise<WorkflowRunResult> {
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

    return this.workflowRunService.runChapterFinalization({
      projectId,
      chapter: draft.chapter,
      draftId: draft.id,
      draftRevision: draft.revision,
      prose: draft.body,
      summary: draft.summary ?? '',
      title: draft.title ?? undefined,
      continuationState: draft.state as GenerationState | undefined,
      generator: draft.generator,
      isolated: draft.isolated,
    });
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

  async generateUnrestricted(projectId: bigint, chapter: number, body: GenerateUnrestrictedBody): Promise<Generation.Draft> {
    return this.claims.runExclusive(
      projectId,
      'generate',
      () => AppErrorCode.JOB_002.create(),
      async () => {
        await this.assertWrittenBefore(projectId, chapter);
        return this.generateUnrestrictedClaimed(projectId, chapter, body);
      },
    );
  }

  /** Chapters are written strictly in order: chapter N is writable only once every chapter before it has a draft or finalized prose. */
  private async assertWrittenBefore(projectId: bigint, chapter: number): Promise<void> {
    const [drafts, finalized] = await Promise.all([
      this.db.query.drafts.findMany({ where: and(eq(schema.drafts.projectId, projectId), lt(schema.drafts.chapter, chapter)), columns: { chapter: true } }),
      this.db.query.chapters.findMany({
        where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.status, 'done'), lt(schema.chapters.number, chapter)),
        columns: { number: true },
      }),
    ]);
    const blocker = firstUnwrittenChapter(new Set(drafts.map(d => d.chapter)), new Set(finalized.map(c => c.number)));
    if (blocker < chapter) throw AppErrorCode.DRF_011.create({ chapter: String(chapter), blocker: String(blocker) });
  }

  private async generateUnrestrictedClaimed(projectId: bigint, chapter: number, body: GenerateUnrestrictedBody): Promise<Generation.Draft> {
    const locked = await this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)) });
    if (locked?.status === 'final') throw AppErrorCode.DRF_002.create();

    const [brief, project] = await Promise.all([
      this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) }),
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
    ]);

    const { policy, project: routedProject } = await resolveUnrestrictedRoute(
      { pluginPolicy: this.pluginPolicy, modelRouter: this.modelRouter },
      projectId,
      { role: 'generation', chapter },
      project as ProjectConfig | undefined,
    );
    const pack = await this.contextAssembler.forChapter(projectId, chapter, { policy });
    const ctx = { projectId, promptKey: PROMPT_REGISTRY.generation.key, promptVersion: PROMPT_REGISTRY.generation.version, role: PROMPT_REGISTRY.generation.key };
    const forbidden = await loadWriterForbiddenFacts(this.db, projectId, chapter);
    const promptVars = {
      stableContext: pack.renderedStable,
      volatileContext: pack.renderedVolatile,
      ...(await loadWriterBrief(this.db, projectId, chapter, brief, forbidden)),
      ...generationWordTargetVars(resolveWordTarget(project)),
    };
    const guidance = body.guidance ? scrubForWriter(body.guidance, forbidden) : '';
    const generated = (await this.modelRouter.structured(PROMPT_REGISTRY.generation, { ...promptVars, guidance }, ctx, routedProject, policy)) as {
      title: string;
      body: string;
      summary: string;
      state?: GenerationState;
    };
    const expansion = await expandShortDraft(this.modelRouter, { ...promptVars, guidance, body: generated.body }, { ...ctx, node: 'generateUnrestricted' }, routedProject, policy);
    const result = { ...generated, body: expansion.body };

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
      await revokeProvisionalReveals(tx, projectId, chapter);

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
    if (draft.isolated) throw AppErrorCode.DRF_008.create();
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const policy = await this.pluginPolicy.resolve(projectId, { role: 'continuity', chapter }, project);
    const pack = await this.contextAssembler.forChapter(projectId, chapter, { policy });

    const ctx = { projectId, promptKey: PROMPT_REGISTRY.continuity.key, promptVersion: PROMPT_REGISTRY.continuity.version, role: PROMPT_REGISTRY.continuity.key };
    const proposal = await this.modelRouter.structured(
      PROMPT_REGISTRY.continuity,
      { contextPack: pack.rendered, chapterNumber: chapter, chapterProse: draft.body },
      ctx,
      project as never,
      policy,
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
    if (draft.isolated) throw AppErrorCode.DRF_008.create();
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const policy = await this.pluginPolicy.resolve(projectId, { role: 'extraction', chapter }, project);
    const pack = await this.contextAssembler.forChapter(projectId, chapter, { policy });

    const promptModule = PROMPT_REGISTRY['chapter-extract'];
    const ctx = { projectId, promptKey: promptModule.key, promptVersion: promptModule.version, role: promptModule.role ?? promptModule.key };
    const output = (await this.modelRouter.structured(
      promptModule,
      { contextPack: pack.rendered, chapterNumber: chapter, chapterProse: draft.body },
      ctx,
      project as never,
      policy,
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
      model: (await this.modelRouter.resolveFor(promptModule.role ?? 'extraction', project as never, projectId, policy)).model,
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
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const { policy, project: routedProject } = await this.draftRoute(projectId, draft, { role: 'review', chapter }, project);
    const [pack, brief] = await Promise.all([
      this.contextAssembler.forChapter(projectId, chapter, { policy }),
      this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) }),
    ]);

    const ctx = { projectId, promptKey: PROMPT_REGISTRY.review.key, promptVersion: PROMPT_REGISTRY.review.version, role: PROMPT_REGISTRY.review.key };
    const review = (await this.modelRouter.structured(
      PROMPT_REGISTRY.review,
      { contextPack: pack.rendered, chapterBrief: brief?.body ?? '', draftBody: draft.body },
      ctx,
      routedProject,
      policy,
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
  async listRuns(projectId: bigint): Promise<PresentedRun[]> {
    const runs = await this.db.query.workflowRuns.findMany({
      where: and(eq(schema.workflowRuns.projectId, projectId), inArray(schema.workflowRuns.graph, AUTHOR_FACING_GRAPHS)),
      orderBy: [desc(schema.workflowRuns.startedAt)],
      limit: 20,
    });
    return runs.map(presentRun);
  }

  async getRun(projectId: bigint, runId: string): Promise<PresentedRun & { modelCalls: Ai.ModelCall[]; toolCalls: Ai.ToolCall[]; contextPack?: RunContextPackSummary }> {
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
    return { ...presentRun(run), modelCalls, toolCalls, ...(contextPack ? { contextPack } : {}) };
  }

  // Reports 'not_delivered' instead of writing 'cancelled': cancellation is process-local,
  // so a running row with no controller here is owned by another replica that never saw the request and is
  // still working. The abort is what was undeliverable, not the status.
  async cancelRun(projectId: bigint, runId: string): Promise<CancelRunResponse> {
    const run = await this.db.query.workflowRuns.findFirst({
      where: and(eq(schema.workflowRuns.projectId, projectId), eq(schema.workflowRuns.id, runId)),
      columns: { status: true },
    });
    if (!run) throw AppErrorCode.PRJ_001.create();
    if (run.status !== 'running') return { runId, status: run.status, outcome: 'already_settled' };

    const live = this.workflowRunService.cancel(runId);
    return { runId, status: 'running', outcome: live ? 'stopping' : 'not_delivered' };
  }

  // The state transition itself is JobService.cancel's atomic conditional update; this only
  // translates its result. A job driving a workflow run is not cancelled here — the job row does not
  // know which run it currently owns, only the executor does mid-dispatch, so the executor must cancel that run
  // itself when it observes `cancelRequestedAt` at the next step boundary.
  async cancelJob(projectId: bigint, jobId: string): Promise<CancelJobResponse> {
    const result = await this.jobService.cancel(jobId, projectId);
    if (!result) throw AppErrorCode.JOB_001.create();
    return { jobId, status: result.status, outcome: result.outcome };
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

  private async draftRoute(projectId: bigint, draft: { isolated: boolean }, call: RoutedCall, project: Project.Row | undefined): Promise<CallRoute> {
    if (draft.isolated) return resolveUnrestrictedRoute({ pluginPolicy: this.pluginPolicy, modelRouter: this.modelRouter }, projectId, call, project as ProjectConfig | undefined);
    return { policy: await this.pluginPolicy.resolve(projectId, call, project), project: project as ProjectConfig | undefined };
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
