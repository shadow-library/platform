import { describe, expect, it } from 'bun:test';

import { JobService } from '@modules/jobs/job.service';

interface GroupedRow {
  jobId: string;
  model: string;
  status: string;
  costSource: string;
  calls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  latencyMs: number;
  recordedCostUsd: number;
  unpricedInputTokens: number;
  unpricedOutputTokens: number;
}

function groupedRow(overrides: Partial<GroupedRow>): GroupedRow {
  return {
    jobId: 'job-1',
    model: 'anthropic/claude-sonnet-5',
    status: 'ok',
    costSource: 'provider',
    calls: 1,
    inputTokens: 10,
    cachedInputTokens: 0,
    outputTokens: 5,
    latencyMs: 10,
    recordedCostUsd: 0,
    unpricedInputTokens: 0,
    unpricedOutputTokens: 0,
    ...overrides,
  };
}

function service(rows: GroupedRow[]): JobService {
  const db = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ groupBy: () => Promise.resolve(rows) }),
        }),
      }),
    }),
  };
  return new JobService({ getPostgresClient: () => db } as never, { publish: () => {} } as never, {} as never);
}

describe('JobService.usageForJobs', () => {
  it('should zero-fill a job that drove no model calls (e.g. publish)', async () => {
    const result = await service([]).usageForJobs(['job-1']);

    expect(result.get('job-1')).toMatchObject({ calls: 0, costUsd: 0 });
  });

  it('should fold every grouped bucket for a job into one total, keeping another job separate', async () => {
    const rows = [
      groupedRow({ jobId: 'job-1', recordedCostUsd: 0.01 }),
      groupedRow({ jobId: 'job-1', recordedCostUsd: 0.02 }),
      groupedRow({ jobId: 'job-2', recordedCostUsd: 0.03 }),
    ];

    const result = await service(rows).usageForJobs(['job-1', 'job-2']);

    expect(result.get('job-1')?.calls).toBe(2);
    expect(result.get('job-1')?.costUsd).toBeCloseTo(0.03);
    expect(result.get('job-2')?.calls).toBe(1);
    expect(result.get('job-2')?.costUsd).toBeCloseTo(0.03);
  });

  it('should return an entry for every requested job id even when some drove no calls', async () => {
    const result = await service([groupedRow({ jobId: 'job-1' })]).usageForJobs(['job-1', 'job-2']);

    expect(result.has('job-1')).toBe(true);
    expect(result.has('job-2')).toBe(true);
  });

  it('should cap the number of job ids it queries for', async () => {
    const many = Array.from({ length: 500 }, (_, i) => `job-${i}`);

    const result = await service([]).usageForJobs(many);

    expect(result.size).toBeLessThanOrEqual(200);
  });
});
