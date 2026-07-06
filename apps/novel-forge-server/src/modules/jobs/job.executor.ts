/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { type Job, type PrimaryDatabase } from '@server/database';

import { ConcurrencyController } from './concurrency.controller';
import { JobService } from './job.service';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { IndexingService } from '../ai/retrieval/indexing.service';
import { AcquireService } from '../source/acquire.service';

/**
 * Defining types
 */

interface GeneratePayload {
  chapters: number[];
  autoFix?: boolean;
  maxFixes?: number;
  guidance?: string;
}

interface ExtractPayload {
  chapters: number[];
}

interface IngestPayload {
  limit?: number;
  delayMs?: number;
}

/**
 * Declaring the constants
 */

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
    private readonly acquireService: AcquireService,
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
    // A10 will add Ollama detection; for now all jobs use remote LLM concurrency.
    const isLocal = false;
    const key = this.concurrency.lockKey(projectId, isLocal);

    await this.concurrency.run(key, async () => {
      // Claim the job atomically; if another worker beat us to it inside the lock, stand down.
      const claimed = await this.jobService.start(jobId);
      if (!claimed) {
        this.logger.warn('dispatch: job already claimed by another worker', { jobId });
        return;
      }
      try {
        await this.runJob(job);
        await this.jobService.succeed(jobId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error('Job failed', { jobId, kind: job.kind, err });
        await this.jobService.fail(jobId, msg);
      }
    });
  }

  private async runJob(job: Job.Row): Promise<void> {
    switch (job.kind) {
      case 'generate':
        return this.runGenerate(job);
      case 'extract':
        return this.runExtract(job);
      case 'backfill':
        return this.runBackfill(job);
      case 'ingest':
      case 'resume':
        return this.runIngest(job);
      default:
        throw new Error(`Unsupported job kind: ${job.kind}`);
    }
  }

  private async runGenerate(job: Job.Row): Promise<void> {
    const { chapters = [], autoFix, maxFixes, guidance } = (job.payload ?? {}) as GeneratePayload;
    const total = chapters.length;

    for (const [i, chapter] of chapters.entries()) {
      await this.jobService.progress(job.id, { done: i, total, current: String(chapter), phase: 'generating' });
      await this.workflowRunService.runChapterGeneration({ projectId: job.projectId, chapter, autoFix, maxFixes, guidance, jobId: job.id });
    }
  }

  private async runExtract(job: Job.Row): Promise<void> {
    const { chapters = [] } = (job.payload ?? {}) as ExtractPayload;
    const total = chapters.length;

    for (const [i, chapter] of chapters.entries()) {
      await this.jobService.progress(job.id, { done: i, total, current: String(chapter), phase: 'extracting' });
      await this.workflowRunService.runSourceExtraction({ projectId: job.projectId, chapter });
    }
  }

  private async runBackfill(job: Job.Row): Promise<void> {
    await this.jobService.progress(job.id, { done: 0, total: 1, current: 'all', phase: 'embedding' });
    await this.indexingService.backfill(job.projectId);
    await this.jobService.progress(job.id, { done: 1, total: 1, current: 'all', phase: 'embedding' });
  }

  private async runIngest(job: Job.Row): Promise<void> {
    const { limit, delayMs } = (job.payload ?? {}) as IngestPayload;
    await this.jobService.progress(job.id, { done: 0, total: 1, current: 'scraping', phase: 'ingest' });
    const result = await this.acquireService.ingest(job.projectId, { limit, delayMs });
    await this.jobService.progress(job.id, { done: result.ingested, total: result.ingested, current: 'done', phase: 'ingest' });
  }
}
