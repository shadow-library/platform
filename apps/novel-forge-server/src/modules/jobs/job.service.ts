import { and, desc, eq, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type Job, type PrimaryDatabase, schema } from '@server/database';

export interface JobProgress {
  done: number;
  total: number;
  current: string;
  phase: string;
  skipped?: number[];
}

@Injectable()
export class JobService {
  private readonly logger = Logger.getLogger(APP_NAME, JobService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
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
      .set({ status: 'pending', attempts: 0, lastError: null, progress: null, payload: payload as never, nextAttemptAt: null, updatedAt: new Date() })
      .where(eq(schema.jobs.id, existing.id));
    return existing.id;
  }

  async findPending(): Promise<Job.Row[]> {
    return this.db.query.jobs.findMany({ where: eq(schema.jobs.status, 'pending'), orderBy: desc(schema.jobs.createdAt) });
  }

  // Atomically claim a pending job. Returns false if another worker already claimed it, which keeps the
  // boot dispatcher and a fresh enqueue+dispatch from ever running the same job twice.
  async start(jobId: string): Promise<boolean> {
    const claimed = await this.db
      .update(schema.jobs)
      .set({ status: 'in_progress', attempts: sql`${schema.jobs.attempts} + 1`, updatedAt: new Date() })
      .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.status, 'pending')))
      .returning({ id: schema.jobs.id });
    return claimed.length > 0;
  }

  async progress(jobId: string, progress: JobProgress): Promise<void> {
    this.logger.debug('job progress', { jobId, ...progress });
    await this.db
      .update(schema.jobs)
      .set({ progress: progress as never, updatedAt: new Date() })
      .where(eq(schema.jobs.id, jobId));
  }

  async succeed(jobId: string): Promise<void> {
    this.logger.debug('marking job done', { jobId });
    await this.db.update(schema.jobs).set({ status: 'done', updatedAt: new Date() }).where(eq(schema.jobs.id, jobId));
  }

  async fail(jobId: string, error: string): Promise<void> {
    this.logger.warn('marking job failed', { jobId, error: error.slice(0, 2000) });
    await this.db
      .update(schema.jobs)
      .set({ status: 'failed', lastError: error.slice(0, 2000), updatedAt: new Date() })
      .where(eq(schema.jobs.id, jobId));
  }

  async get(jobId: string): Promise<Job.Row | undefined> {
    return this.db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
  }

  // The owner-scoped read behind `GET /api/v1/jobs/:jobId` (NF-BOLA-02): a job is only visible to the
  // owner of its project. Resolving projectId → owner_id via an inner join returns nothing when the job
  // is missing or owned by someone else, and a null owner_id never matches — so it fails closed.
  async getForOwner(jobId: string, ownerId: bigint): Promise<Job.Row | undefined> {
    const [row] = await this.db
      .select({ job: schema.jobs })
      .from(schema.jobs)
      .innerJoin(schema.projects, eq(schema.jobs.projectId, schema.projects.id))
      .where(and(eq(schema.jobs.id, jobId), eq(schema.projects.ownerId, ownerId)))
      .limit(1);
    return row?.job;
  }

  async listByProject(projectId: bigint): Promise<Job.Row[]> {
    return this.db.query.jobs.findMany({ where: eq(schema.jobs.projectId, projectId), orderBy: desc(schema.jobs.createdAt) });
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
