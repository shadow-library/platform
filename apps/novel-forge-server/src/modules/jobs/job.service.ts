/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';
import { and, desc, eq, sql } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { type Job, type PrimaryDatabase, schema } from '@server/database';

/**
 * Defining types
 */

export interface JobProgress {
  done: number;
  total: number;
  current: string;
  phase: string;
}

/**
 * Declaring the constants
 */

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

  // Insert a new job row; if (projectId, kind, target) already exists, return the existing id.
  async enqueue(projectId: bigint, kind: Job.Kind, target: string, payload?: unknown): Promise<string> {
    const [inserted] = await this.db
      .insert(schema.jobs)
      .values({ projectId, kind, target, payload: payload as never })
      .onConflictDoNothing()
      .returning({ id: schema.jobs.id });

    if (inserted) return inserted.id;

    // Conflict — return the existing job's id.
    const existing = await this.db.query.jobs.findFirst({
      where: and(eq(schema.jobs.projectId, projectId), eq(schema.jobs.kind, kind), eq(schema.jobs.target, target)),
      columns: { id: true },
    });
    if (!existing) throw new Error(`enqueue: job not found after conflict on (${projectId}, ${kind}, ${target})`);
    return existing.id;
  }

  async start(jobId: string): Promise<void> {
    await this.db
      .update(schema.jobs)
      .set({ status: 'in_progress', attempts: sql`${schema.jobs.attempts} + 1`, updatedAt: new Date() })
      .where(eq(schema.jobs.id, jobId));
  }

  async progress(jobId: string, progress: JobProgress): Promise<void> {
    await this.db
      .update(schema.jobs)
      .set({ progress: progress as never, updatedAt: new Date() })
      .where(eq(schema.jobs.id, jobId));
  }

  async succeed(jobId: string): Promise<void> {
    await this.db.update(schema.jobs).set({ status: 'done', updatedAt: new Date() }).where(eq(schema.jobs.id, jobId));
  }

  async fail(jobId: string, error: string): Promise<void> {
    await this.db
      .update(schema.jobs)
      .set({ status: 'failed', lastError: error.slice(0, 2000), updatedAt: new Date() })
      .where(eq(schema.jobs.id, jobId));
  }

  async get(jobId: string): Promise<Job.Row | undefined> {
    return this.db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
  }

  async listByProject(projectId: bigint): Promise<Job.Row[]> {
    return this.db.query.jobs.findMany({ where: eq(schema.jobs.projectId, projectId), orderBy: desc(schema.jobs.createdAt) });
  }

  // On boot: reset all in-progress jobs back to pending so they can be re-dispatched.
  // In-progress rows indicate the server crashed mid-run; the job must be retried.
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
