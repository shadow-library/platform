import { describe, expect, it, mock } from 'bun:test';

import type { Job } from '@server/database';

import type { JobProgress } from '@modules/jobs/job.service';
import { JobExecutor } from '@modules/jobs/job.executor';
import type { WorkflowRunResult } from '@modules/ai/graphs/workflow-run.service';

function makeExecutor(runChapterGeneration: (input: unknown) => Promise<WorkflowRunResult>) {
  const progressCalls: [string, JobProgress][] = [];
  const progress = mock(async (jobId: string, snapshot: JobProgress) => {
    progressCalls.push([jobId, snapshot]);
  });
  const jobService = { progress } as never;
  const concurrency = {} as never;
  const runChapterGenerationMock = mock(runChapterGeneration);
  const workflowRunService = { runChapterGeneration: runChapterGenerationMock } as never;
  const indexingService = {} as never;
  const databaseService = { getPostgresClient: () => ({}) } as never;
  const rebrandService = {} as never;
  const recombineService = {} as never;
  const publishRunner = {} as never;
  const storage = {} as never;

  const executor = new JobExecutor(jobService, concurrency, workflowRunService, indexingService, databaseService, rebrandService, recombineService, publishRunner, storage);
  return { executor, progressCalls, runChapterGeneration: runChapterGenerationMock };
}

function makeJob(chapters: number[]): Job.Row {
  return {
    id: 'job-1',
    projectId: 1n,
    kind: 'generate',
    target: 'batch',
    status: 'in_progress',
    attempts: 1,
    lastError: null,
    payload: { chapters },
    progress: null,
  } as unknown as Job.Row;
}

describe('JobExecutor.runGenerate — batch adjacency halt', () => {
  it('drafts every requested chapter when each one comes back a clean accept', async () => {
    const { executor, runChapterGeneration } = makeExecutor(async () => ({ runId: 'r', outcome: 'accepted', status: 'completed' }));
    const job = makeJob([5, 6, 7]);

    await (executor as unknown as { runGenerate(job: Job.Row): Promise<void> }).runGenerate(job);

    expect(runChapterGeneration).toHaveBeenCalledTimes(3);
  });

  it('halts the batch and skips the remaining chapters when a chapter is accepted with findings', async () => {
    const { executor, progressCalls, runChapterGeneration } = makeExecutor(async input => {
      const { chapter } = input as { chapter: number };
      return chapter === 6 ? { runId: 'r6', outcome: 'accepted_with_findings', status: 'completed' } : { runId: `r${chapter}`, outcome: 'accepted', status: 'completed' };
    });
    const job = makeJob([5, 6, 7, 8]);

    await (executor as unknown as { runGenerate(job: Job.Row): Promise<void> }).runGenerate(job);

    expect(runChapterGeneration).toHaveBeenCalledTimes(2);

    const lastCall = progressCalls.at(-1);
    expect(lastCall?.[1]).toMatchObject({ phase: 'awaiting_review', skipped: [7, 8] });
  });

  it('halts the batch when a chapter comes back awaiting_review', async () => {
    const { executor, progressCalls, runChapterGeneration } = makeExecutor(async input => {
      const { chapter } = input as { chapter: number };
      return chapter === 5 ? { runId: 'r5', outcome: 'awaiting_review', status: 'awaiting_review' } : { runId: `r${chapter}`, outcome: 'accepted', status: 'completed' };
    });
    const job = makeJob([5, 6, 7]);

    await (executor as unknown as { runGenerate(job: Job.Row): Promise<void> }).runGenerate(job);

    expect(runChapterGeneration).toHaveBeenCalledTimes(1);

    const lastCall = progressCalls.at(-1);
    expect(lastCall?.[1]).toMatchObject({ phase: 'awaiting_review', skipped: [6, 7] });
  });

  it('still throws on a failed chapter instead of halting silently', async () => {
    const { executor } = makeExecutor(async () => ({ runId: 'r', outcome: 'failed', status: 'failed' }));
    const job = makeJob([5, 6]);

    await expect((executor as unknown as { runGenerate(job: Job.Row): Promise<void> }).runGenerate(job)).rejects.toThrow();
  });
});
