/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';
import { and, asc, eq, ne, sql } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { type Job, type PrimaryDatabase, type Rebrand, schema } from '@server/database';

import { ConcurrencyController } from './concurrency.controller';
import { JobService } from './job.service';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { IndexingService } from '../ai/retrieval/indexing.service';
import { RebrandService } from '../rebrand/rebrand.service';
import { AcquireService } from '../source/acquire.service';
import { RecombineService } from '../source/recombine.service';
import { WebnovelCatalogService } from '../source/webnovel-catalog.service';

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

interface RebrandPayload {
  chapters?: number[];
  force?: boolean;
  limit?: number;
}

/**
 * Declaring the constants
 */

// Pages per acquire batch when scraping to completion — small enough that job progress (and a crash
// cursor) advances every few seconds, polite enough for the source site.
const INGEST_BATCH = 10;

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
    private readonly rebrandService: RebrandService,
    private readonly recombineService: RecombineService,
    private readonly webnovelCatalog: WebnovelCatalogService,
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
      case 'rebrand':
        return this.runRebrand(job);
      default:
        throw new Error(`Unsupported job kind: ${job.kind}`);
    }
  }

  private async runGenerate(job: Job.Row): Promise<void> {
    const { chapters = [], autoFix, maxFixes, guidance } = (job.payload ?? {}) as GeneratePayload;
    const total = chapters.length;

    for (const [i, chapter] of chapters.entries()) {
      await this.jobService.progress(job.id, { done: i, total, current: String(chapter), phase: 'generating' });
      const result = await this.workflowRunService.runChapterGeneration({ projectId: job.projectId, chapter, autoFix, maxFixes, guidance, jobId: job.id });
      // The run service swallows its own errors into a `failed` result; surface that as a job failure
      // instead of quietly marking the job done with no draft persisted.
      if (result.status === 'failed') throw new Error(`chapter ${chapter} generation failed (run ${result.runId})`);
    }
  }

  private async runExtract(job: Job.Row): Promise<void> {
    const { chapters = [] } = (job.payload ?? {}) as ExtractPayload;
    const total = chapters.length;

    for (const [i, chapter] of chapters.entries()) {
      await this.jobService.progress(job.id, { done: i, total, current: String(chapter), phase: 'extracting' });
      const result = await this.workflowRunService.runSourceExtraction({ projectId: job.projectId, chapter });
      if (result.status === 'failed') throw new Error(`chapter ${chapter} extraction failed (run ${result.runId})`);
    }
  }

  private async runBackfill(job: Job.Row): Promise<void> {
    await this.jobService.progress(job.id, { done: 0, total: 1, current: 'all', phase: 'embedding' });
    await this.indexingService.backfill(job.projectId);
    await this.jobService.progress(job.id, { done: 1, total: 1, current: 'all', phase: 'embedding' });
  }

  // An explicit `limit` keeps the old single-batch behavior; without one the job scrapes to
  // completion in polite batches, publishing the running chapter count after each so the UI can
  // follow live. `done` is the total chapters scraped so far (the cursor), not this job's count.
  private async runIngest(job: Job.Row): Promise<void> {
    const { limit, delayMs } = (job.payload ?? {}) as IngestPayload;
    await this.jobService.progress(job.id, { done: 0, total: 0, current: 'scraping', phase: 'ingest' });

    let complete = false;
    let scraped = 0;
    do {
      const result = await this.acquireService.ingest(job.projectId, { limit: limit ?? INGEST_BATCH, delayMs });
      complete = result.complete;

      const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, job.projectId), columns: { scrapeNextNumber: true } });
      scraped = Math.max((project?.scrapeNextNumber ?? 1) - 1, 0);
      await this.jobService.progress(job.id, { done: scraped, total: 0, current: `chapter ${scraped}`, phase: 'ingest' });

      if (!complete && result.ingested === 0) throw new Error('acquisition stalled: 0 pages ingested and the scrape is incomplete');
    } while (!complete && limit === undefined);

    // A finished scrape triggers the hygiene passes (recombine design §1, §5): reference titles
    // first — webnovel's part markers feed the recombine ladder — then part merging. Both are safe
    // no-ops when unconfigured or guarded.
    if (complete) {
      await this.jobService.progress(job.id, { done: scraped, total: scraped, current: 'merging parts', phase: 'recombining' });
      await this.webnovelCatalog.autoSync(job.projectId);
      await this.recombineService.autoRecombine(job.projectId);
    }

    await this.jobService.progress(job.id, { done: scraped, total: scraped, current: 'done', phase: 'ingest' });
  }

  // ─── Rebrand (rebrand design §6) ──────────────────────────────────────────────
  // Three phases, each derived from data — never from rebrands.status, which is advisory display
  // state updated at phase boundaries. Resume recomputes everything, so a crashed job re-posts clean.
  private async runRebrand(job: Job.Row): Promise<void> {
    const projectId = job.projectId;
    const payload = (job.payload ?? {}) as RebrandPayload;

    try {
      // Phase 1: finish acquisition. Blocking on a stalled scrape is correct — nothing to convert.
      let project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
      if (!project) throw new Error(`project ${projectId} not found`);
      while (!project.scrapeComplete) {
        await this.setRebrandStatus(projectId, 'ingesting');
        await this.jobService.progress(job.id, { done: project.scrapeNextNumber ?? 0, total: 0, current: 'scraping', phase: 'ingest' });
        const result = await this.acquireService.ingest(projectId, {});
        project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
        if (!project) throw new Error(`project ${projectId} not found`);
        if (result.ingested === 0 && !project.scrapeComplete) throw new Error('acquisition stalled: 0 pages ingested and the scrape is incomplete');
      }

      // Phase 1.5: reference titles from webnovel (when configured), then merge translator-split
      // chapter parts — both before the glossary ever sees them (recombine design §1, §5); the
      // guards make these safe no-ops on resume.
      await this.jobService.progress(job.id, { done: 0, total: 0, current: 'merging parts', phase: 'recombining' });
      await this.webnovelCatalog.autoSync(projectId);
      await this.recombineService.autoRecombine(projectId);

      // Phase 2: glossary seed (idempotent inside the service — resume never re-seeds or re-bills).
      await this.setRebrandStatus(projectId, 'glossary');
      await this.jobService.progress(job.id, { done: 0, total: 0, current: 'glossary', phase: 'glossary' });
      await this.rebrandService.seedGlossary(projectId, job.id);

      // Phase 3: convert pending chapters ascending.
      await this.setRebrandStatus(projectId, 'converting');
      const targets = await this.selectRebrandChapters(projectId, payload);
      const total = targets.length;
      for (const [i, chapter] of targets.entries()) {
        await this.jobService.progress(job.id, { done: i, total, current: String(chapter), phase: 'converting' });
        const result = await this.workflowRunService.runChapterRebrand({ projectId, chapter, jobId: job.id });
        // Flag-and-continue — a deliberate divergence from runGenerate/runExtract's throw: a failed
        // chapter records a failed conversion row and the loop moves on; the pipeline never blocks.
        if (result.status === 'failed') await this.recordFailedConversion(projectId, chapter, result.runId);
      }

      await this.jobService.progress(job.id, { done: total, total, current: 'done', phase: 'converting' });
      await this.setRebrandStatus(projectId, 'done');
    } catch (err) {
      await this.setRebrandStatus(projectId, 'failed', err instanceof Error ? err.message : String(err));
      throw err;
    }
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
}
