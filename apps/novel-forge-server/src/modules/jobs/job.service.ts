import { and, desc, eq, inArray, not, type SQL, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { AUTHORING_JOB_KINDS, isAuthoringJob, jobHoldsLiveClaim, ownedBy, type OwnerRef } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type DbExecutor, type Job, type PrimaryDatabase, type Project, schema } from '@server/database';

import { scopedCostTier } from '../ai/cost-tier-scope';
import { isCostTier } from '../ai/defaults';
import { type CallUsageTotals, emptyCallUsageTotals, type GroupedUsageRow, summarizeGroupedCallUsage } from '../ai/usage/call-usage';
import { ProjectEventService } from '../events/project-event.service';
import { AuthoringClaimService } from './authoring-claim.service';

export interface JobProgress {
  done: number;
  total: number;
  current: string;
  phase: string;
  skipped?: number[];
  /** When work on `current` began, so a client can time the chapter without inferring it from the row's `updatedAt`. */
  startedAt?: string;
}

interface EnqueuedJob {
  id: string;
  outcome: 'inserted' | 'reset' | 'deduped';
}

export interface JobCancelResult {
  status: Job.Status;
  outcome: 'cancelled' | 'stopping' | 'already_settled';
}

// Bounds the `IN (...)` list `usageForJobs` builds — a defensive cap independent of how many ids a caller
// passes, since `listByProject` names every job for a project with no limit of its own.
const MAX_USAGE_JOB_IDS = 200;

// A job outlives the request that enqueued it, so the tier a chat turn's action runs at travels on the payload; JobExecutor restores it.
function withScopedCostTier(payload: unknown): unknown {
  const costTier = scopedCostTier();
  if (!costTier) return payload;
  if (payload === undefined || payload === null) return { costTier };
  if (typeof payload !== 'object' || Array.isArray(payload)) return payload;
  return { ...payload, costTier };
}

export function payloadCostTier(payload: unknown): Project.CostTier | undefined {
  const costTier = (payload as { costTier?: unknown } | null)?.costTier;
  return isCostTier(costTier) ? costTier : undefined;
}

@Injectable()
export class JobService {
  private readonly logger = Logger.getLogger(APP_NAME, JobService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly events: ProjectEventService,
    private readonly claims: AuthoringClaimService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async onModuleInit(): Promise<void> {
    await this.recoverStuck();
  }

  // Insert a new job row for (projectId, kind, target). Deduplication only applies to *active* work:
  // if a pending/in_progress job already exists we return it unchanged, but a previously terminal job
  // (done/failed) is reset to pending with the new payload so re-posting genuinely re-runs the work.
  // An authoring job reserves the project's claim in the same transaction, so a second is refused (JOB_002) and rolled back.
  async enqueue(projectId: bigint, kind: Job.Kind, target: string, jobPayload?: unknown): Promise<string> {
    const payload = withScopedCostTier(jobPayload);
    this.logger.debug('enqueue', { projectId, kind, target, payload });
    const enqueued = isAuthoringJob(kind)
      ? await this.db.transaction(async tx => {
          const job = await this.upsertJob(tx, projectId, kind, target, payload);
          if (job.outcome !== 'deduped' && !(await this.claims.reserve(tx, projectId, job.id, kind))) throw AppErrorCode.JOB_002.create();
          return job;
        })
      : await this.upsertJob(this.db, projectId, kind, target, payload);
    if (enqueued.outcome !== 'deduped') this.announce(enqueued.id, { projectId, kind, status: 'pending' });
    return enqueued.id;
  }

  private async upsertJob(db: DbExecutor, projectId: bigint, kind: Job.Kind, target: string, payload: unknown): Promise<EnqueuedJob> {
    const [inserted] = await db
      .insert(schema.jobs)
      .values({ projectId, kind, target, payload: payload as never })
      .onConflictDoNothing()
      .returning({ id: schema.jobs.id });

    if (inserted) {
      this.logger.info('Job enqueued', { jobId: inserted.id, projectId, kind, target });
      return { id: inserted.id, outcome: 'inserted' };
    }

    const existing = await db.query.jobs.findFirst({
      where: and(eq(schema.jobs.projectId, projectId), eq(schema.jobs.kind, kind), eq(schema.jobs.target, target)),
      columns: { id: true, status: true },
    });
    if (!existing) throw AppError.internal(`enqueue: job not found after conflict on (${projectId}, ${kind}, ${target})`);

    if (existing.status === 'pending' || existing.status === 'in_progress') {
      this.logger.debug('enqueue: deduped onto active job', { jobId: existing.id, kind, target, status: existing.status });
      return { id: existing.id, outcome: 'deduped' };
    }

    this.logger.info('Job re-enqueued (terminal job reset to pending)', { jobId: existing.id, kind, target, previousStatus: existing.status });
    await db
      .update(schema.jobs)
      .set({ status: 'pending', attempts: 0, lastError: null, progress: null, payload: payload as never, nextAttemptAt: null, cancelRequestedAt: null, updatedAt: new Date() })
      .where(eq(schema.jobs.id, existing.id));
    return { id: existing.id, outcome: 'reset' };
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

  async succeed(jobId: string, db: DbExecutor = this.db): Promise<void> {
    this.logger.debug('marking job done', { jobId });
    const [job] = await db
      .update(schema.jobs)
      .set({ status: 'done', updatedAt: new Date() })
      .where(eq(schema.jobs.id, jobId))
      .returning({ projectId: schema.jobs.projectId, kind: schema.jobs.kind, status: schema.jobs.status });
    if (job) this.announce(jobId, job);
  }

  async fail(jobId: string, error: string, db: DbExecutor = this.db): Promise<void> {
    this.logger.warn('marking job failed', { jobId, error: error.slice(0, 2000) });
    const [job] = await db
      .update(schema.jobs)
      .set({ status: 'failed', lastError: error.slice(0, 2000), updatedAt: new Date() })
      .where(eq(schema.jobs.id, jobId))
      .returning({ projectId: schema.jobs.projectId, kind: schema.jobs.kind, status: schema.jobs.status });
    if (job) this.announce(jobId, job);
  }

  // The terminal write for a job the executor stopped: `cancel()` deliberately leaves an in_progress
  // job's status alone, so this is the only path that converts the request into a settled row.
  async settleCancelled(jobId: string, db: DbExecutor = this.db): Promise<void> {
    this.logger.info('marking job cancelled', { jobId });
    const [job] = await db
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
  // An `in_progress` job only gets `cancelRequestedAt`: the worker calls `succeed()`/`fail()` when
  // `runJob` returns and would overwrite a status written underneath it, so this never touches `status`.
  async cancel(jobId: string, projectId: bigint): Promise<JobCancelResult | undefined> {
    const [cancelledPending] = await this.db
      .update(schema.jobs)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.projectId, projectId), eq(schema.jobs.status, 'pending')))
      .returning({ projectId: schema.jobs.projectId, kind: schema.jobs.kind, status: schema.jobs.status });
    if (cancelledPending) {
      this.logger.info('job cancelled before dispatch', { jobId });
      if (isAuthoringJob(cancelledPending.kind)) await this.claims.releaseReservation(jobId);
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

  // A job named by a live, started claim is still running on some replica, so boot recovery leaves it alone; the janitor resets it once stale.
  async recoverStuck(): Promise<void> {
    const reset = await this.resetOrphaned(and(eq(schema.jobs.status, 'in_progress'), not(jobHoldsLiveClaim(this.claims.ttlMs, true))));
    if (reset.length > 0) this.logger.warn(`Crash recovery: reset ${reset.length} in-progress job(s) back to pending`, { jobs: reset });
  }

  async resetOrphanedAuthoring(): Promise<void> {
    const where = and(eq(schema.jobs.status, 'in_progress'), inArray(schema.jobs.kind, AUTHORING_JOB_KINDS), not(jobHoldsLiveClaim(this.claims.ttlMs, true)));
    const reset = await this.resetOrphaned(where);
    if (reset.length > 0) this.logger.warn(`Reset ${reset.length} authoring job(s) whose claim went stale back to pending`, { jobs: reset });
  }

  /** Pending authoring jobs no live claim or reservation names: nobody is dispatching them. */
  async findUnclaimedPendingAuthoring(): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.status, 'pending'), inArray(schema.jobs.kind, AUTHORING_JOB_KINDS), not(jobHoldsLiveClaim(this.claims.ttlMs, false))));
    return rows.map(row => row.id);
  }

  private async resetOrphaned(where: SQL | undefined): Promise<{ id: string; kind: Job.Kind; target: string }[]> {
    return this.db
      .update(schema.jobs)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(where)
      .returning({ id: schema.jobs.id, kind: schema.jobs.kind, target: schema.jobs.target });
  }

  /** Cost/token totals per job id across every run it drove (`workflow_runs.job_id`) — zeroed, never absent, for a job with no model calls. */
  async usageForJobs(jobIds: readonly string[]): Promise<Map<string, CallUsageTotals>> {
    const ids = jobIds.slice(0, MAX_USAGE_JOB_IDS);
    const result = new Map<string, CallUsageTotals>(ids.map(id => [id, emptyCallUsageTotals()]));
    if (ids.length === 0) return result;

    const calls = schema.modelCalls;
    const runs = schema.workflowRuns;
    const rows = await this.db
      .select({
        jobId: runs.jobId,
        model: calls.model,
        status: calls.status,
        costSource: calls.costSource,
        calls: sql<number>`count(*)::int`,
        inputTokens: sql<number>`coalesce(sum(${calls.inputTokens}), 0)::bigint`.mapWith(Number),
        cachedInputTokens: sql<number>`coalesce(sum(${calls.cachedInputTokens}), 0)::bigint`.mapWith(Number),
        outputTokens: sql<number>`coalesce(sum(${calls.outputTokens}), 0)::bigint`.mapWith(Number),
        latencyMs: sql<number>`coalesce(sum(${calls.latencyMs}), 0)::bigint`.mapWith(Number),
        recordedCostUsd: sql<number>`coalesce(sum(${calls.costUsd}) filter (where ${calls.costUsd} is not null), 0)`.mapWith(Number),
        unpricedInputTokens: sql<number>`coalesce(sum(${calls.inputTokens}) filter (where ${calls.costUsd} is null), 0)::bigint`.mapWith(Number),
        unpricedOutputTokens: sql<number>`coalesce(sum(${calls.outputTokens}) filter (where ${calls.costUsd} is null), 0)::bigint`.mapWith(Number),
      })
      .from(calls)
      .innerJoin(runs, eq(runs.id, calls.runId))
      .where(inArray(runs.jobId, ids as string[]))
      .groupBy(runs.jobId, calls.model, calls.status, calls.costSource);

    const rowsByJob = new Map<string, GroupedUsageRow[]>();
    for (const row of rows) {
      if (!row.jobId) continue;
      const list = rowsByJob.get(row.jobId) ?? [];
      list.push(row);
      rowsByJob.set(row.jobId, list);
    }
    for (const jobId of ids) result.set(jobId, summarizeGroupedCallUsage(rowsByJob.get(jobId) ?? []));
    return result;
  }
}
