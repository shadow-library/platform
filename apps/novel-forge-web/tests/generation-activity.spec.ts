import { describe, expect, it } from 'bun:test';

import { type GenerationJobItem } from '../src/lib/apis';
import { activeGenerateJob, chapterGeneration, generationActivityOf, jobChapters } from '../src/lib/generation-activity';

function job(overrides: Partial<GenerationJobItem> = {}): GenerationJobItem {
  return {
    id: 'job-1',
    projectId: '1',
    kind: 'generate',
    target: '4,5,6',
    status: 'in_progress',
    attempts: 1,
    createdAt: '2026-09-22T10:00:00.000Z',
    updatedAt: '2026-09-22T10:02:00.000Z',
    ...overrides,
  };
}

describe('jobChapters', () => {
  it('should read the comma-separated target as chapter numbers', () => {
    expect(jobChapters('4,5,6')).toEqual([4, 5, 6]);
  });

  it('should drop anything that is not a chapter number', () => {
    expect(jobChapters('all')).toEqual([]);
  });
});

describe('activeGenerateJob', () => {
  it('should pick the running generate job over finished and other kinds', () => {
    const running = job({ id: 'live' });
    expect(activeGenerateJob([job({ id: 'old', status: 'done' }), job({ id: 'extract', kind: 'extract' }), running])).toBe(running);
  });

  it('should return nothing when no generate job is running', () => {
    expect(activeGenerateJob([job({ status: 'failed' })])).toBeUndefined();
  });
});

describe('generationActivityOf', () => {
  it('should follow the chapter the worker reports and its own start time', () => {
    const activity = generationActivityOf(job({ progress: { current: '5', phase: 'generating', startedAt: '2026-09-22T10:05:00.000Z' } }));
    expect(activity).toEqual({ jobId: 'job-1', chapters: [4, 5, 6], current: 5, startedAt: '2026-09-22T10:05:00.000Z' });
  });

  it('should fall back to the row update time when the worker sent no start time', () => {
    expect(generationActivityOf(job({ progress: { current: '4', phase: 'generating' } }))?.startedAt).toBe('2026-09-22T10:02:00.000Z');
  });

  it('should time a pending job from when it was enqueued, on its first chapter', () => {
    expect(generationActivityOf(job({ status: 'pending', progress: null }))).toMatchObject({ current: 4, startedAt: '2026-09-22T10:00:00.000Z' });
  });

  it('should ignore a finished job', () => {
    expect(generationActivityOf(job({ status: 'done' }))).toBeUndefined();
  });
});

describe('chapterGeneration', () => {
  const activity = generationActivityOf(job({ progress: { current: '5', phase: 'generating', startedAt: '2026-09-22T10:05:00.000Z' } }));

  it('should mark the current chapter as writing with its start time', () => {
    expect(chapterGeneration(activity, 5)).toEqual({ phase: 'writing', startedAt: '2026-09-22T10:05:00.000Z' });
  });

  it('should mark later chapters in the batch as queued', () => {
    expect(chapterGeneration(activity, 6)).toEqual({ phase: 'queued' });
  });

  it('should leave chapters already drafted by the batch alone', () => {
    expect(chapterGeneration(activity, 4)).toBeUndefined();
  });

  it('should leave chapters outside the batch alone', () => {
    expect(chapterGeneration(activity, 9)).toBeUndefined();
  });
});
