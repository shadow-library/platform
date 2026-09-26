import { describe, expect, it } from 'bun:test';

import { isQueuedReview, remedyBody, remedyPath } from '../src/lib/apis/review.api';

describe('isQueuedReview', () => {
  it('should tell a queued model review from a stored one', () => {
    expect(isQueuedReview({ jobId: 'j1', runId: 'r1', kind: 'judge', status: 'pending' })).toBe(true);
    expect(
      isQueuedReview({
        id: '7',
        chapter: 4,
        kind: 'mechanics',
        disposition: 'clear',
        stale: false,
        isolated: false,
        findings: [],
        openFindings: 0,
        openBlocking: 0,
        checked: [],
        createdAt: '2026-09-26T10:00:00.000Z',
      }),
    ).toBe(false);
  });
});

describe('remedyPath', () => {
  it('should address one finding of one review', () => {
    expect(remedyPath('p1', 4, { reviewId: '7', findingId: 'f2' })).toBe('/projects/p1/chapters/4/reviews/7/findings/f2/remedy');
  });
});

describe('remedyBody', () => {
  it('should send a trimmed reason and leave out a blank one', () => {
    expect(remedyBody('dismissed', '  deliberate  ')).toEqual({ action: 'dismissed', reason: 'deliberate' });
    expect(remedyBody('overridden', '   ')).toEqual({ action: 'overridden' });
    expect(remedyBody('fixing_myself')).toEqual({ action: 'fixing_myself' });
  });
});
