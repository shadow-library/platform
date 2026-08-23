import { describe, expect, it, mock } from 'bun:test';

import type { Job } from '@server/database';

import type { JobProgress } from '@modules/jobs/job.service';
import { JobExecutor } from '@modules/jobs/job.executor';
import type { WorkflowRunResult } from '@modules/ai/graphs/workflow-run.service';

function makeExecutor(runSourceExtraction: (input: unknown) => Promise<WorkflowRunResult>) {
  const progressCalls: [string, JobProgress][] = [];
  const progress = mock(async (jobId: string, snapshot: JobProgress) => {
    progressCalls.push([jobId, snapshot]);
  });
  const jobService = { progress } as never;
  const concurrency = {} as never;
  const runSourceExtractionMock = mock(runSourceExtraction);
  const workflowRunService = { runSourceExtraction: runSourceExtractionMock } as never;
  const indexingService = {} as never;
  const databaseService = { getPostgresClient: () => ({}) } as never;
  const rebrandService = {} as never;
  const recombineService = {} as never;
  const publishRunner = {} as never;
  const storage = {} as never;

  const executor = new JobExecutor(
    jobService,
    concurrency,
    workflowRunService,
    indexingService,
    databaseService,
    rebrandService,
    {} as never,
    {} as never,
    recombineService,
    publishRunner,
    storage,
  );
  return { executor, progressCalls, runSourceExtraction: runSourceExtractionMock };
}

function makeJob(chapters: number[]): Job.Row {
  return {
    id: 'job-1',
    projectId: 1n,
    kind: 'extract',
    target: 'extract-1',
    status: 'in_progress',
    attempts: 1,
    lastError: null,
    payload: { chapters },
    progress: null,
  } as unknown as Job.Row;
}

describe('JobExecutor.runExtract', () => {
  it('should extract every resolved chapter when driven through the enqueue payload', async () => {
    const { executor, runSourceExtraction, progressCalls } = makeExecutor(async () => ({ runId: 'r', outcome: 'completed', status: 'completed' }));
    const job = makeJob([3, 4, 7]);

    await (executor as unknown as { runExtract(job: Job.Row): Promise<void> }).runExtract(job);

    expect(runSourceExtraction).toHaveBeenCalledTimes(3);
    expect(runSourceExtraction).toHaveBeenNthCalledWith(1, { projectId: 1n, chapter: 3 });
    expect(runSourceExtraction).toHaveBeenNthCalledWith(2, { projectId: 1n, chapter: 4 });
    expect(runSourceExtraction).toHaveBeenNthCalledWith(3, { projectId: 1n, chapter: 7 });
    expect(progressCalls.at(-1)?.[1]).toMatchObject({ done: 2, total: 3, current: '7' });
  });

  it('should do nothing when the payload carries no chapters — the bug this test guards against', async () => {
    const { executor, runSourceExtraction } = makeExecutor(async () => ({ runId: 'r', outcome: 'completed', status: 'completed' }));
    const job = makeJob([]);

    await (executor as unknown as { runExtract(job: Job.Row): Promise<void> }).runExtract(job);

    expect(runSourceExtraction).not.toHaveBeenCalled();
  });

  it('should throw when a chapter extraction fails, halting the batch', async () => {
    const { executor } = makeExecutor(async input => {
      const { chapter } = input as { chapter: number };
      return chapter === 4 ? { runId: 'r4', outcome: 'failed', status: 'failed' } : { runId: `r${chapter}`, outcome: 'completed', status: 'completed' };
    });
    const job = makeJob([3, 4, 7]);

    await expect((executor as unknown as { runExtract(job: Job.Row): Promise<void> }).runExtract(job)).rejects.toThrow(/chapter 4 extraction failed/);
  });
});
