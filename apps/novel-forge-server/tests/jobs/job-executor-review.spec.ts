import { describe, expect, it, mock } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { WorkflowRunService } from '@modules/ai/graphs/workflow-run.service';
import { JobExecutor } from '@modules/jobs/job.executor';
import { JobService } from '@modules/jobs/job.service';
import { schema } from '@server/database';

import { FakeAuthoringClaims } from './authoring-claim-fixtures';

const dialect = new PgDialect();

function reviewJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-r',
    projectId: 1n,
    kind: 'review',
    target: 'chapter-4-judge',
    status: 'pending',
    attempts: 0,
    payload: { chapter: 4, kind: 'judge' },
    cancelRequestedAt: null,
    ...overrides,
  };
}

function executorOver(job: ReturnType<typeof reviewJob>) {
  const jobService = {
    findPending: async () => [job],
    get: async () => job,
    start: mock(async () => true),
    progress: async () => undefined,
    succeed: mock(async () => undefined),
    fail: mock(async () => undefined),
    settleCancelled: mock(async () => undefined),
  };
  const settled: unknown[][] = [];
  const workflowRunService = { cancel: () => undefined, settleJobRuns: async (...args: unknown[]) => void settled.push(args) };
  const db = { select: () => ({ from: () => ({ where: async () => [] }) }) };
  const executor = new JobExecutor(
    jobService as never,
    new FakeAuthoringClaims().asService(),
    workflowRunService as never,
    {} as never,
    { getPostgresClient: () => db } as never,
    {} as never,
    {} as never,
  );
  return { executor, jobService, settled };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('JobExecutor — a job kind another module handles', () => {
  it('should dispatch a review job left pending at boot to the handler registered during module init', async () => {
    const { executor, jobService } = executorOver(reviewJob());
    const handled: string[] = [];
    executor.registerHandler('review', async job => void handled.push(job.id));

    await executor.onApplicationReady();
    await settle();

    expect(handled).toEqual(['job-r']);
    expect(jobService.succeed).toHaveBeenCalled();
  });

  it('should leave a job pending, not failed, when no handler is registered for its kind', async () => {
    const { executor, jobService } = executorOver(reviewJob());

    await executor.dispatch('job-r');

    expect(jobService.start).not.toHaveBeenCalled();
    expect(jobService.fail).not.toHaveBeenCalled();
  });

  it('should fail the run a job opened when the job fails before reaching it', async () => {
    const { executor, jobService, settled } = executorOver(reviewJob());
    const refusal = new Error('Chapter 4 has no prose to review yet');
    executor.registerHandler('review', async () => {
      throw refusal;
    });

    await executor.dispatch('job-r');

    expect(jobService.fail).toHaveBeenCalled();
    expect(settled).toEqual([['job-r', 'failed', refusal]]);
  });

  it('should cancel the run a job opened when the job is cancelled before it starts', async () => {
    const { executor, jobService, settled } = executorOver(reviewJob({ cancelRequestedAt: new Date() }));
    executor.registerHandler('review', async () => undefined);

    await executor.dispatch('job-r');

    expect(jobService.settleCancelled).toHaveBeenCalled();
    expect(settled).toEqual([['job-r', 'cancelled', undefined]]);
  });
});

describe('JobService.cancel — runs opened for a pending job', () => {
  it('should cancel every run still running under a job cancelled before dispatch', async () => {
    const updates: { table: unknown; values: unknown; where: SQL }[] = [];
    const db = {
      update: (table: unknown) => ({
        set: (values: unknown) => ({
          where: (where: SQL) => {
            updates.push({ table, values, where });
            return Object.assign(Promise.resolve(undefined), { returning: async () => [{ projectId: 1n, kind: 'review', status: 'cancelled' }] });
          },
        }),
      }),
      transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
    };
    const service = new JobService({ getPostgresClient: () => db } as never, { publish: () => undefined } as never, new FakeAuthoringClaims().asService());

    await service.cancel('job-r', 1n);

    const runs = updates.find(update => update.table === schema.workflowRuns);
    expect(runs?.values).toMatchObject({ status: 'cancelled' });
    expect(dialect.sqlToQuery(runs?.where as SQL)).toMatchObject({ sql: '("workflow_runs"."job_id" = $1 and "workflow_runs"."status" = $2)', params: ['job-r', 'running'] });
  });
});

describe('WorkflowRunService.settleJobRuns', () => {
  it('should settle every run the job left running, so none stays running', async () => {
    const written: { values: Record<string, unknown>; where: SQL }[] = [];
    const db = {
      select: () => ({ from: () => ({ where: async () => [{ id: 'run-a' }, { id: 'run-b' }] }) }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: (where: SQL) => ({ returning: async () => (written.push({ values, where }), [{ projectId: 1n, graph: 'chapter-review', target: 'chapter-4' }]) }),
        }),
      }),
    };
    const service = new WorkflowRunService(
      { getPostgresClient: () => db } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        publish: () => undefined,
      } as never,
    );

    await service.settleJobRuns('job-r', 'failed', new Error('refused'));

    expect(written.map(write => write.values['status'])).toEqual(['failed', 'failed']);
    expect(written.map(write => dialect.sqlToQuery(write.where).params)).toEqual([
      ['run-a', 'running'],
      ['run-b', 'running'],
    ]);
  });
});
