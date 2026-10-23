import { and, asc, eq, getTableColumns, inArray, isNull, ne, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import {
  assertPlanRevealsHold,
  assertTeacherSettled,
  declaredDraftFields,
  ledgerBriefReveals,
  lockProjectPlan,
  markDescendantDraftsStale,
  nextWritableChapter,
  normalizeLineEndings,
  pruneDraftHistory,
  refusedDraftWriteError,
  REVEAL_STALE_PREFIX,
  revokeProvisionalReveals,
  selectGenerationBatch,
  untilFirstTeacher,
} from '@server/common';
import { APP_NAME } from '@server/constants';
import { type Ai, type Generation, type Job, type PrimaryDatabase, type Project, type Refinement, schema } from '@server/database';

import { chapterContainment, chapterContentMode, type ChapterRole, routeChapterCall } from '../ai/chapter-route';
import { ContextAssembler } from '../ai/context/context-assembler.service';
import { loadWriterBrief } from '../ai/context/writer-brief';
import { applyContinuityDelta, continuityHasHeldEntries, filterToHeldEntries } from '../ai/graphs/apply-continuity';
import { CHAPTER_PACK_CONSUMERS } from '../ai/graphs/chapter-generation.graph';
import { expandShortDraft } from '../ai/graphs/draft-expansion';
import { bibleHashOf, keptBackOf } from '../ai/graphs/writer-snapshot-capture';
import { type WorkflowRunResult, WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { CHAPTER_EXTRACT_OPS, PROMPT_REGISTRY } from '../ai/prompts';
import { generationWordTargetVars } from '../ai/prompts/generation.prompt';
import { RetrievalService } from '../ai/retrieval/retrieval.service';
import { type ContinuityOutput, ContinuitySchema } from '../ai/schemas';
import { type ChapterExtractOutput } from '../ai/schemas/chapter-extract.schema';
import { type GenerationState } from '../ai/schemas/generation.schema';
import { parseSchema, renderSchemaIssues } from '../ai/schemas/validate';
import { isolatedContinuityProposal, isolatedExtractionContext, standardReadableExtraction } from '../ai/isolation-read-policy';
import { type TelemetryContext } from '../ai/telemetry.handler';
import { type CallRoute } from '../ai/unrestricted-route';
import { emptyCallUsageTotals } from '../ai/usage/call-usage';
import { WriterSnapshotService } from '../ai/writer-snapshot.service';
import { canonRefreshTarget } from '../audit/chapter-canon-refresh.service';
import { loadWriterDisclosurePolicy } from '../bible/fact/writer-disclosure-policy';
import { resolveWordTarget } from '../eval/deterministic-metrics';
import { FINALIZE_REVIEW_JOB_TARGET, stageFinalizeReview } from '../finalize-review/finalize-review-stage';
import { AuthoringClaimService } from '../jobs/authoring-claim.service';
import { redactJobForResponse, toJobUsageResponse } from '../jobs/job-response';
import { type JobUsageResponse } from '../jobs/jobs.dto';
import { JobExecutor } from '../jobs/job.executor';
import { type JobOrigin, JobService } from '../jobs/job.service';
import { PluginPolicyService } from '../plugins/plugin-policy.service';
import { PluginProposalService } from '../plugins/plugin-proposal.service';
import { parseOptionalChangeSet } from '../refinement/change-set';
import { ProposalService } from '../refinement/proposal.service';
import { overrideOpenBlockingOnApproval } from '../review/review-records';
import { ChapterImageService } from './chapter-image.service';
import { asRetryableSave, assertNotBeingGenerated, draftBaseOf, insertHandWrittenDraft, saveDraftSummary, saveHandWrittenDraft } from './draft-save';
import { finalizeRefusals } from './finalize-refusals';
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
  type UpdateContinuityBody,
  type UpdateDraftBody,
  type UpdateSummaryBody,
} from './generation.dto';

export type ApprovedDraft = Generation.Draft & { overriddenFindings: number };

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

export interface FinalizeReadiness {
  ready: boolean;
  blockers: { code: string; message: string }[];
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
  /** Set when a chapter whose plan teaches its cast something ended the batch before its limit: the next waits for its approval. */
  stoppedAtTeachingChapter?: number;
  /** Set when the same work was already queued or running: the job named is that one, still reporting to whoever started it. */
  deduped?: boolean;
}

const APPROVED_AS_WRITTEN_PREFIX = 'approved as written over: ';

@Injectable()
export class GenerationService {
  private readonly logger = Logger.getLogger(APP_NAME, GenerationService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly workflowRunService: WorkflowRunService,
    private readonly modelRouter: ModelRouterService,
    private readonly contextAssembler: ContextAssembler,
    private readonly retrievalService: RetrievalService,
    private readonly jobService: JobService,
    private readonly jobExecutor: JobExecutor,
    private readonly proposalService: ProposalService,
    private readonly chapterImages: ChapterImageService,
    private readonly pluginPolicy: PluginPolicyService,
    private readonly pluginProposals: PluginProposalService,
    private readonly claims: AuthoringClaimService,
    private readonly writerSnapshots: WriterSnapshotService,
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

  async generate(projectId: bigint, body: GenerateBody): Promise<JobEnqueueResult> {
    await this.assertProjectExists(projectId);
    const limit = body.limit ?? 1;

    // Never run two generation streams at once: overlapping streams both pick "the next chapter" and persist drafts out of order.
    // An active generation job is returned unchanged instead of starting a competing one.
    const activeJob = await this.db.query.jobs.findFirst({
      where: and(eq(schema.jobs.projectId, projectId), eq(schema.jobs.kind, 'generate'), inArray(schema.jobs.status, ['pending', 'in_progress'])),
    });
    if (activeJob) {
      this.logger.debug('generate: a generation job is already active — returning it', { projectId, jobId: activeJob.id, status: activeJob.status });
      return { jobId: activeJob.id, kind: 'generate', status: activeJob.status, target: activeJob.target ?? '' };
    }

    const contradiction = await this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.reviewStatus, 'contradiction')) });
    if (contradiction) throw AppErrorCode.DRF_003.create();

    // Strictly ascending: the next chapters with a brief but no draft, truncated at the first unfilled external-write slot or chapter with no prose (see
    // `selectGenerationBatch`).
    // Each chapter is drafted before the next begins, so there are no gaps and no skipping ahead.
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
    const [first] = chapters;
    if (first !== undefined) await assertTeacherSettled(this.db, projectId, first);
    const batch = untilFirstTeacher(chapters, briefByChapter);
    const staleChapters = batch.filter(chapter => briefByChapter.get(chapter)?.staleReason != null);
    if (staleChapters.length > 0) throw AppErrorCode.BRF_002.create({ chapters: staleChapters.join(', ') });

    const stoppedAtTeachingChapter = batch.length < chapters.length ? batch.at(-1) : undefined;
    this.logger.info('generate: enqueueing chapters', {
      projectId,
      chapters: batch,
      limit,
      autoFix: body.autoFix,
      stoppedAtExternalChapter,
      stoppedAtUnwrittenChapter,
      stoppedAtTeachingChapter,
    });
    const job = await this.enqueueGeneration(projectId, batch, body);
    return { ...job, stoppedAtExternalChapter, stoppedAtUnwrittenChapter, stoppedAtTeachingChapter };
  }

  /** Drafts one planned chapter that has no draft yet; replacing an existing draft stays with {@link regenerateChapter}, which the author starts. */
  async generateChapter(projectId: bigint, chapter: number, origin?: JobOrigin): Promise<JobEnqueueResult> {
    const draft = await this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)), columns: { id: true } });
    if (draft) throw AppErrorCode.DRF_015.create({ chapter: String(chapter) });
    return this.regenerateChapter(projectId, chapter, origin);
  }

  /**
   * Redrafts one chapter from its current brief through the same generation job as `generate` — judge, readability,
   * writer scrubs and repairs — replacing the prose in place, so the old text stays in the draft's revision history.
   * It keeps generate's rules: chapters are drafted in order, a contradiction elsewhere or an unfilled external chapter
   * at or before this one blocks it, and only one generation job runs at a time.
   */
  async regenerateChapter(projectId: bigint, chapter: number, origin?: JobOrigin): Promise<JobEnqueueResult> {
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
    await assertTeacherSettled(this.db, projectId, chapter);

    this.logger.info('regenerate: enqueueing chapter', { projectId, chapter, hadDraft: Boolean(draft) });
    return this.enqueueGeneration(projectId, chapters, { autoFix: true }, origin);
  }

  private async enqueueGeneration(
    projectId: bigint,
    chapters: number[],
    options: Pick<GenerateBody, 'autoFix' | 'maxFixes' | 'guidance'>,
    origin?: JobOrigin,
  ): Promise<JobEnqueueResult> {
    const target = [...chapters].sort((a, b) => a - b).join(',');
    const payload = { chapters, autoFix: options.autoFix, maxFixes: options.maxFixes, guidance: options.guidance, ...(origin ? { origin } : {}) };
    const { id: jobId, outcome } = await this.jobService.enqueueJob(projectId, 'generate', target, payload);
    this.jobExecutor.dispatch(jobId).catch(err => this.logger.error('generate job dispatch failed', { err, jobId }));
    return { jobId, kind: 'generate', status: 'pending', target, ...(outcome === 'deduped' ? { deduped: true } : {}) };
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
    const fields = { title: body.title, body: body.body, summary: body.summary, state: body.state };
    const base = draftBaseOf(body);
    return this.db.transaction(tx => saveHandWrittenDraft(tx, { projectId, chapter, source: 'hand_edited', fields, base })).catch(asRetryableSave);
  }

  /** "Write it myself": an empty hand-written draft at the next writable chapter, which the server — not the editor — chooses. */
  async startNextDraft(projectId: bigint): Promise<Generation.Draft> {
    await this.assertProjectExists(projectId);
    return this.db
      .transaction(async tx => {
        const chapter = await nextWritableChapter(tx, projectId);
        return insertHandWrittenDraft(tx, { projectId, chapter, source: 'hand_edited', fields: { body: '' } });
      })
      .catch(asRetryableSave);
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
    const mode = chapterContentMode({ brief, isolated: draft.isolated });
    const { policy, project: routedProject } = await this.chapterRoute(projectId, { role: 'revise', chapter, mode }, project);
    const disclosure = await loadWriterDisclosurePolicy(this.db, projectId, chapter);
    const pack = await this.contextAssembler.forChapter(projectId, chapter, { policy, disclosure, enforceWriterReservations: true });

    const ctx: TelemetryContext = {
      projectId,
      chapter,
      promptKey: PROMPT_REGISTRY.revision.key,
      promptVersion: PROMPT_REGISTRY.revision.version,
      role: PROMPT_REGISTRY.revision.key,
      onMessages: this.writerSnapshots.onMessages({
        projectId,
        chapter,
        draftRevision: draft.revision + 1,
        attempt: 1,
        role: 'revise',
        contextPackId: pack.id,
        keptBack: keptBackOf(disclosure, pack.omitted),
        planRevision: brief?.revision ?? null,
        bibleHash: bibleHashOf(pack.rendered),
        promptKey: PROMPT_REGISTRY.revision.key,
        promptVersion: PROMPT_REGISTRY.revision.version,
        isolated: Boolean(draft.isolated || chapterContainment(mode, policy).isolated),
        runId: null,
      }),
    };
    const revised = (await this.modelRouter.structured(
      PROMPT_REGISTRY.revision,
      {
        contextPack: pack.rendered,
        chapterBrief: (await loadWriterBrief(this.db, projectId, chapter, brief, disclosure)).chapterBrief,
        draftBody: draft.body,
        feedback: [disclosure.scrub(body.note, 'note'), ...disclosure.leakLines(draft.body)].join('\n'),
      },
      ctx,
      routedProject,
      disclosure.scrubPolicy(policy),
    )) as { title: string; body: string; summary: string; state?: GenerationState };
    revised.body = normalizeLineEndings(revised.body);

    return this.db.transaction(async tx => {
      const [updated] = await tx
        .update(schema.drafts)
        .set({
          title: revised.title,
          body: revised.body,
          summary: revised.summary,
          state: revised.state as never,
          revision: sql`${schema.drafts.revision} + 1`,
          reviewStatus: disclosure.leakLines(revised.body).length > 0 ? 'contradiction' : 'needs_review',
          staleReason: null,
          ...(draft.isolated ? { isolated: true } : chapterContainment(mode, policy)),
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
          title: revised.title,
          body: revised.body,
          summary: revised.summary,
          state: revised.state as never,
          feedbackId: feedback?.id,
          isolated: updated.isolated,
        })
        .onConflictDoNothing();
      await pruneDraftHistory(tx, updated);

      await markDescendantDraftsStale(tx, projectId, chapter, `ancestor chapter ${chapter} was revised`);
      await revokeProvisionalReveals(tx, projectId, chapter);

      return updated;
    });
  }

  async feedbackDraft(projectId: bigint, chapter: number, body: FeedbackBody): Promise<Ai.UserFeedback> {
    const [feedback] = await this.db
      .insert(schema.userFeedback)
      .values({ projectId, artifactType: 'draft', artifactRef: String(chapter), disposition: body.disposition ?? 'comment', note: body.note })
      .returning();
    if (!feedback) throw AppErrorCode.DRF_001.create();
    return feedback;
  }

  async approveDraft(projectId: bigint, chapter: number, body: ApproveDraftBody): Promise<ApprovedDraft> {
    const draft = await this.getDraft(projectId, chapter);
    if (draft.status === 'final') throw AppErrorCode.DRF_002.create();
    const keptStale = draft.staleReason && body.keepStale ? draft.staleReason : null;
    if (draft.staleReason && !keptStale) throw AppErrorCode.DRF_007.create();
    if (keptStale?.startsWith(REVEAL_STALE_PREFIX)) throw AppErrorCode.DRF_017.create();
    if (draft.id !== body.draftId || draft.revision !== body.revision || draft.saveSeq !== body.saveSeq || (keptStale && keptStale !== body.staleReason))
      throw AppErrorCode.DRF_013.create();

    // The approval, its audit row and the brief's provisional reveals commit together, and only for the revision the author read. Approving
    // as written clears only the stale reason the author saw; the prose is unchanged, so nothing built on it goes stale.
    // `idempotencyKey` (unique per project) makes a retried approve a no-op instead of a duplicate approval row.
    const updated = await this.db.transaction(async tx => {
      await lockProjectPlan(tx, projectId);
      await assertPlanRevealsHold(tx, projectId, chapter);
      const [row] = await tx
        .update(schema.drafts)
        .set({ reviewStatus: 'approved', approvedRevision: body.revision, ...(keptStale ? { staleReason: null } : {}), updatedAt: new Date() })
        .where(
          and(
            eq(schema.drafts.id, body.draftId),
            eq(schema.drafts.revision, body.revision),
            eq(schema.drafts.saveSeq, body.saveSeq),
            ne(schema.drafts.status, 'final'),
            keptStale ? eq(schema.drafts.staleReason, keptStale) : isNull(schema.drafts.staleReason),
            ne(schema.drafts.reviewStatus, 'generating'),
          ),
        )
        .returning();
      if (!row) throw await refusedDraftWriteError(tx, projectId, chapter, keptStale ? 'conflict' : 'stale_aware');

      await tx
        .insert(schema.userFeedback)
        .values({
          projectId,
          artifactType: 'draft',
          artifactRef: String(chapter),
          disposition: 'approved',
          reviewerId: body.reviewerId ?? null,
          idempotencyKey: body.idempotencyKey ?? null,
          note: keptStale ? `${APPROVED_AS_WRITTEN_PREFIX}${keptStale}` : null,
        })
        .onConflictDoNothing({ target: [schema.userFeedback.projectId, schema.userFeedback.idempotencyKey] });

      const reveals = await ledgerBriefReveals(tx, projectId, chapter, row.revision);
      if (reveals.applied > 0) this.logger.info('brief reveals ledgered', { projectId, chapter, revision: row.revision, applied: reveals.applied });

      const review = await stageFinalizeReview(tx, row);
      return { ...row, overriddenFindings: await overrideOpenBlockingOnApproval(tx, row), review };
    });

    const { review, ...approved } = updated;
    this.logger.info('draft approved', { projectId, chapter, revision: approved.revision, reviewerId: body.reviewerId, overriddenFindings: approved.overriddenFindings });
    if (review.needsPrepare) await this.prepareFinalizeReview(projectId, chapter, review.reviewId);
    return approved;
  }

  /** The review is durable before its job is: a failed enqueue leaves it preparing, and the author's prepare call enqueues it again. */
  async prepareFinalizeReview(projectId: bigint, chapter: number, reviewId: bigint): Promise<void> {
    try {
      const jobId = await this.jobService.enqueue(projectId, 'finalize_review', FINALIZE_REVIEW_JOB_TARGET(chapter), { reviewId: String(reviewId) });
      await this.db.update(schema.finalizeReviews).set({ jobId, updatedAt: new Date() }).where(eq(schema.finalizeReviews.id, reviewId));
      this.jobExecutor.dispatch(jobId).catch(err => this.logger.error('finalize review job dispatch failed', { err, jobId, projectId, chapter }));
    } catch (err) {
      this.logger.error('finalize review job not enqueued', { err, projectId, chapter, reviewId });
    }
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
      await markDescendantDraftsStale(tx, projectId, chapter, `ancestor chapter ${chapter} was deleted`);
      await revokeProvisionalReveals(tx, projectId, chapter);

      // draft_revisions cascade via FK; the deleted chapter's continuity review is cleared here.
      await tx.delete(schema.continuityProposals).where(and(eq(schema.continuityProposals.projectId, projectId), eq(schema.continuityProposals.chapter, chapter)));
      await tx.delete(schema.chapterReviews).where(and(eq(schema.chapterReviews.projectId, projectId), eq(schema.chapterReviews.chapter, chapter)));
      await tx.delete(schema.finalizeReviews).where(and(eq(schema.finalizeReviews.projectId, projectId), eq(schema.finalizeReviews.chapter, chapter)));
    });

    // Scene images live outside the draft transaction (they touch disk).
    await this.chapterImages.onChapterDeleted(projectId, chapter);
  }

  async importDraft(projectId: bigint, chapter: number, body: ImportDraftBody): Promise<Generation.Draft> {
    const fields = { title: body.title, body: body.prose, summary: body.summary, generator: 'human' as const, ...declaredDraftFields(body) };
    const base = draftBaseOf(body);
    return this.db.transaction(tx => saveHandWrittenDraft(tx, { projectId, chapter, source: 'imported', fields, base })).catch(asRetryableSave);
  }

  /**
   * Finalizing commits knowledge, milestones and reader disclosure the next chapter's writer reads, so it holds the authoring claim like a job.
   * A chapter that finalized queues its Story Bible refresh once the claim is released; `origin` is the chat card it was accepted from.
   */
  async finalize(projectId: bigint, body: FinalizeBody, origin?: JobOrigin): Promise<WorkflowRunResult> {
    const { chapter, run } = await this.claims.runExclusive(
      projectId,
      'finalize',
      () => AppErrorCode.JOB_002.create(),
      () => this.finalizeClaimed(projectId, body),
    );
    if (run.status === 'completed') await this.queueCanonRefresh(projectId, chapter, origin);
    return run;
  }

  /** Best effort: the chapter is final whatever happens here, and the refresh only ever stages a card for the author. */
  private async queueCanonRefresh(projectId: bigint, chapter: number, origin?: JobOrigin): Promise<void> {
    try {
      const job = await this.jobService.enqueueJob(projectId, 'canon_refresh', canonRefreshTarget(chapter), { chapter, ...(origin ? { origin } : {}) });
      if (job.outcome !== 'deduped') this.jobExecutor.dispatch(job.id).catch(err => this.logger.error('canon refresh dispatch failed', { err, jobId: job.id, projectId, chapter }));
    } catch (err) {
      this.logger.warn('canon refresh not queued after finalize', { err, projectId, chapter });
    }
  }

  private async finalizeClaimed(projectId: bigint, body: FinalizeBody): Promise<{ chapter: number; run: WorkflowRunResult }> {
    const draft =
      body.chapter === undefined
        ? await this.db.query.drafts.findFirst({
            where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.reviewStatus, 'approved')),
            orderBy: asc(schema.drafts.chapter),
          })
        : await this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, body.chapter)) });

    if (!draft) throw AppErrorCode.DRF_001.create();
    const [refusal] = await finalizeRefusals(this.db, draft);
    if (refusal) throw refusal;
    if (draft.status === 'final') this.logger.warn('finalize: resuming a partially finalized chapter', { projectId, chapter: draft.chapter, draftId: draft.id });
    this.logger.info('finalize: finalizing chapter', { projectId, chapter: draft.chapter, draftId: draft.id, generator: draft.generator });

    const run = await this.workflowRunService.runChapterFinalization({
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
    return { chapter: draft.chapter, run };
  }

  /** What finalize would answer for this chapter right now, from the same checks, without taking the authoring claim it would need. */
  async finalizeReadiness(projectId: bigint, chapter: number): Promise<FinalizeReadiness> {
    const draft = await this.getDraft(projectId, chapter);
    const [holder, refusals] = await Promise.all([this.claims.holder(projectId), finalizeRefusals(this.db, draft)]);
    const blockers = [...(holder?.live ? [AppErrorCode.JOB_002.create()] : []), ...refusals].map(error => ({ code: error.code, message: error.message }));
    return { ready: blockers.length === 0, blockers };
  }

  async generateUnrestricted(projectId: bigint, chapter: number, body: GenerateUnrestrictedBody): Promise<Generation.Draft> {
    return this.claims.runExclusive(
      projectId,
      'generate',
      () => AppErrorCode.JOB_002.create(),
      async () => {
        await this.assertWrittenBefore(projectId, chapter);
        await assertTeacherSettled(this.db, projectId, chapter);
        return this.generateUnrestrictedClaimed(projectId, chapter, body);
      },
    );
  }

  /** Chapters are written strictly in order: chapter N is writable only once every chapter before it has a draft or finalized prose. */
  private async assertWrittenBefore(projectId: bigint, chapter: number): Promise<void> {
    const blocker = await nextWritableChapter(this.db, projectId);
    if (blocker < chapter) throw AppErrorCode.DRF_011.create({ chapter: String(chapter), blocker: String(blocker) });
  }

  private async generateUnrestrictedClaimed(projectId: bigint, chapter: number, body: GenerateUnrestrictedBody): Promise<Generation.Draft> {
    const locked = await this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)) });
    if (locked?.status === 'final') throw AppErrorCode.DRF_002.create();

    const [brief, project] = await Promise.all([
      this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) }),
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
    ]);

    const { policy, project: routedProject } = await this.chapterRoute(projectId, { role: 'draft', chapter, mode: 'unrestricted' }, project);
    const disclosure = await loadWriterDisclosurePolicy(this.db, projectId, chapter);
    const pack = await this.contextAssembler.forChapter(projectId, chapter, { policy, disclosure, enforceWriterReservations: true });
    const ctx = { projectId, chapter, promptKey: PROMPT_REGISTRY.generation.key, promptVersion: PROMPT_REGISTRY.generation.version, role: PROMPT_REGISTRY.generation.key };
    const promptVars = {
      stableContext: pack.renderedStable,
      volatileContext: pack.renderedVolatile,
      ...(await loadWriterBrief(this.db, projectId, chapter, brief, disclosure)),
      ...generationWordTargetVars(resolveWordTarget(project)),
    };
    const guidance = body.guidance ? disclosure.scrub(body.guidance, 'note') : '';
    const writerPolicy = disclosure.scrubPolicy(policy);
    const generated = (await this.modelRouter.structured(PROMPT_REGISTRY.generation, { ...promptVars, guidance }, ctx, routedProject, writerPolicy)) as {
      title: string;
      body: string;
      summary: string;
      state?: GenerationState;
    };
    const expansion = await expandShortDraft(
      this.modelRouter,
      { ...promptVars, guidance, body: generated.body },
      { ...ctx, node: 'generateUnrestricted' },
      routedProject,
      writerPolicy,
    );
    const result = { ...generated, body: normalizeLineEndings(expansion.body) };

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

      await tx
        .insert(schema.draftRevisions)
        .values({
          projectId,
          draftId: row.id,
          revision: row.revision,
          source: 'generated',
          title: row.title,
          body: row.body,
          summary: row.summary,
          state: row.state,
          isolated: true,
        })
        .onConflictDoNothing();
      await pruneDraftHistory(tx, row);
      await markDescendantDraftsStale(tx, projectId, chapter, `ancestor chapter ${chapter} was regenerated`);
      await revokeProvisionalReveals(tx, projectId, chapter);

      return row;
    });

    if (!draft) throw AppErrorCode.DRF_001.create();
    return draft;
  }

  /**
   * Runs a permissive model over a draft's prose, hand-written or AI, final or not. A non-isolated chapter's summary saves
   * directly. An isolated chapter's summary and state come back unsaved: `state` is what CHP_005 checks, so a bad one stays
   * the author's to accept via `PUT /drafts/:n`, not something this call can make true on its own.
   */
  async summarizeChapter(projectId: bigint, chapter: number): Promise<ChapterSummarizeResponse> {
    const draft = await this.getDraft(projectId, chapter);
    if (!draft.body || draft.body.trim().length === 0) throw AppErrorCode.CHP_007.create();
    if (draft.reviewStatus === 'generating') throw AppErrorCode.DRF_019.create({ chapter: String(chapter) });
    await assertNotBeingGenerated(this.db, projectId, chapter);

    const { project, mode } = await this.chapterSetting(projectId, chapter, draft);
    const route = await this.chapterRoute(projectId, { role: 'summary', chapter, mode }, project);
    const ctx = {
      projectId,
      chapter,
      promptKey: PROMPT_REGISTRY['chapter-summarize'].key,
      promptVersion: PROMPT_REGISTRY['chapter-summarize'].version,
      role: PROMPT_REGISTRY['chapter-summarize'].key,
    };

    const result = (await this.modelRouter.structured(PROMPT_REGISTRY['chapter-summarize'], { chapterProse: draft.body }, ctx, route.project, route.policy)) as {
      summary: string;
      state: Record<string, unknown>;
    };
    // An isolated summary is shown only to the author — standard calls read the approved bridge — but an unfinished chapter still takes it with its state through PUT /drafts.
    if (draft.isolated && draft.status !== 'final') return { summary: result.summary, state: result.state };

    const saved = await this.db.transaction(tx => saveDraftSummary(tx, { projectId, chapter, summary: result.summary, body: draft.body })).catch(asRetryableSave);

    return { summary: saved.summary, saveSeq: saved.saveSeq, state: result.state };
  }

  /** The author's own summary, saved through the same summary-only path as an AI one — no body guard, since the author is naming the summary rather than describing a read of the prose. Works on a final chapter too. */
  async updateSummary(projectId: bigint, chapter: number, body: UpdateSummaryBody): Promise<Generation.Draft> {
    const base = draftBaseOf(body);
    return this.db.transaction(tx => saveDraftSummary(tx, { projectId, chapter, summary: body.summary, base })).catch(asRetryableSave);
  }

  async proposeContinuity(projectId: bigint, chapter: number): Promise<Generation.ContinuityProposal> {
    const draft = await this.getDraft(projectId, chapter);
    const projectRow = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const { policy, project } = await this.chapterRoute(projectId, { role: 'continuity', chapter, mode: containmentMode(draft) }, projectRow);
    const pack = await this.contextAssembler.forChapter(projectId, chapter, { policy });

    const ctx = {
      projectId,
      chapter,
      promptKey: PROMPT_REGISTRY.continuity.key,
      promptVersion: PROMPT_REGISTRY.continuity.version,
      role: PROMPT_REGISTRY.continuity.key,
    };
    const contextPack = draft.isolated ? isolatedExtractionContext(pack.rendered) : pack.rendered;
    const extracted = (await this.modelRouter.structured(
      PROMPT_REGISTRY.continuity,
      { contextPack, chapterNumber: chapter, chapterProse: draft.body },
      ctx,
      project,
      policy,
    )) as ContinuityOutput;
    const proposal = draft.isolated ? isolatedContinuityProposal(extracted) : extracted;

    const [row] = await this.db
      .insert(schema.continuityProposals)
      .values({ projectId, chapter, status: 'pending', proposal })
      .onConflictDoUpdate({
        target: [schema.continuityProposals.projectId, schema.continuityProposals.chapter],
        set: { proposal, status: 'pending', appliedAt: null, updatedAt: new Date() },
      })
      .returning();
    if (!row) throw AppErrorCode.CNT_001.create();
    return row;
  }

  /**
   * Folds the canon a (usually hand-authored) chapter establishes back into the story bible: the chapter-extract prompt derives a change-set that is staged as a normal
   * refinement proposal for the author to review in the chat, not through the continuity-proposal path. Throws DRF_005 when the chapter adds nothing new.
   * An isolated chapter is read on the unrestricted route and its excerpts are withheld from what is staged.
   */
  async extractChapterToBible(projectId: bigint, chapter: number): Promise<Refinement.Proposal> {
    const draft = await this.getDraft(projectId, chapter);
    const projectRow = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const { policy, project } = await this.chapterRoute(projectId, { role: 'extraction', chapter, mode: containmentMode(draft) }, projectRow);
    const pack = await this.contextAssembler.forChapter(projectId, chapter, { policy });

    const promptModule = PROMPT_REGISTRY['chapter-extract'];
    let answered: string | undefined;
    const ctx = {
      projectId,
      chapter,
      promptKey: promptModule.key,
      promptVersion: promptModule.version,
      role: promptModule.role ?? promptModule.key,
      onAnswered: ({ model }: { model: string }) => void (answered = model),
    };
    const contextPack = draft.isolated ? isolatedExtractionContext(pack.rendered) : pack.rendered;
    const extracted = (await this.modelRouter.structured(
      promptModule,
      { contextPack, chapterNumber: chapter, chapterProse: draft.body },
      ctx,
      project,
      policy,
    )) as ChapterExtractOutput;
    const output = draft.isolated ? standardReadableExtraction(extracted) : extracted;

    const changeSet = parseOptionalChangeSet(output.changeSet, CHAPTER_EXTRACT_OPS);
    this.logger.debug('extractChapterToBible: derived change-set', { projectId, chapter, ops: changeSet.length });
    if (changeSet.length === 0) throw AppErrorCode.DRF_005.create();

    return this.proposalService.create(projectId, {
      scopeType: 'brief',
      scopeRef: `chapter:${chapter}`,
      kind: 'chapter_extract',
      summary: output.summary?.trim() || `Canon from chapter ${chapter}`,
      changeSet,
      allowedOps: CHAPTER_EXTRACT_OPS,
      model: answered ?? null,
      sourceIsolated: draft.isolated,
    });
  }

  async getContinuityProposal(projectId: bigint, chapter: number): Promise<Generation.ContinuityProposal> {
    const proposal = await this.db.query.continuityProposals.findFirst({
      where: and(eq(schema.continuityProposals.projectId, projectId), eq(schema.continuityProposals.chapter, chapter), eq(schema.continuityProposals.status, 'pending')),
    });
    if (!proposal) throw AppErrorCode.CNT_001.create();
    return proposal;
  }

  listContinuityProposals(projectId: bigint, status: Generation.ContinuityProposalStatus): Promise<Generation.ContinuityProposal[]> {
    return this.db.query.continuityProposals.findMany({
      where: and(eq(schema.continuityProposals.projectId, projectId), eq(schema.continuityProposals.status, status)),
      orderBy: asc(schema.continuityProposals.chapter),
    });
  }

  async updateContinuityProposal(projectId: bigint, chapter: number, body: UpdateContinuityBody): Promise<Generation.ContinuityProposal> {
    const existing = await this.getContinuityProposal(projectId, chapter);
    const { sourceIsolated: _ignored, ...candidate } = body.proposal;
    const parsed = parseSchema<ContinuityOutput>(ContinuitySchema, candidate);
    if (!parsed.success) throw AppErrorCode.CNT_003.create({ reason: renderSchemaIssues(parsed.issues).replaceAll('\n', '; ') });
    const proposal: Generation.ContinuityProposalPayload = existing.proposal.sourceIsolated ? { ...parsed.data, sourceIsolated: true } : parsed.data;
    const [updated] = await this.db.update(schema.continuityProposals).set({ proposal, updatedAt: new Date() }).where(eq(schema.continuityProposals.id, existing.id)).returning();
    if (!updated) throw AppErrorCode.CNT_001.create();
    return updated;
  }

  async applyContinuityProposal(projectId: bigint, chapter: number): Promise<Generation.ContinuityProposal> {
    this.logger.info('applyContinuityProposal: applying', { projectId, chapter });
    const proposalRow = await this.getContinuityProposal(projectId, chapter);
    const delta = proposalRow.proposal;

    // One transaction applies every canon mutation, marks the proposal applied and flags the chapter; a partial application is never recorded as `applied`.
    // A proposal holding low-confidence entries stays `pending` so it remains reachable for review.
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

  // Never writes 'cancelled' itself: the replica running the run does, as it unwinds. A run that settled between the read and the cancel
  // is read again, so the status answered is the one it settled with.
  async cancelRun(projectId: bigint, runId: string): Promise<CancelRunResponse> {
    const status = await this.runStatus(projectId, runId);
    if (status !== 'running') return { runId, status, outcome: 'already_settled' };

    const outcome = await this.workflowRunService.cancel(runId);
    if (outcome !== 'already_settled') return { runId, status: 'running', outcome };
    return { runId, status: await this.runStatus(projectId, runId), outcome };
  }

  private async runStatus(projectId: bigint, runId: string): Promise<Ai.WorkflowRunStatus> {
    const run = await this.db.query.workflowRuns.findFirst({
      where: and(eq(schema.workflowRuns.projectId, projectId), eq(schema.workflowRuns.id, runId)),
      columns: { status: true },
    });
    if (!run) throw AppErrorCode.PRJ_001.create();
    return run.status;
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

  async listJobs(projectId: bigint): Promise<(Job.Row & { usage: JobUsageResponse })[]> {
    const jobs = await this.jobService.listByProject(projectId);
    const usage = await this.jobService.usageForJobs(jobs.map(j => j.id));
    return jobs.map(job => ({ ...redactJobForResponse(job), usage: toJobUsageResponse(usage.get(job.id) ?? emptyCallUsageTotals()) }));
  }

  async backfill(projectId: bigint): Promise<JobEnqueueResult> {
    this.logger.info('backfill: enqueueing reindex', { projectId });
    const jobId = await this.jobService.enqueue(projectId, 'backfill', 'all');
    this.jobExecutor.dispatch(jobId).catch(err => this.logger.error('backfill job dispatch failed', { err, jobId }));
    return { jobId, kind: 'backfill', status: 'pending', target: 'all' };
  }

  private chapterRoute(projectId: bigint, call: { role: ChapterRole; chapter: number; mode: Project.ContentMode }, project: Project.Row | undefined): Promise<CallRoute> {
    return routeChapterCall({ pluginPolicy: this.pluginPolicy }, projectId, call, project as ProjectConfig | undefined);
  }

  private async chapterSetting(projectId: bigint, chapter: number, draft: { isolated: boolean }): Promise<{ project: Project.Row | undefined; mode: Project.ContentMode }> {
    const [project, brief] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)), columns: { contentMode: true } }),
    ]);
    return { project, mode: chapterContentMode({ brief, isolated: draft.isolated }) };
  }
}

function containmentMode(draft: { isolated: boolean }): Project.ContentMode {
  return draft.isolated ? 'unrestricted' : 'standard';
}
