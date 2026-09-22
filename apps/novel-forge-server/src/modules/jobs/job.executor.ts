import { and, asc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService, StorageService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type Job, type PrimaryDatabase, type Rebrand, type Reforge, type ReforgeTransform, schema, type Translation } from '@server/database';

import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { IndexingService } from '../ai/retrieval/indexing.service';
import { setProjectCover } from '../illustration/uploaded-cover';
import { landFinalChapters } from '../novel-import/land-chapters';
import { PublishRunner } from '../publishing/publish-runner';
import { RebrandService } from '../rebrand/rebrand.service';
import { locateOutputChapter } from '../reforge/plan-validation';
import { ReforgeAnalysisService } from '../reforge/reforge-analysis.service';
import { ReforgePlanService } from '../reforge/reforge-plan.service';
import { ReforgePromoteService } from '../reforge/reforge-promote.service';
import { RecombineService } from '../source/recombine.service';
import { TranslationService } from '../translation/translation.service';
import { ConcurrencyController } from './concurrency.controller';
import { JobService } from './job.service';

interface GeneratePayload {
  chapters: number[];
  autoFix?: boolean;
  maxFixes?: number;
  guidance?: string;
}

interface ExtractPayload {
  chapters: number[];
}

interface RebrandPayload {
  chapters?: number[];
  force?: boolean;
  limit?: number;
}

interface ReforgePayload {
  /** Which of the reforge job's stages this row runs; absent means the shipped 1:1 chapter pipeline. */
  stage?: 'analyze' | 'plan' | 'transform' | 'promote';
  chapters?: number[];
  /** Transform stage only: output chapters to write, in place of the data-derived selection. */
  outputs?: number[];
  force?: boolean;
  limit?: number;
  /** Promote stage only. */
  title?: string;
  seedVolumes?: boolean;
}

interface TranslatePayload {
  chapters?: number[];
  force?: boolean;
  limit?: number;
  /** Re-translate chapters whose glossary slice or original moved since they were produced. */
  stale?: boolean;
}

// Staged on `jobs.payload` by `NovelImportService.import` inside the same transaction that creates the
// project — kept as a local shape (not imported from the novel-import module) exactly like every other
// payload interface above, so JobExecutor never depends on the enqueuing feature module.
interface ImportPayload {
  mode: 'final' | 'source';
  chapters: { title: string; content: string }[];
  cover?: { mimeType: string; dataBase64: string };
}

// A cancel request only lands in the job row, so the executor polls for it while a step is in flight.
// Without the poll a single-run phase (a glossary seed, a source analysis) would keep spending for the
// whole of a model call after the author hit stop; the boundary checks alone only catch it between steps.
const CANCEL_POLL_MS = 1000;

@Injectable()
export class JobExecutor {
  private readonly logger = Logger.getLogger(APP_NAME, JobExecutor.name);
  private readonly db: PrimaryDatabase;
  private readonly cancelWatches = new Map<string, { observed: boolean }>();

  constructor(
    private readonly jobService: JobService,
    private readonly concurrency: ConcurrencyController,
    private readonly workflowRunService: WorkflowRunService,
    private readonly indexingService: IndexingService,
    private readonly databaseService: DatabaseService,
    private readonly rebrandService: RebrandService,
    private readonly reforgeAnalysisService: ReforgeAnalysisService,
    private readonly reforgePlanService: ReforgePlanService,
    private readonly recombineService: RecombineService,
    private readonly publishRunner: PublishRunner,
    private readonly storage: StorageService,
    private readonly reforgePromoteService: ReforgePromoteService,
    private readonly translationService: TranslationService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  // On boot, drain any jobs left pending — including ones just reset from in_progress by crash recovery.
  // Without this a crashed job would sit pending forever with no one to pick it up.
  async onModuleInit(): Promise<void> {
    const pending = await this.jobService.findPending();
    if (pending.length === 0) return;
    this.logger.info(`Dispatching ${pending.length} pending job(s) on boot`);
    for (const job of pending) this.dispatch(job.id).catch(err => this.logger.error('Boot dispatch failed', { err, jobId: job.id }));
  }

  async dispatch(jobId: string): Promise<void> {
    this.logger.debug('dispatch requested', { jobId });
    const job = await this.jobService.get(jobId);
    if (!job) {
      this.logger.warn('dispatch: job not found', { jobId });
      return;
    }

    // Only pending jobs are dispatchable. A done/failed job must not silently re-run (and re-spend on
    // LLM calls); an in_progress job is already owned by another dispatch on the per-project lock.
    if (job.status !== 'pending') {
      this.logger.warn('dispatch: skipping non-pending job', { jobId, status: job.status });
      return;
    }

    const projectId = job.projectId;
    const isLocal = false;
    const key = this.concurrency.lockKey(projectId, isLocal);
    this.logger.debug('dispatch: awaiting concurrency lock', { jobId, kind: job.kind, projectId, lockKey: key });

    await this.concurrency.run(key, async () => {
      const claimed = await this.jobService.start(jobId);
      if (!claimed) {
        this.logger.warn('dispatch: job already claimed by another worker', { jobId });
        return;
      }

      // The claim is what earns the right to refuse to start. Two paths reach here already cancelled: a
      // job cancelled while it queued behind the lock but after the status read above, and one that crash
      // recovery reset from in_progress back to pending with its request still on the row.
      if (await this.cancelRequested(jobId)) return this.markCancelled(job);

      const startedAt = Date.now();
      // Payload can carry chapter lists, guidance, limits — sensitive/verbose, so it rides on debug.
      this.logger.info('Job started', { jobId, kind: job.kind, projectId, target: job.target });
      this.logger.debug('Job payload', { jobId, kind: job.kind, payload: job.payload });
      const stopWatching = this.watchForCancellation(jobId);
      try {
        await this.runJob(job);
        if (await this.cancelRequested(jobId)) return this.markCancelled(job);
        await this.jobService.succeed(jobId);
        this.logger.info('Job succeeded', { jobId, kind: job.kind, projectId, durationMs: Date.now() - startedAt });
      } catch (err) {
        // Cancellation wins over the error: an aborted model call surfaces as a thrown step, and cancellation makes
        // the job terminal-cancelled with its finished work kept, not failed into a retry ladder.
        if (await this.cancelRequested(jobId)) return this.markCancelled(job);
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error('Job failed', { jobId, kind: job.kind, projectId, durationMs: Date.now() - startedAt, err });
        await this.jobService.fail(jobId, msg);
      } finally {
        stopWatching();
      }
    });
  }

  private watchForCancellation(jobId: string): () => void {
    this.cancelWatches.set(jobId, { observed: false });
    const timer = setInterval(() => void this.cancelRequested(jobId).catch(err => this.logger.warn('cancel poll failed', { err, jobId })), CANCEL_POLL_MS);
    timer.unref();
    return () => {
      clearInterval(timer);
      this.cancelWatches.delete(jobId);
    };
  }

  // Latches on first observation so the per-chapter boundary checks cost nothing once the answer is yes,
  // and cancels the runs the job is driving as it latches — including runs a collaborator started, which
  // are reachable only through `workflow_runs.job_id` (the job row itself has no run id to hand back).
  private async cancelRequested(jobId: string): Promise<boolean> {
    const watch = this.cancelWatches.get(jobId);
    if (watch?.observed) return true;
    const job = await this.jobService.get(jobId);
    if (!job?.cancelRequestedAt) return false;
    if (watch) watch.observed = true;
    this.logger.info('Job cancellation observed', { jobId });
    await this.cancelLiveRuns(jobId);
    return true;
  }

  private async cancelLiveRuns(jobId: string): Promise<void> {
    const live = await this.db
      .select({ id: schema.workflowRuns.id })
      .from(schema.workflowRuns)
      .where(and(eq(schema.workflowRuns.jobId, jobId), eq(schema.workflowRuns.status, 'running')));
    for (const run of live) this.workflowRunService.cancel(run.id);
  }

  private async markCancelled(job: Job.Row): Promise<void> {
    await this.jobService.settleCancelled(job.id);
    this.logger.info('Job cancelled', { jobId: job.id, kind: job.kind, projectId: job.projectId });
  }

  private async runJob(job: Job.Row): Promise<void> {
    this.logger.debug('runJob: routing to handler', { jobId: job.id, kind: job.kind });
    switch (job.kind) {
      case 'generate':
        return this.runGenerate(job);
      case 'extract':
        return this.runExtract(job);
      case 'backfill':
        return this.runBackfill(job);
      case 'rebrand':
        return this.runRebrand(job);
      case 'reforge':
        return this.runReforge(job);
      case 'publish':
        return this.runPublish(job);
      case 'import':
        return this.runImport(job);
      case 'translate':
        return this.runTranslate(job);
      default:
        throw AppError.internal(`Unsupported job kind: ${job.kind}`);
    }
  }

  private async runGenerate(job: Job.Row): Promise<void> {
    const { chapters = [], autoFix, maxFixes, guidance } = (job.payload ?? {}) as GeneratePayload;
    const total = chapters.length;
    this.logger.debug('runGenerate: starting', { jobId: job.id, chapters, total, autoFix, maxFixes, guidance });

    for (const [i, chapter] of chapters.entries()) {
      if (await this.cancelRequested(job.id)) return;
      await this.jobService.progress(job.id, { done: i, total, current: String(chapter), phase: 'generating', startedAt: new Date().toISOString() });
      this.logger.debug('runGenerate: generating chapter', { jobId: job.id, chapter, index: i, total });
      const result = await this.workflowRunService.runChapterGeneration({ projectId: job.projectId, chapter, autoFix, maxFixes, guidance, jobId: job.id });
      this.logger.debug('runGenerate: chapter finished', { jobId: job.id, chapter, status: result.status, outcome: result.outcome, runId: result.runId });
      if (result.status === 'cancelled') return;
      // The run service swallows its own errors into a `failed` result; surface that as a job failure
      // instead of quietly marking the job done with no draft persisted.
      if (result.status === 'failed') throw AppError.internal(`chapter ${chapter} generation failed (run ${result.runId})`);

      // Anything short of a clean accept flags the chapter for human review, so a batch halts here
      // rather than drafting N+1 on top of an unreviewed, possibly-wrong predecessor.
      if (result.outcome !== 'accepted') {
        const skipped = chapters.slice(i + 1);
        this.logger.warn('runGenerate: halting batch for review', { jobId: job.id, chapter, outcome: result.outcome, skipped });
        await this.jobService.progress(job.id, { done: i + 1, total, current: String(chapter), phase: 'awaiting_review', skipped });
        return;
      }
    }
  }

  private async runExtract(job: Job.Row): Promise<void> {
    const { chapters = [] } = (job.payload ?? {}) as ExtractPayload;
    const total = chapters.length;
    this.logger.debug('runExtract: starting', { jobId: job.id, chapters, total });

    for (const [i, chapter] of chapters.entries()) {
      if (await this.cancelRequested(job.id)) return;
      await this.jobService.progress(job.id, { done: i, total, current: String(chapter), phase: 'extracting' });
      this.logger.debug('runExtract: extracting chapter', { jobId: job.id, chapter, index: i, total });
      const result = await this.workflowRunService.runSourceExtraction({ projectId: job.projectId, chapter, jobId: job.id });
      this.logger.debug('runExtract: chapter finished', { jobId: job.id, chapter, status: result.status, runId: result.runId });
      if (result.status === 'cancelled') return;
      if (result.status === 'failed') throw AppError.internal(`chapter ${chapter} extraction failed (run ${result.runId})`);
    }
  }

  private async runBackfill(job: Job.Row): Promise<void> {
    this.logger.info('runBackfill: reindexing project', { jobId: job.id, projectId: job.projectId });
    await this.jobService.progress(job.id, { done: 0, total: 1, current: 'all', phase: 'embedding' });
    await this.indexingService.backfill(job.projectId);
    await this.jobService.progress(job.id, { done: 1, total: 1, current: 'all', phase: 'embedding' });
    this.logger.info('runBackfill: done', { jobId: job.id, projectId: job.projectId });
  }

  // Three phases, each derived from data — never from rebrands.status, which is advisory display
  // state updated at phase boundaries. Resume recomputes everything, so a crashed job re-posts clean.
  private async runRebrand(job: Job.Row): Promise<void> {
    const projectId = job.projectId;
    const payload = (job.payload ?? {}) as RebrandPayload;
    this.logger.info('runRebrand: starting', { jobId: job.id, projectId, force: payload.force, limit: payload.limit, chapters: payload.chapters });

    try {
      const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
      if (!project) throw AppError.internal(`project ${projectId} not found`);
      const chapterCount = await this.db.$count(schema.chapters, eq(schema.chapters.projectId, projectId));
      this.logger.debug('runRebrand: phase 1 — chapters present', { jobId: job.id, projectId, chapterCount });
      if (chapterCount === 0) throw AppError.internal(`project ${projectId} has no chapters — provide chapters before running rebrand`);

      // Phase 1.5: merge translator-split chapter parts before the glossary ever sees them;
      // the guard makes this a safe no-op on resume.
      this.logger.info('runRebrand: phase 1.5 — recombine', { jobId: job.id, projectId });
      await this.jobService.progress(job.id, { done: 0, total: 0, current: 'merging parts', phase: 'recombining' });
      await this.recombineService.autoRecombine(projectId);

      this.logger.info('runRebrand: phase 2 — glossary seed', { jobId: job.id, projectId });
      await this.setRebrandStatus(projectId, 'glossary');
      await this.jobService.progress(job.id, { done: 0, total: 0, current: 'glossary', phase: 'glossary' });
      await this.rebrandService.seedGlossary(projectId, job.id);

      await this.setRebrandStatus(projectId, 'converting');
      const targets = await this.selectRebrandChapters(projectId, payload);
      const total = targets.length;
      this.logger.info('runRebrand: phase 3 — converting chapters', { jobId: job.id, projectId, total });
      this.logger.debug('runRebrand: conversion targets', { jobId: job.id, targets });
      let failed = 0;
      for (const [i, chapter] of targets.entries()) {
        if (await this.cancelRequested(job.id)) return;
        await this.jobService.progress(job.id, { done: i, total, current: String(chapter), phase: 'converting' });
        this.logger.debug('runRebrand: converting chapter', { jobId: job.id, chapter, index: i, total });
        const result = await this.workflowRunService.runChapterRebrand({ projectId, chapter, jobId: job.id });
        this.logger.debug('runRebrand: chapter conversion finished', { jobId: job.id, chapter, status: result.status, runId: result.runId });
        // Flag-and-continue — a deliberate divergence from runGenerate/runExtract's throw: a failed
        // chapter records a failed conversion row and the loop moves on; the pipeline never blocks.
        if (result.status === 'failed') {
          failed++;
          await this.recordFailedConversion(projectId, chapter, result.runId);
        }
      }

      await this.jobService.progress(job.id, { done: total, total, current: 'done', phase: 'converting' });
      await this.setRebrandStatus(projectId, 'done');
      this.logger.info('runRebrand: complete', { jobId: job.id, projectId, total, converted: total - failed, failed });
    } catch (err) {
      this.logger.error('runRebrand: failed', { jobId: job.id, projectId, err });
      await this.setRebrandStatus(projectId, 'failed', err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  // Three phases, each derived from data — never from reforges.status, which is advisory display
  // state. Reuses the rebrand recombine/seed backbone verbatim, then re-authors each chapter through
  // the reforge graph. Per-chapter failures flag-and-continue, identical to runRebrand.
  private async runReforge(job: Job.Row): Promise<void> {
    const payload = (job.payload ?? {}) as ReforgePayload;
    if (payload.stage === 'analyze') return this.runReforgeAnalyze(job);
    if (payload.stage === 'plan') return this.runReforgePlan(job);
    if (payload.stage === 'transform') return this.runReforgeTransform(job, payload);
    if (payload.stage === 'promote') return this.runReforgePromote(job, payload);
    return this.runChapterReforge(job, payload);
  }

  // The transform-mode source analysis. It shares the reforge job kind but
  // touches none of the 1:1 path's tables, and its own phases are derived from the window loop.
  private async runReforgeAnalyze(job: Job.Row): Promise<void> {
    const projectId = job.projectId;
    this.logger.info('runReforgeAnalyze: starting', { jobId: job.id, projectId });

    await this.jobService.progress(job.id, { done: 0, total: 0, current: 'merging parts', phase: 'recombining' });
    await this.recombineService.autoRecombine(projectId);

    const result = await this.reforgeAnalysisService.analyze(projectId, {
      jobId: job.id,
      onProgress: progress => this.jobService.progress(job.id, progress),
    });

    await this.jobService.progress(job.id, { done: 1, total: 1, current: 'done', phase: 'synthesizing' });
    this.logger.info('runReforgeAnalyze: complete', { jobId: job.id, projectId, ...result, analysisId: String(result.analysisId) });
  }

  // Drafts the transformation plan from the persisted analysis. It ends in `draft`: the plan is always
  // human-gated, and a "just run it end to end" button is the one feature that would make this mode
  // untrustworthy.
  private async runReforgePlan(job: Job.Row): Promise<void> {
    await this.jobService.progress(job.id, { done: 0, total: 1, current: 'drafting', phase: 'planning' });
    const { plan, outputChapterCount } = await this.reforgePlanService.draft(job.projectId, job.id);
    await this.jobService.progress(job.id, { done: 1, total: 1, current: 'done', phase: 'planning' });
    this.logger.info('runReforgePlan: complete', { jobId: job.id, projectId: job.projectId, planId: String(plan.id), revision: plan.revision, outputChapterCount });
  }

  // The N:M write. The approved plan is the only structural authority, so the stage
  // verifies it before anything is spent and derives its targets from the plan's own numbering rather
  // than from the payload. Per-output failures flag-and-continue, identical to the 1:1 path.
  private async runReforgeTransform(job: Job.Row, payload: ReforgePayload): Promise<void> {
    const projectId = job.projectId;
    this.logger.info('runReforgeTransform: starting', { jobId: job.id, projectId, force: payload.force, limit: payload.limit, outputs: payload.outputs });

    try {
      await this.jobService.progress(job.id, { done: 0, total: 0, current: 'plan', phase: 'verifying' });
      const plan = await this.reforgePlanService.getApproved(projectId);
      const spans = await this.reforgePlanService.listSpans(plan.id);

      await this.setReforgeStatus(projectId, 'glossary');
      await this.jobService.progress(job.id, { done: 0, total: 0, current: 'glossary', phase: 'glossary' });
      await this.rebrandService.seedGlossary(projectId, job.id);

      await this.setReforgeStatus(projectId, 'reforging');
      const targets = await this.selectTransformOutputs(plan, payload);
      const total = targets.length;
      this.logger.info('runReforgeTransform: writing outputs', { jobId: job.id, projectId, planId: String(plan.id), revision: plan.revision, total });
      let failed = 0;
      for (const [i, outputChapter] of targets.entries()) {
        if (await this.cancelRequested(job.id)) return;
        await this.jobService.progress(job.id, { done: i, total, current: String(outputChapter), phase: 'transforming' });
        const result = await this.workflowRunService.runSpanTransform({ projectId, planId: plan.id, outputChapter, jobId: job.id });
        this.logger.debug('runReforgeTransform: output finished', { jobId: job.id, outputChapter, status: result.status, runId: result.runId });
        if (result.status === 'failed') {
          failed++;
          await this.recordFailedOutput(projectId, plan.id, spans, outputChapter, result.runId);
        }
      }

      await this.jobService.progress(job.id, { done: total, total, current: 'done', phase: 'transforming' });
      await this.setReforgeStatus(projectId, 'done');
      this.logger.info('runReforgeTransform: complete', { jobId: job.id, projectId, total, written: total - failed, failed });
    } catch (err) {
      this.logger.error('runReforgeTransform: failed', { jobId: job.id, projectId, err });
      await this.setReforgeStatus(projectId, 'failed', err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  // The finished transform becomes a project. Nothing here is generated — the outputs are already
  // written and human-gated, so the stage is a landing, not a pipeline.
  private async runReforgePromote(job: Job.Row, payload: ReforgePayload): Promise<void> {
    const result = await this.reforgePromoteService.promote(job.projectId, {
      title: payload.title,
      seedVolumes: payload.seedVolumes,
      onProgress: progress => this.jobService.progress(job.id, progress),
    });
    await this.jobService.progress(job.id, { done: 1, total: 1, current: 'done', phase: 'seeding' });
    this.logger.info('runReforgePromote: complete', {
      jobId: job.id,
      projectId: job.projectId,
      promotedProjectId: String(result.projectId),
      chapters: result.chapters,
      volumes: result.volumes,
      alreadyPromoted: result.alreadyPromoted,
    });
  }

  private async runChapterReforge(job: Job.Row, payload: ReforgePayload): Promise<void> {
    const projectId = job.projectId;
    this.logger.info('runReforge: starting', { jobId: job.id, projectId, force: payload.force, limit: payload.limit, chapters: payload.chapters });

    try {
      const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
      if (!project) throw AppError.internal(`project ${projectId} not found`);
      const chapterCount = await this.db.$count(schema.chapters, eq(schema.chapters.projectId, projectId));
      this.logger.debug('runReforge: phase 1 — chapters present', { jobId: job.id, projectId, chapterCount });
      if (chapterCount === 0) throw AppError.internal(`project ${projectId} has no chapters — provide chapters before running reforge`);

      // Phase 1.5: merge translator-split chapter parts before the glossary ever sees them;
      // the guard makes this a safe no-op on resume.
      this.logger.info('runReforge: phase 1.5 — recombine', { jobId: job.id, projectId });
      await this.jobService.progress(job.id, { done: 0, total: 0, current: 'merging parts', phase: 'recombining' });
      await this.recombineService.autoRecombine(projectId);

      // Phase 2: glossary seed via the SHARED rebrand rename bible (idempotent — resume never re-seeds
      // or re-bills; a project that already ran rebrand reuses the seeded glossary as-is).
      this.logger.info('runReforge: phase 2 — glossary seed', { jobId: job.id, projectId });
      await this.setReforgeStatus(projectId, 'glossary');
      await this.jobService.progress(job.id, { done: 0, total: 0, current: 'glossary', phase: 'glossary' });
      await this.rebrandService.seedGlossary(projectId, job.id);

      await this.setReforgeStatus(projectId, 'reforging');
      const targets = await this.selectReforgeChapters(projectId, payload);
      const total = targets.length;
      this.logger.info('runReforge: phase 3 — reforging chapters', { jobId: job.id, projectId, total });
      this.logger.debug('runReforge: reforge targets', { jobId: job.id, targets });
      let failed = 0;
      for (const [i, chapter] of targets.entries()) {
        if (await this.cancelRequested(job.id)) return;
        await this.jobService.progress(job.id, { done: i, total, current: String(chapter), phase: 'reforging' });
        this.logger.debug('runReforge: reforging chapter', { jobId: job.id, chapter, index: i, total });
        const result = await this.workflowRunService.runChapterReforge({ projectId, chapter, jobId: job.id });
        this.logger.debug('runReforge: chapter reforge finished', { jobId: job.id, chapter, status: result.status, runId: result.runId });
        // Flag-and-continue — a failed chapter records a failed reforge row and the loop moves on; the
        // pipeline never blocks, identical semantics to runRebrand.
        if (result.status === 'failed') {
          failed++;
          await this.recordFailedReforge(projectId, chapter, result.runId);
        }
      }

      await this.jobService.progress(job.id, { done: total, total, current: 'done', phase: 'reforging' });
      await this.setReforgeStatus(projectId, 'done');
      this.logger.info('runReforge: complete', { jobId: job.id, projectId, total, reforged: total - failed, failed });
    } catch (err) {
      this.logger.error('runReforge: failed', { jobId: job.id, projectId, err });
      await this.setReforgeStatus(projectId, 'failed', err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  // One convergence pass over the publication ledger: novel metadata, due/drifted chapter PUTs,
  // ledgered-unpublish DELETEs. Per-row failures land on the ledger rows (the row is the outbox);
  // the job fails on any of them so the janitor sweep keeps retrying until the reader converges.
  private async runPublish(job: Job.Row): Promise<void> {
    await this.jobService.progress(job.id, { done: 0, total: 0, current: 'converging', phase: 'publish' });
    const result = await this.publishRunner.converge(job.projectId);
    const total =
      result.pushed.length +
      result.deleted.length +
      result.skipped.length +
      result.failed.length +
      result.wiki.pushed.length +
      result.wiki.deleted.length +
      result.wiki.skipped.length +
      result.wiki.failed.length;
    const failed = result.failed.length + result.wiki.failed.length;
    await this.jobService.progress(job.id, { done: total - failed, total, current: 'done', phase: 'publish' });
    if (failed > 0) throw AppError.internal(`publish convergence incomplete: ${failed} push(es) failed — see the publication ledger`);
  }

  // The project row already exists (created transactionally with this job by NovelImportService); this
  // job only writes chapters, the cover, and — for `source` mode — triggers the same auto-recombine
  // hook that used to run on ingest completion. A mid-batch failure leaves the project and whatever
  // chapters already landed in place (job marked failed, matching every other executor) rather than
  // rolling back — the caller can inspect, retry manually, or delete the project.
  private async runImport(job: Job.Row): Promise<void> {
    const { mode, chapters, cover } = (job.payload ?? {}) as ImportPayload;
    const projectId = job.projectId;
    const total = chapters.length;
    this.logger.info('runImport: starting', { jobId: job.id, projectId, mode, total, hasCover: !!cover });

    // `final` mode is the finished novel: human-authored, immutable, publishable from chapter 1
    // (PUB_002/PUB_003). `source` mode explicitly writes the column's own default so a later
    // rebrand/reforge/extract pass treats it exactly like any other source project's chapters.
    await landFinalChapters(this.db, projectId, chapters, {
      mode,
      onBatch: async (done, chapterTotal) => {
        await this.jobService.progress(job.id, { done, total: chapterTotal, current: done === chapterTotal ? 'chapters' : String(done + 1), phase: 'inserting' });
      },
    });

    // The only boundary an import has: the chapters are landed and kept, the cover and the
    // recombine pass are abandoned. The payload is still compacted, so a cancelled import never leaves
    // the whole bundle's prose sitting on the row.
    if (await this.cancelRequested(job.id)) return this.compactImportPayload(job.id, total, !!cover);

    if (cover) {
      this.logger.debug('runImport: storing cover asset', { jobId: job.id, projectId });
      const bytes = new Uint8Array(Buffer.from(cover.dataBase64, 'base64'));
      const ref = await this.storage.save(bytes, { contentType: cover.mimeType });
      await setProjectCover(this.db, projectId, ref);
    }

    if (mode === 'source') {
      // Re-homes the auto-recombine hook that used to run on remote-ingest completion;
      // autoRecombine already no-ops quietly when there is nothing to merge.
      this.logger.info('runImport: source mode — running auto-recombine', { jobId: job.id, projectId });
      await this.jobService.progress(job.id, { done: total, total, current: 'recombine', phase: 'recombining' });
      await this.recombineService.autoRecombine(projectId);
    }

    await this.compactImportPayload(job.id, total, !!cover);
    this.logger.info('runImport: complete', { jobId: job.id, projectId, mode, chapters: total });
  }

  // The chapters/cover are now durably in the `chapters`/`projects` tables — the full bundle prose
  // sitting in `jobs.payload` (up to the novel-import size limit) has no further purpose and must not
  // linger. `redactJobForResponse` keeps the wire safe regardless (mid-run or on a failed job, where
  // this is never reached), but this keeps the row itself small.
  private async compactImportPayload(jobId: string, chapters: number, hasCover: boolean): Promise<void> {
    await this.db
      .update(schema.jobs)
      .set({ payload: { chapters, hasCover } as never, updatedAt: new Date() })
      .where(eq(schema.jobs.id, jobId));
  }

  /** payload.chapters wins; otherwise every source chapter without a converted/attention row (failed rows always retry). */
  private async selectRebrandChapters(projectId: bigint, payload: RebrandPayload): Promise<number[]> {
    let targets: number[];
    if (payload.chapters && payload.chapters.length > 0) {
      targets = [...payload.chapters].sort((a, b) => a - b);
    } else {
      const rows = await this.db
        .select({ number: schema.chapters.number })
        .from(schema.chapters)
        .where(eq(schema.chapters.projectId, projectId))
        .orderBy(asc(schema.chapters.number));
      targets = rows.map(r => r.number);
    }

    if (!payload.force) {
      const done = await this.db
        .select({ chapter: schema.chapterConversions.chapter })
        .from(schema.chapterConversions)
        .where(and(eq(schema.chapterConversions.projectId, projectId), ne(schema.chapterConversions.status, 'failed')));
      const doneSet = new Set(done.map(d => d.chapter));
      targets = targets.filter(n => !doneSet.has(n));
    }

    return payload.limit ? targets.slice(0, payload.limit) : targets;
  }

  // Insert an empty failed row for a fresh failure, but never clobber the body a previous successful
  // conversion produced — only the status/issues flip, so the prose survives a failed forced re-run.
  private async recordFailedConversion(projectId: bigint, chapter: number, runId: string): Promise<void> {
    const issues = [{ source: 'run', type: 'run_failed', detail: `chapter ${chapter} rebrand failed (run ${runId})` }];
    await this.db
      .insert(schema.chapterConversions)
      .values({ projectId, chapter, body: '', status: 'failed', issues, runId })
      .onConflictDoUpdate({
        target: [schema.chapterConversions.projectId, schema.chapterConversions.chapter],
        set: {
          status: sql`EXCLUDED.status`,
          issues: sql`EXCLUDED.issues`,
          runId: sql`EXCLUDED.run_id`,
          revision: sql`${schema.chapterConversions.revision} + 1`,
          updatedAt: new Date(),
        },
      })
      .catch(err => this.logger.error('failed to record failed conversion', { err, chapter }));
  }

  private async setRebrandStatus(projectId: bigint, status: Rebrand.Status, lastError: string | null = null): Promise<void> {
    await this.db
      .update(schema.rebrands)
      .set({ status, lastError, updatedAt: new Date() })
      .where(eq(schema.rebrands.projectId, projectId))
      .catch(err => this.logger.warn('failed to update rebrand status', { err, status }));
  }

  /** payload.chapters wins; otherwise every source chapter without a reforged/attention row (failed rows always retry). */
  private async selectReforgeChapters(projectId: bigint, payload: ReforgePayload): Promise<number[]> {
    let targets: number[];
    if (payload.chapters && payload.chapters.length > 0) {
      targets = [...payload.chapters].sort((a, b) => a - b);
    } else {
      const rows = await this.db
        .select({ number: schema.chapters.number })
        .from(schema.chapters)
        .where(eq(schema.chapters.projectId, projectId))
        .orderBy(asc(schema.chapters.number));
      targets = rows.map(r => r.number);
    }

    if (!payload.force) {
      const done = await this.db
        .select({ chapter: schema.chapterReforges.chapter })
        .from(schema.chapterReforges)
        .where(and(eq(schema.chapterReforges.projectId, projectId), ne(schema.chapterReforges.status, 'failed')));
      const doneSet = new Set(done.map(d => d.chapter));
      targets = targets.filter(n => !doneSet.has(n));
    }

    return payload.limit ? targets.slice(0, payload.limit) : targets;
  }

  // Data-derived exactly like selectReforgeChapters: the outputs of this plan not yet written or in
  // attention, with failed ones always retried. The plan's derived numbering bounds the set, so a
  // payload can never name an output the approved structure does not have.
  private async selectTransformOutputs(plan: ReforgeTransform.Plan, payload: ReforgePayload): Promise<number[]> {
    const all = Array.from({ length: plan.outputChapterCount }, (_, i) => i + 1);
    let targets = payload.outputs?.length ? [...new Set(payload.outputs)].sort((a, b) => a - b).filter(n => n >= 1 && n <= plan.outputChapterCount) : all;

    if (!payload.force) {
      const done = await this.db
        .select({ outputChapter: schema.reforgeOutputs.outputChapter })
        .from(schema.reforgeOutputs)
        .where(and(eq(schema.reforgeOutputs.planId, plan.id), ne(schema.reforgeOutputs.status, 'failed')));
      const doneSet = new Set(done.map(d => d.outputChapter));
      targets = targets.filter(n => !doneSet.has(n));
    }

    return payload.limit ? targets.slice(0, payload.limit) : targets;
  }

  // The span columns are not nullable, so a failed output is placed under the span the plan gives it —
  // never a caller-supplied ordinal. Prose from an earlier success survives a failed forced re-run.
  private async recordFailedOutput(projectId: bigint, planId: bigint, spans: ReforgeTransform.PlanSpan[], outputChapter: number, runId: string): Promise<void> {
    const location = locateOutputChapter(spans, outputChapter);
    if (!location) return;
    const { span, indexInSpan } = location;
    const issues = [{ source: 'run', type: 'run_failed', detail: `output chapter ${outputChapter} transform failed (run ${runId})` }];
    await this.db
      .insert(schema.reforgeOutputs)
      .values({
        projectId,
        planId,
        outputChapter,
        spanOrdinal: span.ordinal,
        spanKey: span.spanKey,
        fromChapter: span.fromChapter,
        toChapter: span.toChapter,
        indexInSpan,
        body: '',
        status: 'failed',
        issues,
        runId,
      })
      .onConflictDoUpdate({
        target: [schema.reforgeOutputs.planId, schema.reforgeOutputs.outputChapter],
        set: {
          status: sql`EXCLUDED.status`,
          issues: sql`EXCLUDED.issues`,
          runId: sql`EXCLUDED.run_id`,
          revision: sql`${schema.reforgeOutputs.revision} + 1`,
          updatedAt: new Date(),
        },
      })
      .catch(err => this.logger.error('failed to record failed transform output', { err, outputChapter }));
  }

  // Insert an empty failed row for a fresh failure, but never clobber the body a previous successful
  // reforge produced — only the status/issues flip, so the prose survives a failed forced re-run.
  private async recordFailedReforge(projectId: bigint, chapter: number, runId: string): Promise<void> {
    const issues = [{ source: 'run', type: 'run_failed', detail: `chapter ${chapter} reforge failed (run ${runId})` }];
    await this.db
      .insert(schema.chapterReforges)
      .values({ projectId, chapter, body: '', status: 'failed', issues, runId })
      .onConflictDoUpdate({
        target: [schema.chapterReforges.projectId, schema.chapterReforges.chapter],
        set: {
          status: sql`EXCLUDED.status`,
          issues: sql`EXCLUDED.issues`,
          runId: sql`EXCLUDED.run_id`,
          revision: sql`${schema.chapterReforges.revision} + 1`,
          updatedAt: new Date(),
        },
      })
      .catch(err => this.logger.error('failed to record failed reforge', { err, chapter }));
  }

  private async setReforgeStatus(projectId: bigint, status: Reforge.Status, lastError: string | null = null): Promise<void> {
    await this.db
      .update(schema.reforges)
      .set({ status, lastError, updatedAt: new Date() })
      .where(eq(schema.reforges.projectId, projectId))
      .catch(err => this.logger.warn('failed to update reforge status', { err, status }));
  }

  // Three phases, each derived from data — never from translations.phase, which is advisory display
  // state. Divergences from runRebrand: the seed can pause the run for term
  // review, a finalized chapter is never a target, and a failed run never overwrites a good row.
  private async runTranslate(job: Job.Row): Promise<void> {
    const projectId = job.projectId;
    const payload = (job.payload ?? {}) as TranslatePayload;
    this.logger.info('runTranslate: starting', { jobId: job.id, projectId, force: payload.force, limit: payload.limit, stale: payload.stale, chapters: payload.chapters });

    try {
      const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
      if (!project) throw AppError.internal(`project ${projectId} not found`);
      const translation = await this.translationService.getOrCreate(projectId);
      const originals = await this.db.$count(schema.chapters, and(eq(schema.chapters.projectId, projectId), isNotNull(schema.chapters.originalContent)));
      this.logger.debug('runTranslate: phase 1 — originals present', { jobId: job.id, projectId, originals });
      if (originals === 0) throw AppError.internal(`project ${projectId} has no originals — paste or push original chapters before running translate`);

      this.logger.info('runTranslate: phase 2 — glossary seed', { jobId: job.id, projectId });
      await this.setTranslationPhase(projectId, 'seeding');
      await this.jobService.progress(job.id, { done: 0, total: originals, current: 'glossary', phase: 'seeding' });
      const seed = await this.translationService.seedGlossary(projectId, job.id);

      // A paused pipeline is not a failed one: the job lands `done` and a second POST continues into
      // phase 3, where the seed is a no-op. The seed is the one review worth blocking on — protagonist
      // and faction names bind every one of thousands of later chapters.
      if (seed.seeded && seed.suggestions > 0 && (translation.settings?.pauseAfterSeed ?? true)) {
        this.logger.info('runTranslate: pausing for term review', { jobId: job.id, projectId, suggestions: seed.suggestions });
        await this.setTranslationPhase(projectId, 'review');
        await this.jobService.progress(job.id, { done: 0, total: originals, current: 'awaiting term review', phase: 'review' });
        return;
      }

      await this.setTranslationPhase(projectId, 'translating');
      const targets = await this.selectTranslationChapters(projectId, payload);
      const total = targets.length;
      this.logger.info('runTranslate: phase 3 — translating chapters', { jobId: job.id, projectId, total });
      this.logger.debug('runTranslate: translation targets', { jobId: job.id, targets });
      let failed = 0;
      for (const [i, chapter] of targets.entries()) {
        if (await this.cancelRequested(job.id)) return;
        await this.jobService.progress(job.id, { done: i, total, current: String(chapter), phase: 'translating' });
        const result = await this.workflowRunService.runChapterTranslation({ projectId, chapter, jobId: job.id });
        this.logger.debug('runTranslate: chapter finished', { jobId: job.id, chapter, outcome: result.outcome, runId: result.runId });
        // Flag-and-continue, like runRebrand: a failed chapter is recorded and the loop moves on.
        if (result.outcome === 'failed') {
          failed++;
          await this.recordFailedTranslation(projectId, chapter, result.runId);
        }
      }

      await this.jobService.progress(job.id, { done: total, total, current: 'done', phase: 'translating' });
      await this.setTranslationPhase(projectId, 'done');
      this.logger.info('runTranslate: complete', { jobId: job.id, projectId, total, translated: total - failed, failed });
    } catch (err) {
      this.logger.error('runTranslate: failed', { jobId: job.id, projectId, err });
      await this.setTranslationPhase(projectId, 'failed', err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  /** payload.chapters wins; else `stale` rows; else every chapter with an original. Done rows are dropped only from the data-derived set, finalized ones always. */
  private async selectTranslationChapters(projectId: bigint, payload: TranslatePayload): Promise<number[]> {
    const rows = await this.db
      .select({
        chapter: schema.chapterTranslations.chapter,
        status: schema.chapterTranslations.status,
        glossaryStale: schema.chapterTranslations.glossaryStale,
        sourceStale: schema.chapterTranslations.sourceStale,
      })
      .from(schema.chapterTranslations)
      .where(eq(schema.chapterTranslations.projectId, projectId));
    const byChapter = new Map(rows.map(r => [r.chapter, r]));

    const explicit = payload.chapters && payload.chapters.length > 0;
    let targets: number[];
    if (explicit) {
      targets = [...new Set(payload.chapters)].sort((a, b) => a - b);
    } else if (payload.stale) {
      targets = rows
        .filter(r => r.glossaryStale || r.sourceStale)
        .map(r => r.chapter)
        .sort((a, b) => a - b);
    } else {
      const originals = await this.db
        .select({ number: schema.chapters.number })
        .from(schema.chapters)
        .where(and(eq(schema.chapters.projectId, projectId), isNotNull(schema.chapters.originalContent)))
        .orderBy(asc(schema.chapters.number));
      targets = originals.map(r => r.number);
    }

    // The done-skip trims the data-derived set only: an explicit list is the caller naming chapters to
    // re-run, and stale rows are already-produced rows that must not be skipped as done.
    const skipDone = !payload.force && !explicit && !payload.stale;
    targets = targets.filter(n => {
      const status = byChapter.get(n)?.status;
      if (status === 'finalized') return false;
      return !(skipDone && (status === 'translated' || status === 'attention'));
    });

    return payload.limit ? targets.slice(0, payload.limit) : targets;
  }

  // A failed run must never make a good row look worse than it is: `status` gates finalize, so an
  // existing translated/attention/finalized row only takes the error stamp and keeps its body and
  // revision. Only an absent or already-failed row is written as `failed`.
  private async recordFailedTranslation(projectId: bigint, chapter: number, runId: string): Promise<void> {
    const lastError = `run ${runId} failed`;
    const existing = await this.db.query.chapterTranslations.findFirst({
      where: and(eq(schema.chapterTranslations.projectId, projectId), eq(schema.chapterTranslations.chapter, chapter)),
      columns: { id: true, status: true },
    });

    if (existing && existing.status !== 'failed') {
      await this.db
        .update(schema.chapterTranslations)
        .set({ lastError, lastFailedRunId: runId, updatedAt: new Date() })
        .where(eq(schema.chapterTranslations.id, existing.id))
        .catch(err => this.logger.error('failed to stamp translation failure', { err, chapter }));
      return;
    }

    const issues: Translation.Issue[] = [{ source: 'run', type: 'run_failed', detail: `chapter ${chapter} translation failed (run ${runId})` }];
    await this.db
      .insert(schema.chapterTranslations)
      .values({ projectId, chapter, body: '', status: 'failed', issues, runId, lastError, lastFailedRunId: runId })
      .onConflictDoUpdate({
        target: [schema.chapterTranslations.projectId, schema.chapterTranslations.chapter],
        set: {
          issues: sql`EXCLUDED.issues`,
          runId: sql`EXCLUDED.run_id`,
          lastError: sql`EXCLUDED.last_error`,
          lastFailedRunId: sql`EXCLUDED.last_failed_run_id`,
          revision: sql`${schema.chapterTranslations.revision} + 1`,
          updatedAt: new Date(),
        },
        setWhere: eq(schema.chapterTranslations.status, 'failed'),
      })
      .catch(err => this.logger.error('failed to record failed translation', { err, chapter }));
  }

  private async setTranslationPhase(projectId: bigint, phase: Translation.Phase, lastError: string | null = null): Promise<void> {
    await this.db
      .update(schema.translations)
      .set({ phase, lastError, updatedAt: new Date() })
      .where(eq(schema.translations.projectId, projectId))
      .catch(err => this.logger.warn('failed to update translation phase', { err, phase }));
  }
}
