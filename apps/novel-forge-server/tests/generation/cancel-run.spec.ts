import { describe, expect, it } from 'bun:test';

import { type RunCancelOutcome } from '@modules/ai/graphs/run-cancellation.service';
import { GenerationService } from '@modules/generation/generation.service';

interface RunRow {
  status: string;
}

function makeService(reads: (RunRow | undefined)[], outcome: RunCancelOutcome): { service: GenerationService; cancelCalls: string[] } {
  const cancelCalls: string[] = [];
  const db = { query: { workflowRuns: { findFirst: async () => (reads.length > 1 ? reads.shift() : reads[0]) } } };
  const databaseService = { getPostgresClient: () => db } as never;
  const workflowRunService = { cancel: async (runId: string) => (cancelCalls.push(runId), outcome) } as never;
  const noop = {} as never;
  const service = new GenerationService(databaseService, workflowRunService, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop);
  return { service, cancelCalls };
}

describe('GenerationService.cancelRun', () => {
  it('should report stopping once the cancel is recorded, wherever the run is running', async () => {
    const { service, cancelCalls } = makeService([{ status: 'running' }], 'stopping');

    const result = await service.cancelRun(BigInt(1), 'run-1');

    expect(result).toEqual({ runId: 'run-1', status: 'running', outcome: 'stopping' });
    expect(cancelCalls).toEqual(['run-1']);
  });

  it('should report already_settled and never call cancel for a terminal run', async () => {
    const { service, cancelCalls } = makeService([{ status: 'completed' }], 'stopping');

    const result = await service.cancelRun(BigInt(1), 'run-1');

    expect(result).toEqual({ runId: 'run-1', status: 'completed', outcome: 'already_settled' });
    expect(cancelCalls).toEqual([]);
  });

  it('should answer with the status a run settled with between the read and the cancel', async () => {
    const { service } = makeService([{ status: 'running' }, { status: 'cancelled' }], 'already_settled');

    const result = await service.cancelRun(BigInt(1), 'run-1');

    expect(result).toEqual({ runId: 'run-1', status: 'cancelled', outcome: 'already_settled' });
  });

  it('should report not_delivered when the cancel is recorded but nothing is left to act on it', async () => {
    const { service } = makeService([{ status: 'running' }], 'not_delivered');

    const result = await service.cancelRun(BigInt(1), 'run-1');

    expect(result).toEqual({ runId: 'run-1', status: 'running', outcome: 'not_delivered' });
  });

  it('should 404 for a run id that does not exist, or that belongs to another project', async () => {
    const { service } = makeService([undefined], 'stopping');

    await expect(service.cancelRun(BigInt(1), 'missing')).rejects.toMatchObject({ code: 'PRJ_001' });
  });
});
