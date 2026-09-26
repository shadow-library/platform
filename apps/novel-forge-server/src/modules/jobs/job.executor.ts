import { and, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService, StorageService } from '@shadow-library/modules';

import { isAuthoringJob } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type DbExecutor, type Job, type PrimaryDatabase, schema } from '@server/database';

import { runWithCostTier } from '../ai/cost-tier-scope';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { isTransientModelFailure } from '../ai/transient-model-error';
import { IndexingService } from '../ai/retrieval/indexing.service';
import { setProjectCover } from '../illustration/uploaded-cover';
import { landFinalChapters } from '../novel-import/land-chapters';
import { PublishRunner } from '../publishing/publish-runner';
import { AuthoringClaimService } from './authoring-claim.service';
import { JobService, payloadCostTier, type TransitionedJob } from './job.service';

interface GeneratePayload {
  chapters: number[];
  autoFix?: boolean;
  maxFixes?: number;
  guidance?: string;
}

// Staged on `jobs.payload` by `NovelImportService.import` inside the same transaction that creates the
// project — kept as a local shape (not imported from the novel-import module) exactly like every other
// payload interface above, so JobExecutor never depends on the enqueuing feature module.
interface ImportPayload {
  chapters: { title: string; content: string; volumeKey?: string }[];
  cover?: { mimeType: string; dataBase64: string };
}

// A cancel request only lands in the job row, so the executor polls for it while a step is in flight.
// Without the poll a single-run phase (one chapter's generation) would keep spending for the
// whole of a model call after the author hit stop; the boundary checks alone only catch it between steps.
const CANCEL_POLL_MS = 1000;

const BUILT_IN_KINDS: ReadonlySet<Job.Kind> = new Set(['generate', 'backfill', 'publish', 'import']);

// A model call that still times out, is rate limited, meets a 5xx or loses its connection after the router's own retries is retried once more as a whole job,
// later: organising long notes or planning can outlast a gateway's patience on a bad minute. Only kinds whose handler skips work it already staged are retried.
const RETRYABLE_KINDS: ReadonlySet<Job.Kind> = new Set(['organise', 'plan']);
const MAX_JOB_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 30_000;

const CLAIM_REFUSED_MESSAGE = 'Another chapter was being written, planned or finalized for this novel, so this job did not start';
const CLAIM_LOST_MESSAGE = 'This job stopped responding and another job took over the novel, so its result was not kept as finished';

export type JobHandler = (job: Job.Row) => Promise<void>;

type SettleOutcome =
  { status: 'done' } | { status: 'failed'; error: string; cause: unknown } | { status: 'retry'; error: string; cause: unknown; nextAttemptAt: Date } | { status: 'cancelled' };

/**
 * `attempts` is read before the dispatch that counts this attempt, so the attempt now ending is one more. The wait stays within half the
 * claim TTL: the reservation that holds the novel for the retry is not heartbeated, and must not go stale before the retry is due.
 */
export function retryAfter(job: Pick<Job.Row, 'kind' | 'attempts'>, err: unknown, claimTtlMs: number, now = Date.now()): Date | undefined {
  const attempt = job.attempts + 1;
  if (!RETRYABLE_KINDS.has(job.kind) || attempt >= MAX_JOB_ATTEMPTS) return undefined;
  if (!AppError.is(err) || !isTransientModelFailure(err)) return undefined;
  return new Date(now + Math.min(RETRY_BACKOFF_MS * 2 ** (attempt - 1), claimTtlMs / 2));
}

interface JobWatch {
  observed: boolean;
  claimLost: boolean;
  claim?: { projectId: bigint; token: string };
}

@Injectable()
export class JobExecutor {
  private readonly logger = Logger.getLogger(APP_NAME, JobExecutor.name);
  private readonly db: PrimaryDatabase;
  private readonly cancelWatches = new Map<string, JobWatch>();
  private readonly handlers = new Map<Job.Kind, JobHandler>();
  private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly jobService: JobService,
    private readonly claims: AuthoringClaimService,
    private readonly workflowRunService: WorkflowRunService,
    private readonly indexingService: IndexingService,
    private readonly databaseService: DatabaseService,
    private readonly publishRunner: PublishRunner,
    private readonly storage: StorageService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  // On boot, drain any jobs left pending — including ones just reset from in_progress by crash recovery.
  // Without this a crashed job would sit pending forever with no one to pick it up. It waits for application ready, after every
  // module's init, so the job kinds other modules register have their handlers by then.
  async onApplicationReady(): Promise<void> {
    const pending = await this.jobService.findPending();
    if (pending.length === 0) return;
    this.logger.info(`Dispatching ${pending.length} pending job(s) on boot`);
    for (const job of pending) this.dispatch(job.id).catch(err => this.logger.error('Boot dispatch failed', { err, jobId: job.id }));
  }

  onModuleDestroy(): void {
    for (const timer of this.retryTimers.values()) clearTimeout(timer);
    this.retryTimers.clear();
  }

  /** Lets a module above this one run its own job kind, since this module cannot depend on it. */
  registerHandler(kind: Job.Kind, handler: JobHandler): void {
    this.handlers.set(kind, handler);
  }

  async dispatch(jobId: string): Promise<void> {
    this.logger.debug('dispatch requested', { jobId });
    const job = await this.jobService.get(jobId);
    if (!job) {
      this.logger.warn('dispatch: job not found', { jobId });
      return;
    }

    // Only pending jobs are dispatchable. A done/failed job must not silently re-run (and re-spend on
    // LLM calls); an in_progress job is already owned by another dispatch.
    if (job.status !== 'pending') {
      this.logger.warn('dispatch: skipping non-pending job', { jobId, status: job.status });
      return;
    }

    const wait = (job.nextAttemptAt?.getTime() ?? 0) - Date.now();
    if (wait > 0) return this.dispatchLater(jobId, wait);

    // Left pending rather than failed: a handler missing here is a wiring fault, and the next dispatch after it is fixed runs the job.
    if (!BUILT_IN_KINDS.has(job.kind) && !this.handlers.has(job.kind)) {
      this.logger.error('dispatch: no handler is registered for this job kind — leaving the job pending', { jobId, kind: job.kind });
      return;
    }

    if (!isAuthoringJob(job.kind)) return this.execute(job);
    const token = await this.claims.acquire(job.projectId, job.id, job.kind);
    if (!token) return this.refuseUnclaimed(job);
    return this.execute(job, token);
  }

  // One timer per job: the boot drain and the janitor can both find a job waiting out its backoff.
  private dispatchLater(jobId: string, delayMs: number): void {
    if (this.retryTimers.has(jobId)) return;
    const timer = setTimeout(() => {
      this.retryTimers.delete(jobId);
      this.dispatch(jobId).catch(err => this.logger.error('retry dispatch failed', { err, jobId }));
    }, delayMs);
    timer.unref();
    this.retryTimers.set(jobId, timer);
  }

  // A claim still naming this job belongs to an earlier dispatch of it (a crashed worker, or a replica still running it); the janitor retries once it is stale.
  private async refuseUnclaimed(job: Job.Row): Promise<void> {
    const holder = await this.claims.holder(job.projectId);
    if (holder?.jobId === job.id) return this.logger.info('dispatch: job waits for its previous claim to go stale', { jobId: job.id, projectId: job.projectId });
    this.logger.warn('dispatch: another authoring job holds the project', { jobId: job.id, projectId: job.projectId, holderJobId: holder?.jobId, holderKind: holder?.kind });
    await this.jobService.fail(job.id, CLAIM_REFUSED_MESSAGE);
  }

  private async execute(job: Job.Row, token?: string): Promise<void> {
    const { id: jobId, projectId } = job;
    const claimed = await this.jobService.start(jobId);
    if (!claimed) {
      this.logger.warn('dispatch: job already claimed by another worker', { jobId });
      if (token) await this.claims.release(projectId, token);
      return;
    }

    // Winning `start()` is what earns the right to refuse to start. Two paths reach here already cancelled: a job
    // cancelled after the status read above, and one that crash recovery reset from in_progress back to
    // pending with its request still on the row.
    if (await this.cancelRequested(jobId)) return this.settle(job, token, { status: 'cancelled' });

    const startedAt = Date.now();
    // Payload can carry chapter lists, guidance, limits — sensitive/verbose, so it rides on debug.
    this.logger.info('Job started', { jobId, kind: job.kind, projectId, target: job.target });
    this.logger.debug('Job payload', { jobId, kind: job.kind, payload: job.payload });
    const outcome = await this.runWatched(job, token);
    await this.settle(job, token, outcome);
    if (outcome.status === 'done') this.logger.info('Job succeeded', { jobId, kind: job.kind, projectId, durationMs: Date.now() - startedAt });
    if (outcome.status === 'failed') this.logger.error('Job failed', { jobId, kind: job.kind, projectId, durationMs: Date.now() - startedAt, err: outcome.cause });
  }

  // Watching stops before the settle releases the claim, so a heartbeat racing the release is never reported as a lost claim.
  private async runWatched(job: Job.Row, token: string | undefined): Promise<SettleOutcome> {
    const stopWatching = this.watchForCancellation(job.id, job.projectId, token);
    try {
      await runWithCostTier(payloadCostTier(job.payload), () => this.runJob(job));
      return (await this.cancelRequested(job.id)) ? { status: 'cancelled' } : { status: 'done' };
    } catch (err) {
      // Cancellation wins over the error: an aborted model call surfaces as a thrown step, and cancellation makes
      // the job terminal-cancelled with its finished work kept, not failed into a retry ladder.
      if (await this.cancelRequested(job.id)) return { status: 'cancelled' };
      const error = err instanceof Error ? err.message : String(err);
      const nextAttemptAt = retryAfter(job, err, this.claims.ttlMs);
      return nextAttemptAt ? { status: 'retry', error, cause: err, nextAttemptAt } : { status: 'failed', error, cause: err };
    } finally {
      stopWatching();
    }
  }

  // The settle is the fencing point: the final status commits with the claim's release, and only while the token still holds it.
  private async settle(job: Job.Row, token: string | undefined, outcome: SettleOutcome): Promise<void> {
    const settled: { outcome: SettleOutcome; transitions: TransitionedJob[] } = { outcome, transitions: [] };
    const keep = (transition: TransitionedJob | undefined): void => void (transition && settled.transitions.push(transition));
    const write = async (db?: DbExecutor): Promise<void> => {
      if (outcome.status === 'done') return keep(await this.jobService.succeed(job.id, db));
      if (outcome.status === 'failed') return keep(await this.jobService.fail(job.id, outcome.error, db));
      if (outcome.status === 'cancelled') return keep(await this.jobService.settleCancelled(job.id, db));
      const retried = await this.jobService.scheduleRetry(job.id, outcome.error, outcome.nextAttemptAt, db);
      if (!retried) {
        settled.outcome = { status: 'cancelled' };
        return keep(await this.jobService.settleCancelled(job.id, db));
      }
      keep(retried);
      // Re-reserved as the claim is released, so no other authoring job takes the novel while this one waits out its backoff.
      if (isAuthoringJob(job.kind)) await this.claims.reserve(db ?? this.db, job.projectId, job.id, job.kind);
    };
    if (!token) await write();
    else if (!(await this.claims.settle(job.projectId, token, write))) return this.settleLostClaim(job, outcome);
    else for (const transition of settled.transitions) this.jobService.publish(job.id, transition);

    const final = settled.outcome;
    if (final.status === 'retry') {
      await this.workflowRunService.settleJobRuns(job.id, 'failed', final.cause);
      this.logger.warn('Job will be retried', { jobId: job.id, kind: job.kind, projectId: job.projectId, nextAttemptAt: final.nextAttemptAt });
      return this.dispatchLater(job.id, final.nextAttemptAt.getTime() - Date.now());
    }
    if (final.status !== 'done') await this.workflowRunService.settleJobRuns(job.id, final.status, final.status === 'failed' ? final.cause : undefined);
    if (final.status === 'cancelled') this.logger.info('Job cancelled', { jobId: job.id, kind: job.kind, projectId: job.projectId });
  }

  // A claim re-taken for this same job means a newer run of it owns the row now, so the stale run leaves the row alone.
  private async settleLostClaim(job: Job.Row, outcome: SettleOutcome): Promise<void> {
    const holder = await this.claims.holder(job.projectId);
    this.logger.warn('Job lost its authoring claim before settling', { jobId: job.id, projectId: job.projectId, outcome: outcome.status, holderJobId: holder?.jobId });
    if (holder?.jobId === job.id) return;
    await this.jobService.fail(job.id, CLAIM_LOST_MESSAGE);
  }

  private watchForCancellation(jobId: string, projectId: bigint, token?: string): () => void {
    this.cancelWatches.set(jobId, { observed: false, claimLost: false, claim: token ? { projectId, token } : undefined });
    const stopHeartbeat = token ? this.claims.keepAlive(projectId, token, () => void this.onClaimLost(jobId)) : undefined;
    const timer = setInterval(() => void this.cancelRequested(jobId).catch(err => this.logger.warn('cancel poll failed', { err, jobId })), CANCEL_POLL_MS);
    timer.unref();
    return () => {
      clearInterval(timer);
      stopHeartbeat?.();
      this.cancelWatches.delete(jobId);
    };
  }

  // At a chapter boundary the heartbeat doubles as the fence check, so a job that lost its claim never starts the next chapter.
  private async mayContinue(jobId: string): Promise<boolean> {
    if (await this.cancelRequested(jobId)) return false;
    const watch = this.cancelWatches.get(jobId);
    if (!watch?.claim) return true;
    if (!watch.claimLost && (await this.claims.heartbeat(watch.claim.projectId, watch.claim.token))) return true;
    await this.onClaimLost(jobId);
    return false;
  }

  private async onClaimLost(jobId: string): Promise<void> {
    const watch = this.cancelWatches.get(jobId);
    if (!watch || watch.claimLost) return;
    watch.claimLost = true;
    this.logger.warn('Job lost its authoring claim; stopping its runs', { jobId });
    await this.cancelLiveRuns(jobId);
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

  private async runJob(job: Job.Row): Promise<void> {
    this.logger.debug('runJob: routing to handler', { jobId: job.id, kind: job.kind });
    switch (job.kind) {
      case 'generate':
        return this.runGenerate(job);
      case 'backfill':
        return this.runBackfill(job);
      case 'publish':
        return this.runPublish(job);
      case 'import':
        return this.runImport(job);
      default: {
        const handler = this.handlers.get(job.kind);
        if (!handler) throw AppError.internal(`Unsupported job kind: ${job.kind}`);
        return handler(job);
      }
    }
  }

  private async runGenerate(job: Job.Row): Promise<void> {
    const { chapters = [], autoFix, maxFixes, guidance } = (job.payload ?? {}) as GeneratePayload;
    const total = chapters.length;
    this.logger.debug('runGenerate: starting', { jobId: job.id, chapters, total, autoFix, maxFixes, guidance });

    for (const [i, chapter] of chapters.entries()) {
      if (!(await this.mayContinue(job.id))) return;
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
  // job only writes chapters and the cover. A mid-batch failure leaves the project and whatever chapters
  // already landed in place (job marked failed, matching every other executor) rather than rolling back —
  // the caller can inspect, retry manually, or delete the project.
  private async runImport(job: Job.Row): Promise<void> {
    const { chapters, cover } = (job.payload ?? {}) as ImportPayload;
    const projectId = job.projectId;
    const total = chapters.length;
    this.logger.info('runImport: starting', { jobId: job.id, projectId, total, hasCover: !!cover });

    // The finished novel: human-authored, immutable, publishable from chapter 1 (PUB_002/PUB_003).
    await landFinalChapters(this.db, projectId, chapters, {
      onBatch: async (done, chapterTotal) => {
        await this.jobService.progress(job.id, { done, total: chapterTotal, current: done === chapterTotal ? 'chapters' : String(done + 1), phase: 'inserting' });
      },
    });

    // The only boundary an import has: the chapters are landed and kept, the cover is abandoned. The
    // payload is still compacted, so a cancelled import never leaves the whole bundle's prose sitting on the row.
    if (!(await this.mayContinue(job.id))) return this.compactImportPayload(job.id, total, !!cover);

    if (cover) {
      this.logger.debug('runImport: storing cover asset', { jobId: job.id, projectId });
      const bytes = new Uint8Array(Buffer.from(cover.dataBase64, 'base64'));
      const ref = await this.storage.save(bytes, { contentType: cover.mimeType });
      await setProjectCover(this.db, projectId, ref);
    }

    await this.compactImportPayload(job.id, total, !!cover);
    this.logger.info('runImport: complete', { jobId: job.id, projectId, chapters: total });
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
