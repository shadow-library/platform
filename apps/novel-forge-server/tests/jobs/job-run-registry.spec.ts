import { describe, expect, it } from 'bun:test';

import { WorkflowRunService } from '@modules/ai/graphs/workflow-run.service';

function runService() {
  const aborted: string[] = [];
  const db = {
    query: { workflowRuns: { findFirst: async () => undefined } },
    insert: () => ({ values: () => ({ returning: async () => [{ id: 'run-1' }] }) }),
  };
  const modelRouter = { abortRun: (runId: string) => (aborted.push(runId), true) };
  const service = new WorkflowRunService(
    { getPostgresClient: () => db } as never,
    {} as never,
    modelRouter as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { publish: () => undefined } as never,
    {} as never,
  );
  return { service, aborted };
}

describe('WorkflowRunService.cancelJobRuns', () => {
  it('should abort every run this replica opened for a job, with no database read to find them', async () => {
    const { service, aborted } = runService();
    await service.createRun(1n, 'chapter-generation', 'chapter-1', {}, 'job-1');

    service.cancelJobRuns('job-1');

    expect(aborted).toEqual(['run-1']);
  });

  it('should abort nothing for a job whose runs it has already forgotten', async () => {
    const { service, aborted } = runService();
    await service.createRun(1n, 'chapter-generation', 'chapter-1', {}, 'job-1');

    service.forgetJobRuns('job-1');
    service.cancelJobRuns('job-1');

    expect(aborted).toEqual([]);
  });
});
