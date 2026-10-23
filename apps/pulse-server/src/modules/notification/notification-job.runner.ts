import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { Injectable, type OnApplicationReady, type OnApplicationStop } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { Notification, PrimaryDatabase, schema } from '@server/database';

import { NOTIFICATION_JOB_LEASE_MS, NotificationJobExecutor } from './notification-job.executor';

export interface JobAdmission {
  status: Extract<Notification.Status, 'PENDING' | 'PROCESSING'>;
  nextAttemptAt: Date;
}

interface ClaimedJobs {
  jobs: Notification.Job[];
  lease: Date;
}

const RECOVERY_INTERVAL_MS = 5_000;
const RECOVERY_BATCH_SIZE = 10;
/** Kubernetes' 30s termination grace also has to cover the preStop sleep and closing the HTTP server and pools after this drain. */
const DRAIN_TIMEOUT_MS = 15_000;
const CLAIMABLE_STATUSES = ['PENDING', 'PROCESSING', 'FAILED'] satisfies Notification.Status[];

/** Each executing job holds a lease (PROCESSING, next_attempt_at as expiry) taken at insert or by recovery's SKIP LOCKED claim; it must outlast the executor's run. */
@Injectable()
export class NotificationJobRunner implements OnApplicationReady, OnApplicationStop {
  private readonly logger = Logger.getLogger(APP_NAME, NotificationJobRunner.name);
  private readonly db: PrimaryDatabase;
  private readonly inflight = new Set<Promise<void>>();
  private readonly drainTimeoutMs = DRAIN_TIMEOUT_MS;
  private timer?: ReturnType<typeof setInterval>;
  private draining = false;
  private recovering = false;

  constructor(
    databaseService: DatabaseService,
    private readonly executor: NotificationJobExecutor,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  private leaseUntil(now = Date.now()): Date {
    return new Date(now + NOTIFICATION_JOB_LEASE_MS);
  }

  private track(work: Promise<void>): Promise<void> {
    const tracked: Promise<void> = work
      .catch(error => this.logger.error('Notification job work failed outside its own error handling', { error }))
      .finally(() => this.inflight.delete(tracked));
    this.inflight.add(tracked);
    return tracked;
  }

  /** A job admitted while draining is left due rather than started here, so another replica's recovery sends it instead of the shutdown cutting it off. */
  admit(): JobAdmission {
    if (this.draining) return { status: 'PENDING', nextAttemptAt: new Date() };
    return { status: 'PROCESSING', nextAttemptAt: this.leaseUntil() };
  }

  /** A job admitted before shutdown but started after it keeps its lease and is re-sent by recovery once that expires, rather than running into teardown. */
  start(notificationJob: Notification.Job, admission: JobAdmission): void {
    if (admission.status !== 'PROCESSING') return;
    if (this.draining) {
      this.logger.info(`Left a notification job for recovery as shutdown began - ${notificationJob.id}`, { jobId: notificationJob.id });
      return;
    }
    void this.track(this.executor.execute(notificationJob, admission.nextAttemptAt));
  }

  onApplicationReady(): void {
    this.timer = setInterval(() => void this.track(this.recover()), RECOVERY_INTERVAL_MS);
    this.logger.info('Notification job recovery started', { intervalMs: RECOVERY_INTERVAL_MS, leaseMs: NOTIFICATION_JOB_LEASE_MS });
  }

  async onApplicationStop(): Promise<void> {
    this.draining = true;
    clearInterval(this.timer);
    if (this.inflight.size === 0) return;

    this.logger.info('Draining in-flight notification jobs before shutdown', { inflight: this.inflight.size, timeoutMs: this.drainTimeoutMs });
    const deadline = Date.now() + this.drainTimeoutMs;
    while (this.inflight.size > 0 && Date.now() < deadline) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const elapsed = new Promise<void>(resolve => (timer = setTimeout(resolve, deadline - Date.now())));
      await Promise.race([Promise.allSettled([...this.inflight]), elapsed]);
      clearTimeout(timer);
    }

    if (this.inflight.size > 0)
      this.logger.warn('Abandoned in-flight notification jobs at the drain deadline; recovery re-sends them once their lease expires', { inflight: this.inflight.size });
    else this.logger.info('Drained in-flight notification jobs');
  }

  async recover(): Promise<void> {
    if (this.draining || this.recovering) return;
    this.recovering = true;
    try {
      const { jobs, lease } = await this.claimDueJobs();
      if (jobs.length === 0) return;
      this.logger.info('Claimed due notification jobs for recovery', { count: jobs.length, jobIds: jobs.map(job => job.id) });
      await Promise.allSettled(jobs.map(job => this.track(this.executor.execute(job, lease))));
    } catch (error) {
      this.logger.error('Notification job recovery failed', { error });
    } finally {
      this.recovering = false;
    }
  }

  /** `next_attempt_at` is app-written, so it meets an app-encoded instant; `created_at` is written by the database's `now()`, so it meets `now()`. */
  private claimStatement(now: number, lease: Date) {
    const jobs = schema.notificationJobs;
    const due = this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        or(
          and(inArray(jobs.status, CLAIMABLE_STATUSES), lte(jobs.nextAttemptAt, new Date(now))),
          // A PENDING row without a lease predates leases: leave it until a replica still running the old code would have finished it.
          and(eq(jobs.status, 'PENDING'), isNull(jobs.nextAttemptAt), lte(jobs.createdAt, sql`now() - make_interval(secs => ${NOTIFICATION_JOB_LEASE_MS / 1000})`)),
        ),
      )
      .orderBy(desc(jobs.priority), asc(jobs.nextAttemptAt))
      .limit(RECOVERY_BATCH_SIZE)
      .for('update', { skipLocked: true });

    return this.db.update(jobs).set({ status: 'PROCESSING', nextAttemptAt: lease }).where(inArray(jobs.id, due)).returning();
  }

  private async claimDueJobs(): Promise<ClaimedJobs> {
    const now = Date.now();
    const lease = this.leaseUntil(now);
    const jobs = await this.claimStatement(now, lease);
    return { jobs, lease };
  }
}
