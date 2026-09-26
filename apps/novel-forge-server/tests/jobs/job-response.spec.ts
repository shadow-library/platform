import { describe, expect, it } from 'bun:test';

import { emptyCallUsageTotals } from '@modules/ai/usage/call-usage';
import { redactJobForResponse, toJobUsageResponse } from '@modules/jobs/job-response';
import { type Job } from '@server/database';

function baseJob(overrides: Partial<Job.Row> = {}): Job.Row {
  return {
    id: 'job-1',
    projectId: 1n,
    kind: 'import',
    target: 'import-1',
    status: 'in_progress',
    attempts: 1,
    lastError: null,
    payload: null,
    progress: null,
    nextAttemptAt: null,
    cancelRequestedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('redactJobForResponse', () => {
  it('should collapse a full in-flight import payload to a chapter count and cover flag', () => {
    const job = baseJob({
      payload: {
        chapters: [
          { title: 'A', content: 'x'.repeat(1000) },
          { title: 'B', content: 'y'.repeat(1000) },
        ],
        cover: { mimeType: 'image/jpeg', dataBase64: 'zzzz' },
      },
    });
    const redacted = redactJobForResponse(job);
    expect(redacted.payload).toEqual({ chapters: 2, hasCover: true });
  });

  it('should leave an already-compacted summary payload as-is', () => {
    const job = baseJob({ payload: { chapters: 5, hasCover: false } });
    expect(redactJobForResponse(job).payload).toEqual({ chapters: 5, hasCover: false });
  });

  it('should report no cover when the payload carries none', () => {
    const job = baseJob({ payload: { chapters: [{ title: 'A', content: 'x' }] } });
    expect(redactJobForResponse(job).payload).toEqual({ chapters: 1, hasCover: false });
  });

  it('should leave a null payload and non-import job kinds untouched', () => {
    expect(redactJobForResponse(baseJob({ payload: null })).payload).toBeNull();
    const generate = baseJob({ kind: 'generate', payload: { chapters: [1, 2, 3], guidance: 'be dramatic' } });
    expect(redactJobForResponse(generate).payload).toEqual({ chapters: [1, 2, 3], guidance: 'be dramatic' });
  });

  it('should never mutate the original job row', () => {
    const original = baseJob({ payload: { chapters: [{ title: 'A', content: 'x' }] } });
    const snapshot = JSON.parse(JSON.stringify(original.payload));
    redactJobForResponse(original);
    expect(original.payload).toEqual(snapshot);
  });
});

describe('toJobUsageResponse', () => {
  it('should shape zeroed totals for a job with no model calls', () => {
    expect(toJobUsageResponse(emptyCallUsageTotals())).toEqual({
      calls: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      estimatedCostUsd: 0,
      byCostSource: [],
    });
  });

  it('should drop internal fields (totalLatencyMs) that the response never carries', () => {
    const totals = { ...emptyCallUsageTotals(), calls: 3, costUsd: 0.05, totalLatencyMs: 900, byCostSource: [{ costSource: 'provider', calls: 3, costUsd: 0.05 }] };

    expect(toJobUsageResponse(totals)).not.toHaveProperty('totalLatencyMs');
  });
});
