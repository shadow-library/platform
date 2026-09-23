import { describe, expect, it } from 'bun:test';

import { type JobStatus } from '../src/lib/apis/api-types.gen';
import { jobSettled, parseProjectEvent } from '../src/lib/apis/events.api';

const EVERY_STATUS: JobStatus[] = ['pending', 'in_progress', 'done', 'failed', 'cancelled'];

describe('jobSettled', () => {
  it('should call a job settled for every status but the two it is still in flight on', () => {
    expect(EVERY_STATUS.map(status => [status, jobSettled(status)])).toEqual([
      ['pending', false],
      ['in_progress', false],
      ['done', true],
      ['failed', true],
      ['cancelled', true],
    ]);
  });

  it('should treat a status the server adds later as settled, so a finished round is never left on screen', () => {
    expect(jobSettled('expired')).toBe(true);
  });
});

describe('parseProjectEvent', () => {
  it('should read a job event off the stream', () => {
    expect(parseProjectEvent(JSON.stringify({ type: 'job', jobId: 'j1', kind: 'blueprint', status: 'done' }))).toMatchObject({ type: 'job', kind: 'blueprint' });
  });

  it('should ignore anything that is not one of the three event types', () => {
    expect(parseProjectEvent(JSON.stringify({ type: 'nonsense' }))).toBeUndefined();
    expect(parseProjectEvent('not json')).toBeUndefined();
    expect(parseProjectEvent(undefined)).toBeUndefined();
  });
});
