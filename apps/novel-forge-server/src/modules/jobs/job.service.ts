import { and, desc, eq, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { ownedBy, type OwnerRef } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type Job, type PrimaryDatabase, schema } from '@server/database';

import { ProjectEventService } from '../events/project-event.service';

export interface JobProgress {
  done: number;
  total: number;
  current: string;
  phase: string;
  skipped?: number[];
}

export interface JobCancelResult {
  status: Job.Status;
  outcome: 'cancelled' | 'stopping' | 'already_settled';
}

@Injectable()
export class JobService {
  private readonly logger = Logger.getLogger(APP_NAME, JobService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly events: ProjectEventService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async onModuleInit(): Promise<void> {
    await this.recoverStuck();
  }

  // Insert a new job row for (projectId, kind, target). Deduplication only applies to *active* work:
  // if a pending/in_progress job already exists we return it unchanged, but a previously terminal job
  // (done/failed) is reset to pending with the new payload so re-posting genuinely re-runs the work.
  async enqueue(projectId: bigint, kind: Job.Kind, target: string, payload?: unknown): Promise<string> {
    this.logger.debug('enqueue', { projectId, kind, target, payload });
    const [inserted] = await this.db
      .insert(schema.jobs)
      .values({ projectId, kind, target, payload: payload as never })
      .onConflictDoNothing()
      .returning({ id: schema.jobs.id });

    if (inserted) {
      this.logger.info('Job enqueued', { jobId: inserted.id, projectId, kind, target });
      this.announce(inserted.id, { projectId, kind, status: 'pending' });
      return inserted.id;
    }

    const existing = await this.db.query.jobs.findFirst({
      where: and(eq(schema.jobs.projectId, projectId), eq(schema.jobs.kind, kind), eq(schema.jobs.target, target)),
      columns: { id: true, status: true },
    });
    if (!existing) throw AppError.internal(`enqueue: job not found after conflict on (${projectId}, ${kind}, ${target})`);

    if (existing.status === 'pending' || existing.status === 'in_progress') {
      this.logger.debug('enqueue: deduped onto active job', { jobId: existing.id, kind, target, status: existing.status });
      return existing.id;
    }

    this.logger.info('Job re-enqueued (terminal job reset to pending)', { jobId: existing.id, kind, target, previousStatus: existing.status });
    await this.db
      .update(schema.jobs)
      .set({ status: 'pending', attempts: 0, lastError: null, progress: null, payload: payload as never, nextAttemptAt: null, cancelRequestedAt: null, updatedAt: new Date() })
      .where(eq(schema.jobs.id, existing.id));
    this.announce(existing.id, { projectId, kind, status: 'pending' });
    return existing.id;
  }

  async findPending(): Promise<Job.Row[]> {
    return this.db.query.jobs.findMany({ where: eq(schema.jobs.status, 'pending'), orderBy: desc(schema.jobs.createdAt) });
  }

  // Atomically claim a pending job. Returns false if another worker already claimed it, which keeps the
  // boot dispatcher and a fresh enqueue+dispatch from ever running the same job twice.
  async start(jobId: string): Promise<boolean> {
    const [job] = await this.db
      .update(schema.jobs)
      .set({ status: 'in_progress', attempts: sql`${schema.jobs.attempts} + 1`, updatedAt: new Date() })
      .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.status, 'pending')))
      .returning({ projectId: schema.jobs.projectId, kind: schema.jobs.kind, status: schema.jobs.status });
    if (job) this.announce(jobId, job);
    return job !== undefined;
  }

  async progress(jobId: string, progress: JobProgress): Promise<void> {
    this.logger.debug('job progress', { jobId, ...progress });
    const [job] = await this.db
      .update(schema.jobs)
      .set({ progress: progress as never, updatedAt: new Date() })
      .where(eq(schema.jobs.id, jobId))
      .returning({ projectId: schema.jobs.projectId, kind: schema.jobs.kind, status: schema.jobs.status });
    if (job) this.announce(jobId, job);
  }

  async succeed(jobId: string): Promise<void> {
    this.logger.debug('marking job done', { jobId });
    const [job] = await this.db
      .update(schema.jobs)
      .set({ status: 'done', updatedAt: new Date() })
      .where(eq(schema.jobs.id, jobId))
      .returning({ projectId: schema.jobs.projectId, kind: schema.jobs.kind, status: schema.jobs.status });
    if (job) this.announce(jobId, job);
  }

  async fail(jobId: string, error: string): Promise<void> {
    this.logger.warn('marking job failed', { jobId, error: error.slice(0, 2000) });
    const [job] = await this.db
      .update(schema.jobs)
      .set({ status: 'failed', lastError: error.slice(0, 2000), updatedAt: new Date() })
      .where(eq(schema.jobs.id, jobId))
      .returning({ projectId: schema.jobs.projectId, kind: schema.jobs.kind, status: schema.jobs.status });
    if (job) this.announce(jobId, job);
  }

  // The terminal write for a job the executor stopped: `cancel()` deliberately leaves an in_progress
  // job's status alone (D5), so this is the only path that converts the request into a settled row.
  async settleCancelled(jobId: string): Promise<void> {
    this.logger.info('marking job cancelled', { jobId });
    const [job] = await this.db
      .update(schema.jobs)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(schema.jobs.id, jobId))
      .returning({ projectId: schema.jobs.projectId, kind: schema.jobs.kind, status: schema.jobs.status });
    if (job) this.announce(jobId, job);
  }

  // A pending job is claimed by a conditional UPDATE, exactly like `start()` — never read-then-write —
  // so a cancel racing a dispatch cannot land after the worker has already claimed the row. The two
  // conditional updates are tried in the order a job actually progresses (pending, then in_progress),
  // which is why trying both is race-safe rather than a plain if/else on a stale read: whichever state
  // the row is in by the time each UPDATE runs is the one that matches, and a job never moves backwards.
  // An `in_progress` job only gets `cancelRequestedAt` (D5): the worker calls `succeed()`/`fail()` when
  // `runJob` returns and would overwrite a status written underneath it, so this never touches `status`.
  async cancel(jobId: string, projectId: bigint): Promise<JobCancelResult | undefined> {
    const [cancelledPending] = await this.db
      .update(schema.jobs)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.projectId, projectId), eq(schema.jobs.status, 'pending')))
      .returning({ projectId: schema.jobs.projectId, kind: schema.jobs.kind, status: schema.jobs.status });
    if (cancelledPending) {
      this.logger.info('job cancelled before dispatch', { jobId });
      this.announce(jobId, cancelledPending);
      return { status: 'cancelled', outcome: 'cancelled' };
    }

    const [flagged] = await this.db
      .update(schema.jobs)
      .set({ cancelRequestedAt: sql`coalesce(${schema.jobs.cancelRequestedAt}, now())`, updatedAt: new Date() })
      .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.projectId, projectId), eq(schema.jobs.status, 'in_progress')))
      .returning({ status: schema.jobs.status });
    if (flagged) {
      this.logger.info('job cancellation requested; worker will settle it at the next step boundary', { jobId });
      return { status: 'in_progress', outcome: 'stopping' };
    }

    const row = await this.db.query.jobs.findFirst({
      where: and(eq(schema.jobs.id, jobId), eq(schema.jobs.projectId, projectId)),
      columns: { status: true },
    });
    return row ? { status: row.status, outcome: 'already_settled' } : undefined;
  }

  async get(jobId: string): Promise<Job.Row | undefined> {
    return this.db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
  }

  // The owner-scoped read behind `GET /api/v1/jobs/:jobId` (NF-BOLA-02): a job is only visible to the
  // owner of its project. Resolving projectId → owner via an inner join returns nothing when the job is
  // missing or owned by someone else, and a null owner_id never matches — so it fails closed.
  async getForOwner(jobId: string, owner: OwnerRef): Promise<Job.Row | undefined> {
    const [row] = await this.db
      .select({ job: schema.jobs })
      .from(schema.jobs)
      .innerJoin(schema.projects, eq(schema.jobs.projectId, schema.projects.id))
      .where(and(eq(schema.jobs.id, jobId), ownedBy(schema.projects, owner)))
      .limit(1);
    return row?.job;
  }

  async listByProject(projectId: bigint): Promise<Job.Row[]> {
    return this.db.query.jobs.findMany({ where: eq(schema.jobs.projectId, projectId), orderBy: desc(schema.jobs.createdAt) });
  }

  private announce(jobId: string, job: { projectId: bigint; kind: Job.Kind; status: Job.Status }): void {
    this.events.publish(job.projectId, { type: 'job', jobId, kind: job.kind, status: job.status });
  }

  async recoverStuck(): Promise<void> {
    const stuck = await this.db.query.jobs.findMany({
      where: eq(schema.jobs.status, 'in_progress'),
      columns: { id: true, kind: true, target: true },
    });

    if (stuck.length === 0) return;

    this.logger.warn(`Crash recovery: resetting ${stuck.length} in-progress job(s) back to pending`, {
      jobs: stuck.map(j => ({ id: j.id, kind: j.kind, target: j.target })),
    });

    await this.db.update(schema.jobs).set({ status: 'pending', updatedAt: new Date() }).where(eq(schema.jobs.status, 'in_progress'));
  }
}
