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
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async dispatch(jobId: string): Promise<void> {
    const job = await this.jobService.get(jobId);
    if (!job) {
      this.logger.warn('dispatch: job not found', { jobId });
      return;
    }

    const projectId = job.projectId;
    // A10 will add Ollama detection; for now all jobs use remote LLM concurrency.
    const isLocal = false;
    const key = this.concurrency.lockKey(projectId, isLocal);

    await this.concurrency.run(key, async () => {
      await this.jobService.start(jobId);
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
}
