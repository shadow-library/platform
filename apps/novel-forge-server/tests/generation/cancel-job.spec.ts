import { describe, expect, it } from 'bun:test';

import { GenerationService } from '@modules/generation/generation.service';

interface CancelOutcome {
  status: string;
  outcome: string;
}

function makeService(cancelResult: CancelOutcome | undefined): { service: GenerationService; calls: [string, bigint][] } {
  const calls: [string, bigint][] = [];
  const jobService = { cancel: async (jobId: string, projectId: bigint) => (calls.push([jobId, projectId]), cancelResult) } as never;
  const databaseService = { getPostgresClient: () => ({}) } as never;
  const noop = {} as never;
  const service = new GenerationService(databaseService, noop, noop, noop, noop, noop, noop, noop, jobService, noop, noop, noop, noop, noop);
  return { service, calls };
}

describe('GenerationService.cancelJob', () => {
  it('should report cancelled for a job that was still pending', async () => {
    const { service, calls } = makeService({ status: 'cancelled', outcome: 'cancelled' });

    const result = await service.cancelJob(BigInt(1), 'job-1');

    expect(result).toEqual({ jobId: 'job-1', status: 'cancelled', outcome: 'cancelled' });
    expect(calls).toEqual([['job-1', BigInt(1)]]);
  });

  it('should 404 for a job id that does not exist, or that belongs to another project', async () => {
    const { service } = makeService(undefined);

    await expect(service.cancelJob(BigInt(1), 'missing')).rejects.toMatchObject({ code: 'JOB_001' });
  });
});
