import { describe, expect, it } from 'bun:test';

import { ApiError } from '../src/lib/apis/transport';
import {
  approvalMoved,
  approveAsWrittenRefused,
  batchStopNotice,
  changedSinceApproval,
  finalizeBlockerMessages,
  rowChangedSinceApproval,
  statusLabel,
  teachingGateRefusal,
  workspaceActions,
  type WorkspaceDraft,
} from '../src/lib/chapter-workspace';

const DRAFT: WorkspaceDraft = {
  chapter: 4,
  status: 'draft',
  reviewStatus: 'needs_review',
  revision: 2,
  approvedRevision: null,
  staleReason: null,
  body: 'Hollis kept the ledger.',
};

function apiError(code: string, message: string): ApiError {
  return new ApiError(400, { code, type: 'CLIENT_ERROR', message });
}

describe('workspaceActions', () => {
  it('should hide editing on a final chapter, offer Amend, and keep review', () => {
    expect(workspaceActions({ ...DRAFT, status: 'final', reviewStatus: 'final' }, false)).toEqual({
      edit: false,
      approve: false,
      approveAsWritten: false,
      finalize: false,
      amend: true,
      verify: true,
      askForge: false,
    });
  });

  it('should offer editing and approval, not finalize, on a draft that is not approved', () => {
    expect(workspaceActions(DRAFT, false)).toMatchObject({ edit: true, approve: true, approveAsWritten: false, finalize: false, amend: false });
  });

  it('should swap plain approval for approve-as-written on a stale draft', () => {
    expect(workspaceActions({ ...DRAFT, staleReason: 'ancestor chapter 3 was hand_edited' }, false)).toMatchObject({ approve: false, approveAsWritten: true });
  });

  it('should withdraw editing and approval while the chapter is being written', () => {
    expect(workspaceActions(DRAFT, true)).toMatchObject({ edit: false, approve: false });
  });

  it('should put finalize in approval’s place once the version on screen is approved', () => {
    expect(workspaceActions({ ...DRAFT, reviewStatus: 'approved', approvedRevision: 2 }, false)).toMatchObject({ approve: false, finalize: true });
  });

  it('should offer approval over a contradiction only while a current judge review holds it with blocking findings', () => {
    expect(workspaceActions({ ...DRAFT, reviewStatus: 'contradiction' }, false, 2)).toMatchObject({ approve: true, finalize: false });
  });

  it('should withhold approval of a contradiction no current review explains', () => {
    expect(workspaceActions({ ...DRAFT, reviewStatus: 'contradiction' }, false, 0)).toMatchObject({ approve: false, approveAsWritten: false });
    expect(workspaceActions({ ...DRAFT, reviewStatus: 'contradiction', staleReason: 'ancestor chapter 3 was hand_edited' }, false)).toMatchObject({
      approveAsWritten: false,
    });
  });

  it('should have nothing to review in an empty chapter', () => {
    expect(workspaceActions({ ...DRAFT, body: '  ' }, false).verify).toBe(false);
  });
});

describe('changedSinceApproval', () => {
  it('should name the approved version once the text moved past it', () => {
    expect(changedSinceApproval({ ...DRAFT, revision: 5, approvedRevision: 3 })).toBe(3);
  });

  it('should say nothing for a draft never approved, one approved now, or a final one', () => {
    expect(changedSinceApproval(DRAFT)).toBeUndefined();
    expect(changedSinceApproval({ ...DRAFT, reviewStatus: 'approved', approvedRevision: 2 })).toBeUndefined();
    expect(changedSinceApproval({ ...DRAFT, status: 'final', reviewStatus: 'final', revision: 5, approvedRevision: 3 })).toBeUndefined();
  });
});

describe('statusLabel', () => {
  it('should name the lock, the approved version and a change since approval', () => {
    expect(statusLabel({ status: 'final', reviewStatus: 'final', revision: 3, approvedRevision: 3 })).toBe('Final · locked');
    expect(statusLabel({ status: 'draft', reviewStatus: 'approved', revision: 3, approvedRevision: 3 })).toBe('Approved · version 3');
    expect(statusLabel({ status: 'draft', reviewStatus: 'needs_review', revision: 4, approvedRevision: 3 })).toBe('Changed');
    expect(statusLabel({ status: 'draft', reviewStatus: 'needs_review', revision: 3, approvedRevision: null })).toBeUndefined();
  });
});

describe('rowChangedSinceApproval', () => {
  it('should flag a row back in review after an approval', () => {
    expect(rowChangedSinceApproval({ status: 'draft', reviewStatus: 'needs_review', approvedRevision: 3 })).toBe(true);
  });

  it('should leave approved, final, never-approved and planned rows alone', () => {
    expect(rowChangedSinceApproval({ status: 'draft', reviewStatus: 'approved', approvedRevision: 3 })).toBe(false);
    expect(rowChangedSinceApproval({ status: 'final', reviewStatus: 'final', approvedRevision: 3 })).toBe(false);
    expect(rowChangedSinceApproval({ status: 'draft', reviewStatus: 'needs_review', approvedRevision: null })).toBe(false);
    expect(rowChangedSinceApproval({})).toBe(false);
  });
});

describe('finalizeBlockerMessages', () => {
  it('should list the server’s reasons in its order', () => {
    expect(
      finalizeBlockerMessages({
        ready: false,
        blockers: [
          { code: 'FIN_001', message: 'Chapters must be finalized in order' },
          { code: 'CHP_005', message: 'Isolated chapter has no summary' },
        ],
      }),
    ).toEqual(['Chapters must be finalized in order', 'Isolated chapter has no summary']);
  });

  it('should block nothing when ready, loading, or unanswered', () => {
    expect(finalizeBlockerMessages({ ready: true, blockers: [] })).toEqual([]);
    expect(finalizeBlockerMessages(undefined)).toEqual([]);
  });

  it('should still block a refusal that names no reason', () => {
    expect(finalizeBlockerMessages({ ready: false, blockers: [] })).toHaveLength(1);
  });
});

describe('approval refusals', () => {
  it('should tell a moved draft apart from the reveal-stale refusal', () => {
    expect([approvalMoved(apiError('DRF_013', 'changed')), approveAsWrittenRefused(apiError('DRF_013', 'changed'))]).toEqual([true, false]);
    expect([approvalMoved(apiError('DRF_017', 'fix the plan')), approveAsWrittenRefused(apiError('DRF_017', 'fix the plan'))]).toEqual([false, true]);
  });
});

describe('teachingGateRefusal', () => {
  const message =
    'Chapter 5 cannot be written by the AI until chapter 4 is approved — its characters learn something there that later chapters build on. You can still write chapter 5 yourself.';

  it('should pass the server’s explanation through unchanged', () => {
    expect(teachingGateRefusal(apiError('DRF_016', message))).toBe(message);
  });

  it('should leave any other refusal to the generic toast', () => {
    expect(teachingGateRefusal(apiError('DRF_003', 'Unresolved contradiction'))).toBeUndefined();
  });
});

describe('batchStopNotice', () => {
  it('should say the batch stopped at a teaching chapter and why', () => {
    expect(batchStopNotice({ stoppedAtTeachingChapter: 6 })).toBe(
      'Batch stopped after chapter 6 — its characters learn something there, so the AI writes chapter 7 once you approve it',
    );
  });

  it('should keep the external-slot and unwritten-chapter notices', () => {
    expect(batchStopNotice({ stoppedAtExternalChapter: 3 })).toBe('Batch stopped at chapter 3 — it is written outside the primary model');
    expect(batchStopNotice({ stoppedAtUnwrittenChapter: 3 })).toBe('Batch stopped at chapter 3 — it has no draft yet');
  });

  it('should say nothing when the batch ran its full length', () => {
    expect(batchStopNotice({})).toBeUndefined();
  });
});
