/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { redactJobForResponse } from '@modules/jobs/job-response';
import { type Job } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('redactJobForResponse', () => {
  it('should collapse a full in-flight import payload to a chapter count and cover flag', () => {
    const job = baseJob({
      payload: {
        mode: 'final',
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
    const job = baseJob({ payload: { mode: 'source', chapters: [{ title: 'A', content: 'x' }] } });
    expect(redactJobForResponse(job).payload).toEqual({ chapters: 1, hasCover: false });
  });

  it('should leave a null payload and non-import job kinds untouched', () => {
    expect(redactJobForResponse(baseJob({ payload: null })).payload).toBeNull();
    const generate = baseJob({ kind: 'generate', payload: { chapters: [1, 2, 3], guidance: 'be dramatic' } });
    expect(redactJobForResponse(generate).payload).toEqual({ chapters: [1, 2, 3], guidance: 'be dramatic' });
  });

  it('should never mutate the original job row', () => {
    const original = baseJob({ payload: { mode: 'final', chapters: [{ title: 'A', content: 'x' }] } });
    const snapshot = JSON.parse(JSON.stringify(original.payload));
    redactJobForResponse(original);
    expect(original.payload).toEqual(snapshot);
  });
});
