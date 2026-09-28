import { describe, expect, it } from 'bun:test';

import { type Job } from '@server/database';

import { type WorkflowRunResult } from '@modules/ai/graphs/workflow-run.service';
import { AuthoringJobJanitor } from '@modules/jobs/authoring-job.janitor';
import { JobExecutor } from '@modules/jobs/job.executor';
import { JobHandlerRegistry } from '@modules/jobs/job-handler.registry';

import { FakeAuthoringClaims } from './authoring-claim-fixtures';

type ChapterRun = (input: { chapter: number; jobId: string }) => Promise<WorkflowRunResult>;

const ACCEPTED: WorkflowRunResult = { runId: 'run', outcome: 'accepted', status: 'completed' };

class FakeJobs {
  readonly rows = new Map<string, Job.Row>();

  add(id: string, overrides: Partial<Job.Row> = {}): void {
    const row = { id, projectId: 1n, kind: 'generate', target: id, status: 'pending', payload: { chapters: [1, 2] }, cancelRequestedAt: null, lastError: null };
    this.rows.set(id, { ...row, ...overrides } as Job.Row);
  }

  status(id: string): Pick<Job.Row, 'status' | 'lastError'> | undefined {
    const row = this.rows.get(id);
    return row && { status: row.status, lastError: row.lastError };
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
    row.status = 'in_progress';
    return true;
  }

  async progress(): Promise<void> {}

  async succeed(id: string): Promise<void> {
    this.settle(id, 'done');
  }

  async fail(id: string, error: string): Promise<void> {
    this.settle(id, 'failed', error);
  }

  async settleCancelled(id: string): Promise<void> {
    this.settle(id, 'cancelled');
  }

  private settle(id: string, status: Job.Status, lastError: string | null = null): void {
    const row = this.rows.get(id);
    if (row) Object.assign(row, { status, lastError });
  }
}

function worker(jobs: FakeJobs, claims: FakeAuthoringClaims, runChapter: ChapterRun = async () => ACCEPTED) {
  const chapters: number[] = [];
  const workflowRunService = {
    runChapterGeneration: async (input: { chapter: number; jobId: string }) => (chapters.push(input.chapter), runChapter(input)),
    cancel: () => undefined,
    settleJobRuns: async () => undefined,
  };
  const databaseService = { getPostgresClient: () => ({ select: () => ({ from: () => ({ where: async () => [] }) }) }) };
  const executor = new JobExecutor(
    jobs as never,
    claims.asService(),
    workflowRunService as never,
    {} as never,
    databaseService as never,
    {} as never,
    {} as never,
    new JobHandlerRegistry(),
  );
  return { executor, chapters };
}

describe('JobExecutor — authoring claim', () => {
  it('should run exactly one of two authoring jobs dispatched for the same project on two workers at once', async () => {
    const jobs = new FakeJobs();
    const claims = new FakeAuthoringClaims();
    jobs.add('job-a');
    jobs.add('job-b');
    const first = worker(jobs, claims);
    const second = worker(jobs, claims);

    await Promise.all([first.executor.dispatch('job-a'), second.executor.dispatch('job-b')]);

    const statuses = [jobs.status('job-a')?.status, jobs.status('job-b')?.status].sort();
    expect(statuses).toEqual(['done', 'failed']);
    expect([...first.chapters, ...second.chapters]).toEqual([1, 2]);
    expect(claims.rows.size).toBe(0);
  });

  it('should stop at the next chapter and never settle as done once a stale claim has been taken over', async () => {
    const jobs = new FakeJobs();
    const claims = new FakeAuthoringClaims();
    jobs.add('job-a');
    let successor: string | undefined;
    const { executor, chapters } = worker(jobs, claims, async () => {
      claims.expire(1n);
      successor = await claims.acquire(1n, 'job-b', 'generate');
      return ACCEPTED;
    });

    await executor.dispatch('job-a');

    expect(chapters).toEqual([1]);
    expect(jobs.status('job-a')).toEqual({ status: 'failed', lastError: expect.stringContaining('another job took over') });
    expect(successor).toBeDefined();
    expect(claims.rows.get(1n)).toMatchObject({ jobId: 'job-b', claimedBy: successor });
  });

  it('should leave the successor’s claim untouched when the old holder heartbeats, releases or settles with its token', async () => {
    const claims = new FakeAuthoringClaims();
    const stale = await claims.acquire(1n, 'job-a', 'generate');
    claims.expire(1n);
    const successor = await claims.acquire(1n, 'job-b', 'generate');
    let wrote = false;

    const outcomes = [
      await claims.heartbeat(1n, stale as string),
      await claims.release(1n, stale as string),
      await claims.settle(1n, stale as string, async () => void (wrote = true)),
    ];

    expect(outcomes).toEqual([false, false, false]);
    expect(wrote).toBe(false);
    expect(claims.rows.get(1n)?.claimedBy).toBe(successor);
  });

  it('should release the claim when a chapter fails', async () => {
    const jobs = new FakeJobs();
    const claims = new FakeAuthoringClaims();
    jobs.add('job-a');
    const { executor } = worker(jobs, claims, async () => ({ runId: 'run', outcome: 'failed', status: 'failed' }));

    await executor.dispatch('job-a');

    expect(jobs.status('job-a')?.status).toBe('failed');
    expect(claims.rows.size).toBe(0);
  });

  it('should release the claim when the author cancels mid-run', async () => {
    const jobs = new FakeJobs();
    const claims = new FakeAuthoringClaims();
    jobs.add('job-a');
    const { executor, chapters } = worker(jobs, claims, async ({ jobId }) => {
      Object.assign(jobs.rows.get(jobId) as Job.Row, { cancelRequestedAt: new Date() });
      return ACCEPTED;
    });

    await executor.dispatch('job-a');

    expect(chapters).toEqual([1]);
    expect(jobs.status('job-a')?.status).toBe('cancelled');
    expect(claims.rows.size).toBe(0);
  });

  it('should take over its own reservation and release it on success', async () => {
    const jobs = new FakeJobs();
    const claims = new FakeAuthoringClaims();
    jobs.add('job-a');
    await claims.reserve(undefined, 1n, 'job-a', 'generate');
    const { executor } = worker(jobs, claims);

    await executor.dispatch('job-a');

    expect(jobs.status('job-a')?.status).toBe('done');
    expect(claims.rows.size).toBe(0);
  });

  it('should keep a job recovered after a crash pending until its previous claim goes stale, then run it', async () => {
    const jobs = new FakeJobs();
    const claims = new FakeAuthoringClaims();
    jobs.add('job-a');
    await claims.acquire(1n, 'job-a', 'generate');
    const { executor, chapters } = worker(jobs, claims);

    await executor.dispatch('job-a');
    expect(jobs.status('job-a')?.status).toBe('pending');
    expect(chapters).toEqual([]);

    claims.expire(1n);
    await executor.dispatch('job-a');
    expect(jobs.status('job-a')?.status).toBe('done');
    expect(chapters).toEqual([1, 2]);
  });

  it('should run a job that writes no prose without touching the claim', async () => {
    const jobs = new FakeJobs();
    const claims = new FakeAuthoringClaims();
    jobs.add('job-a');
    await claims.acquire(1n, 'job-a', 'generate');
    jobs.add('job-index', { kind: 'backfill' });
    const workflowRunService = { cancel: () => undefined, settleJobRuns: async () => undefined };
    const indexing = { backfill: async () => undefined };
    const databaseService = { getPostgresClient: () => ({}) };
    const executor = new JobExecutor(
      jobs as never,
      claims.asService(),
      workflowRunService as never,
      indexing as never,
      databaseService as never,
      {} as never,
      {} as never,
      new JobHandlerRegistry(),
    );

    await executor.dispatch('job-index');

    expect(jobs.status('job-index')?.status).toBe('done');
    expect(claims.rows.get(1n)?.jobId).toBe('job-a');
  });

  it('should leave the row to a newer run of the same job when its own stale claim was re-taken for it', async () => {
    const jobs = new FakeJobs();
    const claims = new FakeAuthoringClaims();
    jobs.add('job-a');
    let rerun: string | undefined;
    const { executor, chapters } = worker(jobs, claims, async () => {
      claims.expire(1n);
      rerun = await claims.acquire(1n, 'job-a', 'generate');
      return ACCEPTED;
    });

    await executor.dispatch('job-a');

    expect(chapters).toEqual([1]);
    expect(jobs.status('job-a')?.status).toBe('in_progress');
    expect(claims.rows.get(1n)?.claimedBy).toBe(rerun);
  });
});

describe('AuthoringJobJanitor.sweep', () => {
  it('should reset authoring jobs whose claim went stale before re-dispatching every pending one nobody is handling', async () => {
    const calls: string[] = [];
    const jobService = {
      resetOrphanedAuthoring: async () => void calls.push('reset'),
      findUnclaimedPendingAuthoring: async () => (calls.push('find'), ['job-a', 'job-b']),
    };
    const executor = { dispatch: async (jobId: string) => void calls.push(`dispatch ${jobId}`) };
    const janitor = new AuthoringJobJanitor(jobService as never, executor as never, new FakeAuthoringClaims().asService());

    expect(await janitor.sweep()).toEqual(['job-a', 'job-b']);
    expect(calls).toEqual(['reset', 'find', 'dispatch job-a', 'dispatch job-b']);
  });
});
