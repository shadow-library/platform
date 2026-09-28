import { describe, expect, it, mock } from 'bun:test';
import { PgDialect, QueryBuilder } from 'drizzle-orm/pg-core';

import { type Job } from '@server/database';

import { type WorkflowRunResult } from '@modules/ai/graphs/workflow-run.service';
import { JobExecutor } from '@modules/jobs/job.executor';
import { JobHandlerRegistry } from '@modules/jobs/job-handler.registry';
import { JobService } from '@modules/jobs/job.service';

import { FakeAuthoringClaims } from './authoring-claim-fixtures';

const dialect = new PgDialect();

type Built = { getSQL(): Parameters<PgDialect['sqlToQuery']>[0] } & Record<string, (...args: unknown[]) => Built>;

function selectingService() {
  const selects: string[] = [];
  const findFirsts: unknown[] = [];
  const db = {
    select: (fields: Parameters<QueryBuilder['select']>[0]) => {
      let query = new QueryBuilder().select(fields) as unknown as Built;
      const chain: unknown = new Proxy(
        {},
        {
          get: (_target, property: string) =>
            property === 'then'
              ? (resolve: (rows: unknown[]) => void) => {
                  selects.push(dialect.sqlToQuery(query.getSQL()).sql);
                  resolve([]);
                }
              : (...args: unknown[]) => {
                  query = (query[property] as (...a: unknown[]) => Built)(...args);
                  return chain;
                },
        },
      );
      return chain;
    },
    query: { jobs: { findFirst: async (options: unknown) => void findFirsts.push(options) } },
  };
  return { service: new JobService({ getPostgresClient: () => db } as never, {} as never, {} as never), selects, findFirsts };
}

describe('JobService reads a running job without its payload', () => {
  it('should read only the cancel flag when a running job is polled', async () => {
    const { service, findFirsts } = selectingService();

    await service.cancellation('job-1');

    expect(findFirsts).toHaveLength(1);
    expect((findFirsts[0] as { columns: unknown }).columns).toEqual({ cancelRequestedAt: true });
  });
});

describe('JobService summarises an import bundle in the database for a response', () => {
  const importSummary = /case when ("jobs"\.)?"kind" = 'import' then jsonb_build_object\(/;

  it('should list a project jobs with the import payload summarised by Postgres', async () => {
    const { service, selects } = selectingService();

    await service.listByProject(1n);

    expect(selects[0]).toMatch(importSummary);
    expect(selects[0]).not.toMatch(/, ("jobs"\.)?"payload", /);
  });

  it('should read a job by id with the import payload summarised by Postgres', async () => {
    const { service, selects } = selectingService();

    await service.getWithProject('job-1');

    expect(selects[0]).toMatch(importSummary);
  });
});

describe('JobExecutor polls cancellation without reloading the job', () => {
  it('should never reread the whole job row between chapters', async () => {
    const get = mock(async () => {
      throw new Error('the job row, payload included, was read again');
    });
    const jobService = { progress: async () => undefined, get, cancellation: async () => ({ cancelRequestedAt: null }) };
    const workflowRunService = { runChapterGeneration: async (): Promise<WorkflowRunResult> => ({ runId: 'r', outcome: 'accepted', status: 'completed' }) };
    const executor = new JobExecutor(
      jobService as never,
      new FakeAuthoringClaims().asService(),
      workflowRunService as never,
      {} as never,
      { getPostgresClient: () => ({}) } as never,
      {} as never,
      {} as never,
      new JobHandlerRegistry(),
    );
    const job = { id: 'job-1', projectId: 1n, kind: 'generate', target: 'batch', status: 'in_progress', payload: { chapters: [1, 2, 3] } } as unknown as Job.Row;

    await (executor as unknown as { runGenerate(job: Job.Row): Promise<void> }).runGenerate(job);

    expect(get).not.toHaveBeenCalled();
  });
});
