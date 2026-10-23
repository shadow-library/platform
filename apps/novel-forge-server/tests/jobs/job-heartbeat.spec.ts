import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { type Job } from '@server/database';

import { RUN_HEARTBEAT_MS } from '@modules/ai/graphs/run-liveness';
import { JobExecutor } from '@modules/jobs/job.executor';
import { type JobAttempt, type TransitionedJob } from '@modules/jobs/job.service';
import { JobHandlerRegistry } from '@modules/jobs/job-handler.registry';

import { FakeAuthoringClaims } from './authoring-claim-fixtures';

interface FakeTimer {
  delayMs: number;
  tick: () => void;
  unref: () => FakeTimer;
}

class FakeJobs {
  readonly rows = new Map<string, Job.Row>();
  readonly heartbeats: JobAttempt[] = [];
  heartbeatFails = false;

  add(id: string): void {
    const row = { id, projectId: 1n, kind: 'review', target: id, status: 'pending', attempts: 0, payload: {}, cancelRequestedAt: null, lastError: null, nextAttemptAt: null };
    this.rows.set(id, row as unknown as Job.Row);
  }

  row(id: string): Job.Row | undefined {
    return this.rows.get(id);
  }

  supersede(id: string): void {
    const row = this.rows.get(id);
    if (row) Object.assign(row, { status: 'in_progress', attempts: row.attempts + 1 });
  }

  async get(id: string): Promise<Job.Row | undefined> {
    const row = this.rows.get(id);
    return row && { ...row };
  }

  async cancellation(id: string): Promise<Pick<Job.Row, 'cancelRequestedAt'> | undefined> {
    return this.get(id);
  }

  async start(id: string): Promise<number | undefined> {
    const row = this.rows.get(id);
    if (row?.status !== 'pending') return undefined;
    Object.assign(row, { status: 'in_progress', attempts: row.attempts + 1 });
    return row.attempts;
  }

  async heartbeat(attempt: JobAttempt): Promise<boolean> {
    if (this.heartbeatFails) throw new Error('connection reset');
    this.heartbeats.push(attempt);
    return this.holds(attempt);
  }

  async succeed(attempt: JobAttempt): Promise<TransitionedJob | undefined> {
    return this.settle(attempt, 'done');
  }

  async fail(attempt: JobAttempt): Promise<TransitionedJob | undefined> {
    return this.settle(attempt, 'failed');
  }

  async settleCancelled(attempt: JobAttempt): Promise<TransitionedJob | undefined> {
    return this.settle(attempt, 'cancelled');
  }

  private holds(attempt: JobAttempt): boolean {
    const row = this.rows.get(attempt.id);
    return row?.status === 'in_progress' && row.attempts === attempt.attempts;
  }

  private settle(attempt: JobAttempt, status: Job.Status): TransitionedJob | undefined {
    const row = this.rows.get(attempt.id);
    if (!row || !this.holds(attempt)) return undefined;
    row.status = status;
    return { projectId: row.projectId, kind: row.kind, status, sessionId: null };
  }
}

describe('JobExecutor — job heartbeat and attempt fencing', () => {
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  const timers = { started: [] as FakeTimer[], cleared: [] as unknown[] };

  beforeEach(() => {
    timers.started = [];
    timers.cleared = [];
    globalThis.setInterval = ((tick: () => void, delayMs: number): FakeTimer => {
      const timer: FakeTimer = { delayMs, tick, unref: () => timer };
      timers.started.push(timer);
      return timer;
    }) as never;
    globalThis.clearInterval = ((timer: unknown) => void timers.cleared.push(timer)) as never;
  });

  afterEach(() => {
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
  });

  function executorOver(jobs: FakeJobs, handler: (job: Job.Row) => Promise<void>) {
    const settledRuns: unknown[][] = [];
    const abortedRuns: string[] = [];
    const workflowRunService = {
      cancel: () => undefined,
      cancelJobRuns: (jobId: string) => void abortedRuns.push(jobId),
      forgetJobRuns: () => undefined,
      settleJobRuns: async (...args: unknown[]) => void settledRuns.push(args),
    };
    const db = { select: () => ({ from: () => ({ where: async () => [] }) }) };
    const jobHandlers = new JobHandlerRegistry();
    jobHandlers.register('review', handler);
    const claims = new FakeAuthoringClaims().asService();
    const executor = new JobExecutor(
      jobs as never,
      claims,
      workflowRunService as never,
      {} as never,
      { getPostgresClient: () => db } as never,
      {} as never,
      {} as never,
      jobHandlers,
    );
    const warn = spyOn((executor as unknown as { logger: { warn: (...args: unknown[]) => void } }).logger, 'warn').mockImplementation(() => undefined);
    return { executor, settledRuns, abortedRuns, warn };
  }

  const heartbeatTimer = (): FakeTimer | undefined => timers.started.find(timer => timer.delayMs === RUN_HEARTBEAT_MS);
  const flush = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

  it('should heartbeat the attempt it started and stop once the job succeeds', async () => {
    const jobs = new FakeJobs();
    jobs.add('job-1');
    const { executor } = executorOver(jobs, async () => heartbeatTimer()?.tick());

    await executor.dispatch('job-1');

    expect(jobs.heartbeats).toEqual([expect.objectContaining({ id: 'job-1', attempts: 1 })]);
    expect(jobs.row('job-1')?.status).toBe('done');
    expect(timers.cleared).toContain(heartbeatTimer());
  });

  it('should stop heartbeating once the job fails', async () => {
    const jobs = new FakeJobs();
    jobs.add('job-1');
    const { executor } = executorOver(jobs, async () => Promise.reject(new Error('model down')));

    await executor.dispatch('job-1');

    expect(jobs.row('job-1')?.status).toBe('failed');
    expect(timers.cleared).toContain(heartbeatTimer());
  });

  it('should stop heartbeating once the job is cancelled', async () => {
    const jobs = new FakeJobs();
    jobs.add('job-1');
    const { executor } = executorOver(jobs, async job => void Object.assign(jobs.rows.get(job.id) ?? {}, { cancelRequestedAt: new Date() }));

    await executor.dispatch('job-1');

    expect(jobs.row('job-1')?.status).toBe('cancelled');
    expect(timers.cleared).toContain(heartbeatTimer());
  });

  it('should keep running a job whose heartbeat write fails', async () => {
    const jobs = new FakeJobs();
    jobs.add('job-1');
    jobs.heartbeatFails = true;
    const { executor, warn } = executorOver(jobs, async () => {
      heartbeatTimer()?.tick();
      await flush();
    });

    await executor.dispatch('job-1');

    expect(jobs.row('job-1')?.status).toBe('done');
    expect(warn.mock.calls.map(([message]) => message)).toContain('job heartbeat failed');
  });

  it('should stop heartbeating a job still running when the application stops', async () => {
    const jobs = new FakeJobs();
    jobs.add('job-1');
    let finish = (): void => undefined;
    const { executor } = executorOver(jobs, () => new Promise<void>(resolve => (finish = resolve)));

    const running = executor.dispatch('job-1');
    await flush();
    executor.onModuleDestroy();

    expect(jobs.row('job-1')?.status).toBe('in_progress');
    expect(timers.cleared).toContain(heartbeatTimer());
    finish();
    await running;
  });

  it('should name the jobs it is running, so its own janitor never resets them', async () => {
    const jobs = new FakeJobs();
    jobs.add('job-1');
    let finish = (): void => undefined;
    const { executor } = executorOver(jobs, () => new Promise<void>(resolve => (finish = resolve)));

    const running = executor.dispatch('job-1');
    await flush();

    expect(executor.runningJobIds()).toEqual(['job-1']);
    finish();
    await running;
    expect(executor.runningJobIds()).toEqual([]);
  });

  it('should not start a newer attempt of a job on the replica still running an earlier one', async () => {
    const jobs = new FakeJobs();
    jobs.add('job-1');
    let finish = (): void => undefined;
    let runs = 0;
    const { executor, warn } = executorOver(jobs, () => (runs++, new Promise<void>(resolve => (finish = resolve))));

    const running = executor.dispatch('job-1');
    await flush();
    Object.assign(jobs.rows.get('job-1') ?? {}, { status: 'pending' });
    await executor.dispatch('job-1');

    expect(runs).toBe(1);
    expect(jobs.row('job-1')?.status).toBe('pending');
    expect(warn.mock.calls.map(([message]) => message)).toContain('dispatch: this replica is still running an earlier attempt of the job');
    finish();
    await running;
  });

  it('should stop heartbeating and abort its own runs once a newer attempt holds the row', async () => {
    const jobs = new FakeJobs();
    jobs.add('job-1');
    let stoppedWhileRunning = false;
    const { executor, abortedRuns, warn } = executorOver(jobs, async job => {
      jobs.supersede(job.id);
      heartbeatTimer()?.tick();
      await flush();
      stoppedWhileRunning = timers.cleared.includes(heartbeatTimer());
    });

    await executor.dispatch('job-1');

    expect(stoppedWhileRunning).toBe(true);
    expect(abortedRuns).toEqual(['job-1']);
    expect(warn.mock.calls.map(([message]) => message)).toContain('Job attempt was superseded by a newer one; stopping its runs');
  });

  it('should leave the row and the job runs to the newer attempt when a superseded run succeeds or fails', async () => {
    for (const handler of [async () => undefined, async () => Promise.reject(new Error('model down'))]) {
      const jobs = new FakeJobs();
      jobs.add('job-1');
      const { executor, settledRuns, warn } = executorOver(jobs, async job => {
        jobs.supersede(job.id);
        await handler();
      });

      await executor.dispatch('job-1');

      expect(jobs.row('job-1')).toMatchObject({ status: 'in_progress', attempts: 2 });
      expect(settledRuns).toEqual([]);
      expect(warn.mock.calls.map(([message]) => message)).toContain('Job attempt was superseded or its row is gone; leaving the row as it is');
    }
  });
});
