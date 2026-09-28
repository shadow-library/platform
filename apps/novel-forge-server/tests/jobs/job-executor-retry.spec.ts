import { afterEach, describe, expect, it } from 'bun:test';
import { type AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { type Job } from '@server/database';

import { JobExecutor, retryAfter } from '@modules/jobs/job.executor';
import { JobHandlerRegistry } from '@modules/jobs/job-handler.registry';

import { FakeAuthoringClaims } from './authoring-claim-fixtures';

const TTL_MS = 120_000;

class FakeJobs {
  readonly rows = new Map<string, Job.Row>();
  readonly retries: { jobId: string; error: string; nextAttemptAt: Date }[] = [];
  readonly published: string[] = [];
  /** A cancel that lands after the executor last looked, just before its retry is written. */
  cancelBeforeRetry = false;

  add(id: string, overrides: Partial<Job.Row> = {}): void {
    const row = { id, projectId: 1n, kind: 'organise', target: id, status: 'pending', attempts: 0, payload: {}, cancelRequestedAt: null, lastError: null, nextAttemptAt: null };
    this.rows.set(id, { ...row, ...overrides } as Job.Row);
  }

  async get(id: string): Promise<Job.Row | undefined> {
    const row = this.rows.get(id);
    return row && { ...row };
  }

  async cancellation(id: string): Promise<Pick<Job.Row, 'cancelRequestedAt'> | undefined> {
    return this.get(id);
  }

  async start(id: string): Promise<boolean> {
    const row = this.rows.get(id);
    if (row?.status !== 'pending') return false;
    Object.assign(row, { status: 'in_progress', attempts: row.attempts + 1 });
    return true;
  }

  async progress(): Promise<void> {}

  async succeed(id: string): Promise<undefined> {
    return this.settle(id, { status: 'done' });
  }

  async fail(id: string, error: string): Promise<undefined> {
    return this.settle(id, { status: 'failed', lastError: error });
  }

  async settleCancelled(id: string): Promise<undefined> {
    return this.settle(id, { status: 'cancelled' });
  }

  async scheduleRetry(id: string, error: string, nextAttemptAt: Date): Promise<{ projectId: bigint; kind: Job.Kind; status: Job.Status; sessionId: null } | undefined> {
    if (this.cancelBeforeRetry) return undefined;
    this.retries.push({ jobId: id, error, nextAttemptAt });
    this.settle(id, { status: 'pending', lastError: error, nextAttemptAt });
    return { projectId: 1n, kind: 'organise', status: 'pending', sessionId: null };
  }

  publish(_id: string, transition: { status: Job.Status }): void {
    this.published.push(transition.status);
  }

  private settle(id: string, change: Partial<Job.Row>): undefined {
    Object.assign(this.rows.get(id) ?? {}, change);
    return undefined;
  }
}

const executors: JobExecutor[] = [];

function executorOver(jobs: FakeJobs, claims = new FakeAuthoringClaims()) {
  const settled: unknown[][] = [];
  const workflowRunService = { cancel: () => undefined, forgetJobRuns: () => undefined, settleJobRuns: async (...args: unknown[]) => void settled.push(args) };
  const db = { select: () => ({ from: () => ({ where: async () => [] }) }) };
  const jobHandlers = new JobHandlerRegistry();
  const executor = new JobExecutor(
    jobs as never,
    claims.asService(),
    workflowRunService as never,
    {} as never,
    { getPostgresClient: () => db } as never,
    {} as never,
    {} as never,
    jobHandlers,
  );
  executors.push(executor);
  return { executor, claims, settled, jobHandlers };
}

afterEach(() => {
  for (const executor of executors.splice(0)) executor.onModuleDestroy();
});

const timeout = (): AppError => AppErrorCode.AI_007.create({ transient: true });
const refused = (): AppError => AppErrorCode.AI_007.create({ transient: false });

describe('retryAfter', () => {
  it('should retry an organise or plan job once after a transient model failure, with backoff', () => {
    const now = 1_000;

    expect(retryAfter({ kind: 'organise', attempts: 0 }, timeout(), TTL_MS, now)?.getTime()).toBe(now + 30_000);
    expect(retryAfter({ kind: 'plan', attempts: 0 }, timeout(), TTL_MS, now)?.getTime()).toBe(now + 30_000);
  });

  it('should wait no longer than half the claim TTL, so the reservation holding the novel is still live when the retry is due', () => {
    expect(retryAfter({ kind: 'organise', attempts: 0 }, timeout(), 20_000, 0)?.getTime()).toBe(10_000);
  });

  it('should not retry a job past its last attempt, another kind, a refusal the request caused, or any other failure', () => {
    expect(retryAfter({ kind: 'organise', attempts: 1 }, timeout(), TTL_MS)).toBeUndefined();
    expect(retryAfter({ kind: 'generate', attempts: 0 }, timeout(), TTL_MS)).toBeUndefined();
    expect(retryAfter({ kind: 'organise', attempts: 0 }, refused(), TTL_MS)).toBeUndefined();
    expect(retryAfter({ kind: 'organise', attempts: 0 }, AppErrorCode.NTS_003.create({ words: '600' }), TTL_MS)).toBeUndefined();
    expect(retryAfter({ kind: 'organise', attempts: 0 }, new Error('LLM call exceeded 300000ms timeout budget'), TTL_MS)).toBeUndefined();
  });
});

describe('JobExecutor — retry on timeout', () => {
  it('should put a timed-out organise job back in the queue, holding the novel for it, and publish that once settled', async () => {
    const jobs = new FakeJobs();
    jobs.add('job-o');
    const { executor, claims, settled, jobHandlers } = executorOver(jobs);
    jobHandlers.register('organise', async () => {
      throw timeout();
    });

    await executor.dispatch('job-o');

    expect(jobs.rows.get('job-o')).toMatchObject({ status: 'pending', attempts: 1 });
    expect(jobs.retries.map(retry => retry.jobId)).toEqual(['job-o']);
    expect(jobs.published).toEqual(['pending']);
    expect(claims.rows.get(1n)).toMatchObject({ jobId: 'job-o', claimedBy: null });
    expect(settled.map(([, status]) => status)).toEqual(['failed']);
  });

  it('should settle a job as cancelled, not retry it, when its cancel lands as the retry is written', async () => {
    const jobs = new FakeJobs();
    jobs.add('job-o');
    jobs.cancelBeforeRetry = true;
    const { executor, claims, settled, jobHandlers } = executorOver(jobs);
    jobHandlers.register('organise', async () => {
      throw timeout();
    });

    await executor.dispatch('job-o');

    expect(jobs.rows.get('job-o')?.status).toBe('cancelled');
    expect(jobs.retries).toEqual([]);
    expect(claims.rows.size).toBe(0);
    expect(settled.map(([, status]) => status)).toEqual(['cancelled']);
  });

  it('should fail the job when its retry times out too, or when the model refused the request', async () => {
    const jobs = new FakeJobs();
    jobs.add('job-o', { attempts: 1 });
    jobs.add('job-p', { projectId: 2n });
    const { executor, claims, jobHandlers } = executorOver(jobs);
    jobHandlers.register('organise', async job => {
      throw job.id === 'job-o' ? timeout() : refused();
    });

    await executor.dispatch('job-o');
    await executor.dispatch('job-p');

    expect(jobs.rows.get('job-o')).toMatchObject({ status: 'failed' });
    expect(jobs.rows.get('job-p')).toMatchObject({ status: 'failed' });
    expect(jobs.retries).toEqual([]);
    expect(claims.rows.size).toBe(0);
  });

  it('should not start a job before its retry is due', async () => {
    const jobs = new FakeJobs();
    jobs.add('job-o', { attempts: 1, nextAttemptAt: new Date(Date.now() + 60_000) });
    const { executor, jobHandlers } = executorOver(jobs);
    const handled: string[] = [];
    jobHandlers.register('organise', async job => void handled.push(job.id));

    await executor.dispatch('job-o');

    expect(handled).toEqual([]);
    expect(jobs.rows.get('job-o')?.status).toBe('pending');
  });
});
