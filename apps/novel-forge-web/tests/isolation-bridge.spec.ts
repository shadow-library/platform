import { describe, expect, it } from 'bun:test';

import { type FinalizeReviewItemResponse, type FinalizeReviewResponse } from '../src/lib/apis/api-types.gen';
import {
  autoKeepChoices,
  bridgePositionLine,
  bridgeStatus,
  bridgeSubtitle,
  categoryLabel,
  droppedByHardLineNote,
  droppedOverLengthNote,
  editFields,
  editPatch,
  editValues,
  finalizeAction,
  finalizeReviewPhase,
  itemTag,
  reviewTitle,
  undoBehindBridge,
} from '../src/lib/finalize-review';

function summaryItem(overrides: Partial<FinalizeReviewItemResponse> = {}): FinalizeReviewItemResponse {
  return {
    id: '1',
    category: 'summary',
    triage: 'consequential',
    basis: 'inferred',
    subjectKey: 'summary',
    claim: 'What standard chapters will read about this chapter: Tamsin leaves the harbour.',
    evidence: null,
    proposed: { category: 'summary', text: 'Tamsin leaves the harbour.' },
    edited: null,
    flag: null,
    dependents: null,
    decision: null,
    reason: null,
    autoKept: false,
    decidedAt: null,
    ...overrides,
  };
}

function bridgeReview(overrides: Partial<FinalizeReviewResponse> = {}): FinalizeReviewResponse {
  return {
    id: '12',
    chapter: 4,
    draftRevision: 5,
    status: 'ready',
    current: true,
    isolated: true,
    bridgeOnly: true,
    appliedRevision: null,
    error: null,
    disclosure: { clear: true, findings: [], copy: 'No unplanned disclosure detected · revision 5' },
    open: { consequential: 1, routine: 0 },
    consequential: [summaryItem()],
    routine: [],
    autoKeep: [],
    appliedAt: null,
    revertedAt: null,
    ...overrides,
  };
}

const UNAPPROVED = { approved: false, revision: 5 };

describe('summary category', () => {
  it('should label the summary as what later chapters see and tag it by category, not as an interpretation', () => {
    expect(categoryLabel('summary')).toBe('Summary later chapters see');
    expect(itemTag(summaryItem())).toEqual({ label: 'Summary later chapters see', intent: 'accent' });
  });

  it('should never offer the summary as an auto-keep switch, even if the settings hold it', () => {
    expect(autoKeepChoices(bridgeReview({ autoKeep: ['summary'] }))).toEqual([]);
  });

  it('should edit the summary as one required long text', () => {
    expect(editFields(summaryItem().proposed)).toEqual([{ key: 'text', label: 'What later chapters read', kind: 'longText', required: true }]);
    expect(editValues(summaryItem())).toEqual({ text: 'Tamsin leaves the harbour.' });
    expect(editPatch(summaryItem(), { text: 'Tamsin leaves at dawn.' })).toEqual({ patch: { text: 'Tamsin leaves at dawn.' } });
    expect(editPatch(summaryItem(), { text: '  ' })).toEqual({ problem: 'What later chapters read can’t be empty.' });
  });
});

describe('bridge-only review', () => {
  it('should be bridging while its summary waits and bridged once answered', () => {
    expect(finalizeReviewPhase(bridgeReview(), null, undefined)).toEqual({ kind: 'bridging', open: 1 });
    expect(finalizeReviewPhase(bridgeReview({ open: { consequential: 0, routine: 0 } }), null, { ready: false, blockers: [] })).toEqual({ kind: 'bridged' });
  });

  it('should still show a stale bridge-only review as invalidated', () => {
    expect(finalizeReviewPhase(bridgeReview({ current: false }), null, undefined)).toEqual({ kind: 'invalidated' });
  });

  it('should offer no finalize, since a bridge changes no Story Bible records', () => {
    expect(finalizeAction({ kind: 'bridging', open: 1 }, { ready: true, blockers: [] })).toBeNull();
    expect(finalizeAction({ kind: 'bridged' }, { ready: true, blockers: [] })).toBeNull();
  });

  it('should title a bridge apart from a finalize review and say it changes no records', () => {
    expect(reviewTitle(4, bridgeReview())).toBe('Bridge for the chapters after chapter 4');
    expect(reviewTitle(4, bridgeReview({ bridgeOnly: false }))).toBe('Finalize chapter 4 — what it changes in your Story Bible');
    expect(reviewTitle(4, undefined)).toBe('Finalize chapter 4 — what it changes in your Story Bible');
    expect(bridgeSubtitle(bridgeReview())).toContain('changes no Story Bible records');
  });
});

describe('bridgeStatus', () => {
  const answered = { consequential: [summaryItem({ decision: 'kept' })], open: { consequential: 0, routine: 0 } };

  it('should be approved whatever the chapter’s status once something crosses', () => {
    expect(bridgeStatus({ approved: true, revision: 5 }, true, undefined)).toEqual({ kind: 'approved', replacing: false });
    expect(bridgeStatus({ approved: true, revision: 5 }, false, bridgeReview({ bridgeOnly: false, ...answered }))).toEqual({ kind: 'approved', replacing: false });
  });

  it('should keep the approved bridge crossing while a newer one is read or its summary waits', () => {
    expect(bridgeStatus({ approved: true, revision: 5 }, true, bridgeReview())).toEqual({ kind: 'approved', replacing: true });
    expect(bridgeStatus({ approved: true, revision: 5 }, true, bridgeReview({ status: 'preparing', consequential: [] }))).toEqual({ kind: 'approved', replacing: true });
    expect(bridgeStatus({ approved: true, revision: 5 }, true, bridgeReview({ current: false }))).toEqual({ kind: 'approved', replacing: false });
  });

  it('should wait on the finalize review for an unfinished chapter', () => {
    expect(bridgeStatus(UNAPPROVED, false, bridgeReview({ bridgeOnly: false }))).toEqual({ kind: 'awaiting' });
  });

  it('should point at a bridge-only review of the current text instead of reading it again', () => {
    expect(bridgeStatus(UNAPPROVED, true, bridgeReview())).toEqual({ kind: 'reading' });
    expect(bridgeStatus(UNAPPROVED, true, bridgeReview({ status: 'preparing', consequential: [] }))).toEqual({ kind: 'reading' });
  });

  it('should say nothing was kept once a bridge-only review is answered without keeping its summary', () => {
    expect(bridgeStatus(UNAPPROVED, true, bridgeReview({ consequential: [summaryItem({ decision: 'skipped' })], open: { consequential: 0, routine: 0 } }))).toEqual({
      kind: 'empty',
    });
  });

  it('should leave a failed bridge-only read to the review’s own prepare-again, offering no second one', () => {
    expect(bridgeStatus(UNAPPROVED, true, bridgeReview({ status: 'failed' }))).toEqual({ kind: 'failed' });
    expect(bridgeStatus(UNAPPROVED, true, bridgeReview({ status: 'failed', current: false, draftRevision: 4 }))).toEqual({ kind: 'missing', stale: true });
  });

  it('should call the bridge stale when the newest review read an older revision, and missing otherwise', () => {
    expect(bridgeStatus(UNAPPROVED, true, bridgeReview({ bridgeOnly: false, status: 'applied', draftRevision: 3, current: false, ...answered }))).toEqual({
      kind: 'missing',
      stale: true,
    });
    expect(bridgeStatus(UNAPPROVED, true, bridgeReview({ current: false, draftRevision: 4 }))).toEqual({ kind: 'missing', stale: true });
    expect(bridgeStatus(UNAPPROVED, true, undefined)).toEqual({ kind: 'missing', stale: false });
  });
});

describe('bridge presentation', () => {
  it('should put where a character stands and their conditions on one line', () => {
    expect(bridgePositionLine({ entityKey: 'tamsin', location: 'harbour wall', conditions: ['cold', 'limping'] })).toBe('tamsin — at harbour wall, cold, limping');
    expect(bridgePositionLine({ entityKey: 'hollis', location: null, conditions: ['asleep'] })).toBe('hollis — asleep');
  });

  it('should explain lines dropped at the hard line, and say nothing when none were', () => {
    expect(droppedByHardLineNote(0)).toBeNull();
    expect(droppedByHardLineNote(1)).toStartWith('One approved line was left out because it crosses the hard line');
    expect(droppedByHardLineNote(3)).toStartWith('3 approved lines were left out because they cross the hard line');
  });

  it('should explain places and conditions too long to carry over, and say nothing when none were', () => {
    expect(droppedOverLengthNote(0)).toBeNull();
    expect(droppedOverLengthNote(1)).toStartWith('One place or condition was too long to carry over');
    expect(droppedOverLengthNote(2)).toStartWith('2 places and conditions were too long to carry over');
  });
});

describe('undoBehindBridge', () => {
  it('should name the applied revision behind a bridge-only review of the latest final chapter', () => {
    expect(undoBehindBridge(bridgeReview({ appliedRevision: 3 }), true)).toBe(3);
  });

  it('should offer nothing once the updates are undone or none were applied', () => {
    expect(undoBehindBridge(bridgeReview({ appliedRevision: null }), true)).toBeNull();
    expect(undoBehindBridge(bridgeReview({ appliedRevision: undefined }), true)).toBeNull();
  });

  it('should offer nothing for an earlier final chapter, or where the finalize review’s own Undo applies', () => {
    expect(undoBehindBridge(bridgeReview({ appliedRevision: 3 }), false)).toBeNull();
    expect(undoBehindBridge(bridgeReview({ bridgeOnly: false, status: 'applied', appliedRevision: 3 }), true)).toBeNull();
    expect(undoBehindBridge(undefined, true)).toBeNull();
  });
});
