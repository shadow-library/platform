import { describe, expect, it } from 'bun:test';

import { approveDraftRequest, draftMovedUnderneath, nextDraftPath } from '../src/lib/apis/draft.api';
import { ApiError } from '../src/lib/apis/transport';

function apiError(code: string, status = 409): ApiError {
  return new ApiError(status, { code, type: 'CLIENT_ERROR', message: 'This chapter changed while you were working on it. Reload it and try again.' });
}

describe('approveDraftRequest', () => {
  it('should approve the revision of the draft on screen', () => {
    expect(approveDraftRequest('p1', { id: '12', chapter: 4, revision: 7, saveSeq: 3 })).toEqual({
      path: '/projects/p1/drafts/4/approve',
      body: { draftId: '12', revision: 7, saveSeq: 3 },
    });
  });

  it('should approve a stale draft as written with the stale reason the author read', () => {
    expect(approveDraftRequest('p1', { id: '12', chapter: 4, revision: 7, saveSeq: 3, keptStaleReason: 'ancestor chapter 3 was hand_edited' })).toEqual({
      path: '/projects/p1/drafts/4/approve',
      body: { draftId: '12', revision: 7, saveSeq: 3, keepStale: true, staleReason: 'ancestor chapter 3 was hand_edited' },
    });
  });
});

describe('draftMovedUnderneath', () => {
  it('should read a conflict, a deleted, a finalized and a stale draft as the prose on screen being out of date', () => {
    expect(['DRF_013', 'DRF_001', 'DRF_002', 'DRF_007'].map(code => draftMovedUnderneath(apiError(code)))).toEqual([true, true, true, true]);
  });

  it('should leave any other failure to the toast alone', () => {
    expect(draftMovedUnderneath(apiError('DRF_020', 400))).toBe(false);
  });
});

describe('nextDraftPath', () => {
  it('should ask the server to start the next chapter without naming a number', () => {
    expect(nextDraftPath('p1')).toBe('/projects/p1/drafts/next');
  });
});
