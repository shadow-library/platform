import { describe, expect, it } from 'bun:test';

import { approveDraftRequest, draftMovedUnderneath } from '../src/lib/apis/draft.api';
import { ApiError } from '../src/lib/apis/transport';

function apiError(code: string, status = 409): ApiError {
  return new ApiError(status, { code, type: 'CLIENT_ERROR', message: 'This chapter changed while you were working on it. Reload it and try again.' });
}

describe('approveDraftRequest', () => {
  it('should approve the revision of the draft on screen', () => {
    expect(approveDraftRequest('p1', { chapter: 4, revision: 7 })).toEqual({ path: '/projects/p1/drafts/4/approve', body: { revision: 7 } });
  });
});

describe('draftMovedUnderneath', () => {
  it('should read a conflict, a finalized draft and a stale draft as the prose on screen being out of date', () => {
    expect(['DRF_013', 'DRF_002', 'DRF_007'].map(code => draftMovedUnderneath(apiError(code)))).toEqual([true, true, true]);
  });

  it('should leave any other failure to the toast alone', () => {
    expect(draftMovedUnderneath(apiError('DRF_001', 404))).toBe(false);
  });
});
