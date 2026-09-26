import { describe, expect, it, mock } from 'bun:test';

import { runWithCostTier, scopedCostTier } from '@modules/ai/cost-tier-scope';
import { JobExecutor } from '@modules/jobs/job.executor';
import { JobHandlerRegistry } from '@modules/jobs/job-handler.registry';
import { JobService, payloadCostTier } from '@modules/jobs/job.service';

import { FakeAuthoringClaims } from './authoring-claim-fixtures';

function fakeJobService() {
  const inserted: unknown[] = [];
  const db = {
    insert: () => ({
      values: (values: { payload: unknown }) => {
        inserted.push(values.payload);
        return { onConflictDoNothing: () => ({ returning: async () => [{ id: 'job-1' }] }) };
      },
    }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  const service = new JobService({ getPostgresClient: () => db } as never, { publish: () => undefined } as never, new FakeAuthoringClaims().asService());
  return { service, inserted };
}

describe('JobService.enqueue', () => {
  it('should carry the tier of the chat turn that started the job, and nothing else of the turn', async () => {
    const { service, inserted } = fakeJobService();

    await runWithCostTier('economy', () => service.enqueue(1n, 'generate', 'chapter-3', { chapters: [3] }));
    await runWithCostTier('performant', () => service.enqueue(1n, 'generate', 'chapter-4'));

    expect(inserted).toEqual([{ chapters: [3], costTier: 'economy' }, { costTier: 'performant' }]);
  });

  it('should leave the payload untouched outside a chat turn', async () => {
    const { service, inserted } = fakeJobService();

    await service.enqueue(1n, 'generate', 'chapter-3', { chapters: [3] });

    expect(inserted).toEqual([{ chapters: [3] }]);
  });
});

describe('payloadCostTier', () => {
  it('should read only a known tier off a payload', () => {
    expect(payloadCostTier({ costTier: 'economy' })).toBe('economy');
    expect(payloadCostTier({ costTier: 'lavish' })).toBeUndefined();
    expect(payloadCostTier(null)).toBeUndefined();
  });
});

describe('JobExecutor.dispatch', () => {
  function executorFor(payload: unknown) {
    const seen: unknown[] = [];
    const job = { id: 'job-1', projectId: 1n, kind: 'generate', target: 'batch', status: 'pending', payload, cancelRequestedAt: null };
    const jobService = {
      get: async () => job,
      start: async () => true,
      progress: async () => undefined,
      succeed: mock(async () => undefined),
      fail: mock(async () => undefined),
    };
    const workflowRunService = {
      runChapterGeneration: async () => {
        seen.push(scopedCostTier());
        return { runId: 'r', outcome: 'accepted', status: 'completed' };
      },
    };
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
    return { executor, seen, jobService };
  }

  it('should run the job at the tier its payload carries', async () => {
    const { executor, seen, jobService } = executorFor({ chapters: [3], costTier: 'economy' });

    await executor.dispatch('job-1');

    expect(seen).toEqual(['economy']);
    expect(jobService.succeed).toHaveBeenCalled();
  });

  it('should not let the dispatching caller’s tier reach a job that carries none', async () => {
    const { executor, seen } = executorFor({ chapters: [3] });

    await runWithCostTier('performant', () => executor.dispatch('job-1'));

    expect(seen).toEqual([undefined]);
  });
});
