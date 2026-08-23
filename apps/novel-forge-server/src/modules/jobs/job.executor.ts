import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService, StorageService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type Job, type PrimaryDatabase, type Rebrand, type Reforge, type ReforgeTransform, schema } from '@server/database';

import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { IndexingService } from '../ai/retrieval/indexing.service';
import { PublishRunner } from '../publishing/publish-runner';
import { RebrandService } from '../rebrand/rebrand.service';
import { locateOutputChapter } from '../reforge/plan-validation';
import { ReforgeAnalysisService } from '../reforge/reforge-analysis.service';
import { ReforgePlanService } from '../reforge/reforge-plan.service';
import { RecombineService } from '../source/recombine.service';
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
}

// Staged on `jobs.payload` by `NovelImportService.import` inside the same transaction that creates the
// project — kept as a local shape (not imported from the novel-import module) exactly like every other
// payload interface above, so JobExecutor never depends on the enqueuing feature module.
interface ImportPayload {
  mode: 'final' | 'source';
  chapters: { title: string; content: string }[];
  cover?: { mimeType: string; dataBase64: string };
}

const IMPORT_BATCH_SIZE = 25;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

@Injectable()
export class JobExecutor {
  private readonly logger = Logger.getLogger(APP_NAME, JobExecutor.name);
  private readonly db: PrimaryDatabase;

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
      const startedAt = Date.now();
      // Payload can carry chapter lists, guidance, limits — sensitive/verbose, so it rides on debug.
      this.logger.info('Job started', { jobId, kind: job.kind, projectId, target: job.target });
      this.logger.debug('Job payload', { jobId, kind: job.kind, payload: job.payload });
      try {
        await this.runJob(job);
        await this.jobService.succeed(jobId);
        this.logger.info('Job succeeded', { jobId, kind: job.kind, projectId, durationMs: Date.now() - startedAt });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error('Job failed', { jobId, kind: job.kind, projectId, durationMs: Date.now() - startedAt, err });
        await this.jobService.fail(jobId, msg);
      }
    });
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
      default:
        throw AppError.internal(`Unsupported job kind: ${job.kind}`);
    }
  }

  private async runGenerate(job: Job.Row): Promise<void> {
    const { chapters = [], autoFix, maxFixes, guidance } = (job.payload ?? {}) as GeneratePayload;
    const total = chapters.length;
    this.logger.debug('runGenerate: starting', { jobId: job.id, chapters, total, autoFix, maxFixes, guidance });

    for (const [i, chapter] of chapters.entries()) {
      await this.jobService.progress(job.id, { done: i, total, current: String(chapter), phase: 'generating' });
      this.logger.debug('runGenerate: generating chapter', { jobId: job.id, chapter, index: i, total });
      const result = await this.workflowRunService.runChapterGeneration({ projectId: job.projectId, chapter, autoFix, maxFixes, guidance, jobId: job.id });
      this.logger.debug('runGenerate: chapter finished', { jobId: job.id, chapter, status: result.status, outcome: result.outcome, runId: result.runId });
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
      await this.jobService.progress(job.id, { done: i, total, current: String(chapter), phase: 'extracting' });
      this.logger.debug('runExtract: extracting chapter', { jobId: job.id, chapter, index: i, total });
      const result = await this.workflowRunService.runSourceExtraction({ projectId: job.projectId, chapter });
      this.logger.debug('runExtract: chapter finished', { jobId: job.id, chapter, status: result.status, runId: result.runId });
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

      // Phase 1.5: merge translator-split chapter parts before the glossary ever sees them
      // (recombine design §1); the guard makes this a safe no-op on resume.
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
    return this.runChapterReforge(job, payload);
  }

  // The transform-mode source analysis (transform design §3.4). It shares the reforge job kind but
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
  // untrustworthy (transform design §11).
  private async runReforgePlan(job: Job.Row): Promise<void> {
    await this.jobService.progress(job.id, { done: 0, total: 1, current: 'drafting', phase: 'planning' });
    const { plan, outputChapterCount } = await this.reforgePlanService.draft(job.projectId, job.id);
    await this.jobService.progress(job.id, { done: 1, total: 1, current: 'done', phase: 'planning' });
    this.logger.info('runReforgePlan: complete', { jobId: job.id, projectId: job.projectId, planId: String(plan.id), revision: plan.revision, outputChapterCount });
  }

  // The N:M write. The approved plan is the only structural authority (hard rule 16), so the stage
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

  private async runChapterReforge(job: Job.Row, payload: ReforgePayload): Promise<void> {
    const projectId = job.projectId;
    this.logger.info('runReforge: starting', { jobId: job.id, projectId, force: payload.force, limit: payload.limit, chapters: payload.chapters });

    try {
      const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
      if (!project) throw AppError.internal(`project ${projectId} not found`);
      const chapterCount = await this.db.$count(schema.chapters, eq(schema.chapters.projectId, projectId));
      this.logger.debug('runReforge: phase 1 — chapters present', { jobId: job.id, projectId, chapterCount });
      if (chapterCount === 0) throw AppError.internal(`project ${projectId} has no chapters — provide chapters before running reforge`);

      // Phase 1.5: merge translator-split chapter parts before the glossary ever sees them
      // (recombine design §1); the guard makes this a safe no-op on resume.
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

    for (let i = 0; i < total; i += IMPORT_BATCH_SIZE) {
      const batch = chapters.slice(i, i + IMPORT_BATCH_SIZE);
      await this.jobService.progress(job.id, { done: i, total, current: String(i + 1), phase: 'inserting' });
      this.logger.debug('runImport: inserting chapter batch', { jobId: job.id, from: i + 1, to: i + batch.length, total });
      const values = batch.map((chapter, offset) => ({
        projectId,
        number: i + offset + 1,
        title: chapter.title,
        content: chapter.content,
        wordCount: countWords(chapter.content),
        status: 'done' as const,
        // `final` mode is the finished novel: human-authored, immutable, publishable from chapter 1
        // (PUB_002/PUB_003). `source` mode explicitly writes the column's own default so a later
        // rebrand/reforge/extract pass treats it exactly like any other source project's chapters.
        generator: mode === 'final' ? ('human' as const) : ('standard' as const),
        locked: mode === 'final',
      }));
      await this.db.insert(schema.chapters).values(values);
    }
    await this.jobService.progress(job.id, { done: total, total, current: 'chapters', phase: 'inserting' });

    if (cover) {
      this.logger.debug('runImport: storing cover asset', { jobId: job.id, projectId });
      const bytes = new Uint8Array(Buffer.from(cover.dataBase64, 'base64'));
      const ref = await this.storage.save(bytes, { contentType: cover.mimeType });
      await this.db.update(schema.projects).set({ coverImagePath: ref, updatedAt: new Date() }).where(eq(schema.projects.id, projectId));
    }

    if (mode === 'source') {
      // Re-homes the auto-recombine hook that used to run on remote-ingest completion (recombine design
      // §pipeline hooks) — autoRecombine already no-ops quietly when there is nothing to merge.
      this.logger.info('runImport: source mode — running auto-recombine', { jobId: job.id, projectId });
      await this.jobService.progress(job.id, { done: total, total, current: 'recombine', phase: 'recombining' });
      await this.recombineService.autoRecombine(projectId);
    }

    // The chapters/cover are now durably in the `chapters`/`projects` tables — the full bundle prose
    // sitting in `jobs.payload` (up to the novel-import size limit) has no further purpose and must
    // not linger. Compact it to a small summary; `redactJobForResponse` keeps the wire safe regardless
    // (mid-run or on a failed job, where this line is never reached), but this keeps the row itself small.
    await this.db
      .update(schema.jobs)
      .set({ payload: { chapters: total, hasCover: !!cover } as never, updatedAt: new Date() })
      .where(eq(schema.jobs.id, job.id));

    this.logger.info('runImport: complete', { jobId: job.id, projectId, mode, chapters: total });
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
}
