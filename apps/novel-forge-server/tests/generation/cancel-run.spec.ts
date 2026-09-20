import { describe, expect, it } from 'bun:test';

import { GenerationService } from '@modules/generation/generation.service';

interface RunRow {
  status: string;
}

function makeService(run: RunRow | undefined, live: boolean): { service: GenerationService; cancelCalls: string[] } {
  const cancelCalls: string[] = [];
  const db = { query: { workflowRuns: { findFirst: async () => run } } };
  const databaseService = { getPostgresClient: () => db } as never;
  const workflowRunService = { cancel: (runId: string) => (cancelCalls.push(runId), live) } as never;
  const noop = {} as never;
  const service = new GenerationService(databaseService, workflowRunService, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop);
  return { service, cancelCalls };
}

describe('GenerationService.cancelRun', () => {
  it('should report stopping and fire the abort when the run is live on this replica', async () => {
    const { service, cancelCalls } = makeService({ status: 'running' }, true);

    const result = await service.cancelRun(BigInt(1), 'run-1');

    expect(result).toEqual({ runId: 'run-1', status: 'running', outcome: 'stopping' });
    expect(cancelCalls).toEqual(['run-1']);
  });

  it('should report already_settled and never call cancel for a terminal run', async () => {
    const { service, cancelCalls } = makeService({ status: 'completed' }, true);

    const result = await service.cancelRun(BigInt(1), 'run-1');

    expect(result).toEqual({ runId: 'run-1', status: 'completed', outcome: 'already_settled' });
    expect(cancelCalls).toEqual([]);
  });

  it('should report already_settled for a run that settled as failed', async () => {
    const { service } = makeService({ status: 'failed' }, true);

    const result = await service.cancelRun(BigInt(1), 'run-1');

    expect(result).toEqual({ runId: 'run-1', status: 'failed', outcome: 'already_settled' });
  });

  it('should report already_settled for a run that settled as cancelled', async () => {
    const { service } = makeService({ status: 'cancelled' }, true);

    const result = await service.cancelRun(BigInt(1), 'run-1');

    expect(result).toEqual({ runId: 'run-1', status: 'cancelled', outcome: 'already_settled' });
  });

  it('should report not_delivered without writing the run row when it is running in the database but not live on this replica', async () => {
    const { service, cancelCalls } = makeService({ status: 'running' }, false);

    const result = await service.cancelRun(BigInt(1), 'run-1');

    expect(result).toEqual({ runId: 'run-1', status: 'running', outcome: 'not_delivered' });
    expect(cancelCalls).toEqual(['run-1']);
  });

  it('should 404 for a run id that does not exist, or that belongs to another project', async () => {
    const { service } = makeService(undefined, true);

    await expect(service.cancelRun(BigInt(1), 'missing')).rejects.toMatchObject({ code: 'PRJ_001' });
  });
});
