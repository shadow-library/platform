import { and, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService, StorageService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type Job, type PrimaryDatabase, schema } from '@server/database';

import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { IndexingService } from '../ai/retrieval/indexing.service';
import { BlueprintRoundRunner } from '../blueprint/engine/blueprint-round.runner';
import { setProjectCover } from '../illustration/uploaded-cover';
import { landFinalChapters } from '../novel-import/land-chapters';
import { PublishRunner } from '../publishing/publish-runner';
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

// Staged on `jobs.payload` by `NovelImportService.import` inside the same transaction that creates the
// project — kept as a local shape (not imported from the novel-import module) exactly like every other
// payload interface above, so JobExecutor never depends on the enqueuing feature module.
interface ImportPayload {
  mode: 'final' | 'source';
  chapters: { title: string; content: string }[];
  cover?: { mimeType: string; dataBase64: string };
}

// A cancel request only lands in the job row, so the executor polls for it while a step is in flight.
// Without the poll a single-run phase (a Blueprint round, one chapter's generation) would keep spending for the
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
    private readonly recombineService: RecombineService,
    private readonly publishRunner: PublishRunner,
    private readonly storage: StorageService,
    private readonly blueprintRoundRunner: BlueprintRoundRunner,
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
      case 'publish':
        return this.runPublish(job);
      case 'import':
        return this.runImport(job);
      case 'blueprint':
        return this.runBlueprint(job);
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

  private async runBlueprint(job: Job.Row): Promise<void> {
    await this.jobService.progress(job.id, { done: 0, total: 1, current: job.target, phase: 'blueprint', startedAt: new Date().toISOString() });
    await this.blueprintRoundRunner.run(job);
    await this.jobService.progress(job.id, { done: 1, total: 1, current: job.target, phase: 'blueprint' });
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
    // extract pass treats it exactly like any other source project's chapters.
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
}
