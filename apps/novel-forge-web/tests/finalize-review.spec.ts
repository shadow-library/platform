import { describe, expect, it } from 'bun:test';

import { type FinalizeReviewItemResponse, type FinalizeReviewResponse } from '../src/lib/apis/api-types.gen';
import { ApiError } from '../src/lib/apis/transport';
import {
  askedItems,
  autoKeepChoices,
  confidentItems,
  confidentSummary,
  decisionAnnouncement,
  decisionMode,
  decisionsCaption,
  decisionsPhase,
  decisionsTitle,
  decisionTag,
  editable,
  editPatch,
  editValues,
  evidenceLine,
  finalizeAction,
  finalizeBlockers,
  finalizeLabel,
  finalizeReviewPhase,
  fixChapterNote,
  isCanonConflict,
  itemStakes,
  itemTag,
  keepAllLabel,
  keptCount,
  latestFinalChapter,
  nextOpenItemId,
  pendingCaption,
  receiptLine,
  receiptTitle,
  storyBibleReceipt,
  storyBibleWritten,
  toggledAutoKeep,
} from '../src/lib/finalize-review';

function item(overrides: Partial<FinalizeReviewItemResponse> = {}): FinalizeReviewItemResponse {
  return {
    id: '1',
    category: 'character_state',
    triage: 'consequential',
    basis: 'observed',
    subjectKey: 'tamsin',
    claim: 'tamsin is now on the harbour wall',
    evidence: 'she read the line again',
    proposed: { category: 'character_state', state: { entityKey: 'tamsin', location: 'harbour wall', conditions: ['cold'], immediateGoal: null, statusNote: 'wary' } },
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

function review(overrides: Partial<FinalizeReviewResponse> = {}): FinalizeReviewResponse {
  return {
    id: '9',
    chapter: 4,
    draftRevision: 3,
    status: 'ready',
    current: true,
    isolated: false,
    bridgeOnly: false,
    error: null,
    disclosure: { clear: true, findings: [], copy: 'No unplanned disclosure detected · revision 3' },
    open: { consequential: 1, routine: 1 },
    consequential: [item()],
    routine: [item({ id: '2', category: 'appearance', triage: 'routine', proposed: { category: 'appearance', entityKey: 'hollis' } })],
    autoKeep: [],
    appliedAt: null,
    revertedAt: null,
    ...overrides,
  };
}

const ANSWERED = { open: { consequential: 0, routine: 0 } };

describe('finalizeReviewPhase', () => {
  it('should be loading until the review or an error arrives', () => {
    expect(finalizeReviewPhase(undefined, null, undefined)).toEqual({ kind: 'loading' });
  });

  it('should tell a chapter with no review apart from a failed load', () => {
    expect(finalizeReviewPhase(undefined, new ApiError(404, { code: 'FRV_001', type: 'NOT_FOUND', message: 'approve it first' }), undefined)).toEqual({ kind: 'missing' });
    expect(finalizeReviewPhase(undefined, new ApiError(500, { code: 'S001', type: 'SERVER', message: 'down' }), undefined)).toEqual({ kind: 'error', message: 'down' });
  });

  it('should be preparing while the updates are read, and failed with the reason when reading stopped', () => {
    expect(finalizeReviewPhase(review({ status: 'preparing' }), null, undefined)).toEqual({ kind: 'preparing' });
    expect(finalizeReviewPhase(review({ status: 'failed', error: 'model timed out' }), null, undefined)).toEqual({ kind: 'failed', error: 'model timed out' });
  });

  it('should be invalidated once the prose moved past the approved revision, whatever the read did', () => {
    expect(finalizeReviewPhase(review({ current: false }), null, { ready: true, blockers: [] })).toEqual({ kind: 'invalidated' });
    expect(finalizeReviewPhase(review({ current: false, status: 'preparing' }), null, undefined)).toEqual({ kind: 'invalidated' });
  });

  it('should be answering while any update waits, counting both kinds', () => {
    expect(finalizeReviewPhase(review(), null, undefined)).toEqual({ kind: 'answering', open: 2 });
  });

  it('should be finalizable only when every update is answered and the server says ready', () => {
    expect(finalizeReviewPhase(review(ANSWERED), null, { ready: true, blockers: [] })).toEqual({ kind: 'finalizable' });
  });

  it('should stay answered with the server’s reasons when something else still blocks finalize', () => {
    const readiness = { ready: false, blockers: [{ code: 'FRV_006', message: 'This chapter reveals the-rook-line, which needs milestone m1' }] };
    expect(finalizeReviewPhase(review(ANSWERED), null, readiness)).toEqual({ kind: 'answered', blockers: ['This chapter reveals the-rook-line, which needs milestone m1'] });
    expect(finalizeReviewPhase(review(ANSWERED), null, undefined)).toEqual({ kind: 'answered', blockers: [] });
  });

  it('should show an applied or reverted review as settled even after the prose moved', () => {
    expect(finalizeReviewPhase(review({ status: 'applied', current: false }), null, undefined)).toEqual({ kind: 'applied' });
    expect(finalizeReviewPhase(review({ status: 'reverted' }), null, undefined)).toEqual({ kind: 'reverted' });
  });
});

describe('finalizeAction', () => {
  it('should offer the plain finalize to a chapter approved before reviews existed, gated on readiness', () => {
    expect(finalizeAction({ kind: 'missing' }, { ready: true, blockers: [] })).toEqual({ kind: 'unreviewed', enabled: true });
    expect(finalizeAction({ kind: 'missing' }, { ready: false, blockers: [{ code: 'FIN_001', message: 'in order' }] })).toEqual({ kind: 'unreviewed', enabled: false });
    expect(finalizeAction({ kind: 'missing' }, undefined)).toEqual({ kind: 'unreviewed', enabled: false });
  });

  it('should finalize through the review only once it is finalizable', () => {
    expect(finalizeAction({ kind: 'answering', open: 2 }, undefined)).toEqual({ kind: 'reviewed', enabled: false });
    expect(finalizeAction({ kind: 'answered', blockers: ['x'] }, undefined)).toEqual({ kind: 'reviewed', enabled: false });
    expect(finalizeAction({ kind: 'finalizable' }, { ready: true, blockers: [] })).toEqual({ kind: 'reviewed', enabled: true });
  });

  it('should offer no finalize while the review is read, failed, stale or settled', () => {
    for (const kind of ['loading', 'preparing', 'invalidated', 'applied', 'reverted'] as const) expect(finalizeAction({ kind }, { ready: true, blockers: [] })).toBeNull();
    expect(finalizeAction({ kind: 'failed', error: null }, undefined)).toBeNull();
  });
});

describe('finalizeBlockers', () => {
  it('should drop the open-items count the review already shows and keep every other reason in order', () => {
    const readiness = {
      ready: false,
      blockers: [
        { code: 'FRV_005', message: 'Review the Story Bible updates first: 2 still need an answer' },
        { code: 'FIN_001', message: 'Chapters must be finalized in order' },
      ],
    };
    expect(finalizeBlockers(readiness)).toEqual(['Chapters must be finalized in order']);
    expect(finalizeBlockers({ ready: true, blockers: [] })).toEqual([]);
  });
});

describe('item presentation', () => {
  it('should tag a flag before the basis, and the basis before the category', () => {
    expect(itemTag(item({ flag: 'missed_milestone', basis: 'inferred' })).label).toBe('Missed milestone');
    expect(itemTag(item({ basis: 'inferred' }))).toEqual({ label: 'Interpretation', intent: 'warning' });
    expect(itemTag(item({ category: 'promise' })).label).toBe('Promise');
  });

  it('should name the dependent reveals a missed milestone strands', () => {
    expect(itemStakes(item({ flag: 'missed_milestone', dependents: ['rook-line', 'ledger-truth'] }))).toBe(
      'Keeping it locked leaves rook-line, ledger-truth without the milestone it needs.',
    );
    expect(itemStakes(item())).toBeNull();
  });

  it('should quote the evidence line, and show an isolated chapter’s placeholder as-is', () => {
    expect(evidenceLine('she read the line again')).toEqual({ label: 'From the chapter:', text: '“she read the line again”' });
    expect(evidenceLine('[excerpt withheld: unrestricted chapter]')).toEqual({ label: null, text: '[excerpt withheld: unrestricted chapter]' });
    expect(evidenceLine(null)).toBeNull();
  });

  it('should map decisions onto the Keep/Edit/Skip control and leave an open item unselected', () => {
    expect(decisionMode('kept')).toBe('keep');
    expect(decisionMode('edited')).toBe('edit');
    expect(decisionMode('skipped')).toBe('skip');
    expect(decisionMode(null)).toBe('');
  });
});

describe('inline edit', () => {
  it('should offer no edit for an appearance', () => {
    expect(editable(item({ category: 'appearance', proposed: { category: 'appearance', entityKey: 'hollis' } }))).toBe(false);
    expect(editable(item())).toBe(true);
  });

  it('should start from the earlier edit when the item was kept as edited', () => {
    const edited = item({ decision: 'edited', edited: { category: 'character_state', state: { entityKey: 'tamsin', location: 'lamp room' } } });
    expect(editValues(edited).location).toBe('lamp room');
    expect(editValues(item()).conditions).toBe('cold');
  });

  it('should send only the changed fields, never the keys that name the record', () => {
    const result = editPatch(item(), { ...editValues(item()), statusNote: 'afraid', conditions: 'cold, soaked' });
    expect(result).toEqual({ patch: { statusNote: 'afraid', conditions: ['cold', 'soaked'] } });
  });

  it('should clear a blanked optional field and refuse a blank required one', () => {
    expect(editPatch(item(), { ...editValues(item()), statusNote: '  ' })).toEqual({ patch: { statusNote: null } });
    const knowledge = item({ category: 'knowledge', proposed: { category: 'knowledge', entityKey: 'tamsin', factKey: 'rook', how: 'reads the ledger' } });
    expect(editPatch(knowledge, { how: ' ' })).toEqual({ problem: 'How they learn it can’t be empty.' });
  });

  it('should refuse an edit that is just the proposal', () => {
    expect(editPatch(item(), editValues(item()))).toEqual({ problem: 'This is what was proposed — choose Keep to record it as it is.' });
  });

  it('should keep the first edit’s changes when the item is edited again, since the server lays the patch over the proposal', () => {
    const first = editPatch(item(), { ...editValues(item()), location: 'lamp room' });
    expect(first).toEqual({ patch: { location: 'lamp room' } });
    const once = item({
      decision: 'edited',
      edited: { category: 'character_state', state: { entityKey: 'tamsin', location: 'lamp room', conditions: ['cold'], immediateGoal: null, statusNote: 'wary' } },
    });
    expect(editPatch(once, { ...editValues(once), statusNote: 'afraid' })).toEqual({ patch: { location: 'lamp room', statusNote: 'afraid' } });
  });

  it('should edit a milestone as reached or not, and a promise’s status among its own values', () => {
    const milestone = item({ category: 'milestone', proposed: { category: 'milestone', milestoneKey: 'm1', reached: false } });
    expect(editPatch(milestone, { reached: true })).toEqual({ patch: { reached: true } });
    const thread = item({ category: 'promise', proposed: { category: 'promise', thread: { threadKey: 't1', status: 'open', summary: 'who hid her' } } });
    expect(editPatch(thread, { ...editValues(thread), status: 'closed' })).toEqual({ patch: { status: 'closed' } });
  });
});

describe('review counts and labels', () => {
  it('should count kept and edited updates for the finalize label', () => {
    const answered = review({
      consequential: [item({ decision: 'edited' })],
      routine: [item({ id: '2', triage: 'routine', decision: 'kept' }), item({ id: '3', decision: 'skipped' })],
    });
    expect(keptCount(answered)).toBe(2);
    expect(finalizeLabel(2)).toBe('Finalize and keep 2 updates');
    expect(finalizeLabel(1)).toBe('Finalize and keep 1 update');
    expect(finalizeLabel(0)).toBe('Finalize without updates');
  });

  it('should offer Keep all while routine updates wait, then say how they were answered', () => {
    expect(keepAllLabel(review())).toBe('Keep all');
    expect(keepAllLabel(review({ open: { consequential: 0, routine: 0 }, routine: [item({ triage: 'routine', decision: 'kept' })] }))).toBe('All kept');
    expect(keepAllLabel(review({ open: { consequential: 0, routine: 0 }, routine: [item({ triage: 'routine', decision: 'skipped' })] }))).toBe('All answered');
  });

  it('should move on to the next open update, wrapping around, and stop when none is left', () => {
    const items = [item({ id: 'a', decision: 'kept' }), item({ id: 'b' }), item({ id: 'c', decision: 'kept' }), item({ id: 'd' })];
    expect(nextOpenItemId(items, 'b')).toBe('d');
    expect(nextOpenItemId(items, 'd')).toBe('b');
    expect(nextOpenItemId([item({ id: 'a', decision: 'kept' })], 'a')).toBeUndefined();
  });

  it('should announce the decision and what is left', () => {
    expect(decisionAnnouncement('skipped', 'Hollis appears', 1)).toBe('Skipped: Hollis appears. 1 still needs your call.');
    expect(decisionAnnouncement('kept', 'Hollis appears', 0)).toBe('Kept: Hollis appears. Every update is answered.');
  });
});

describe('auto-keep', () => {
  it('should offer the categories this review batched plus any already on, never knowledge', () => {
    expect(autoKeepChoices(review({ autoKeep: ['promise'] }))).toEqual(['appearance', 'promise']);
  });

  it('should toggle a category and keep the list in its display order', () => {
    expect(toggledAutoKeep(['promise'], 'appearance', true)).toEqual(['appearance', 'promise']);
    expect(toggledAutoKeep(['appearance', 'promise'], 'appearance', false)).toEqual(['promise']);
  });
});

describe('latestFinalChapter', () => {
  it('should find the highest final chapter, the only one whose updates can be undone', () => {
    expect(
      latestFinalChapter([
        { chapter: 1, status: 'final' },
        { chapter: 2, status: 'final' },
        { chapter: 3, status: 'draft' },
      ]),
    ).toBe(2);
    expect(latestFinalChapter([{ chapter: 1, status: 'draft' }])).toBeUndefined();
  });
});

describe('storyBibleReceipt', () => {
  it('should list what finalize kept, and call it automatic when approval kept every update on its own', () => {
    const kept = item({ id: '2', triage: 'routine', decision: 'kept', autoKept: true });
    const receipt = storyBibleReceipt(review({ consequential: [], routine: [kept, item({ id: '3', triage: 'routine', decision: 'kept', autoKept: true })] }));

    expect(receipt.added.map(entry => entry.id)).toEqual(['2', '3']);
    expect(receipt.automatic).toBe(true);
  });

  it('should not call it automatic once the author answered something, and leave skipped updates off', () => {
    const receipt = storyBibleReceipt(
      review({ consequential: [item({ decision: 'skipped', reason: 'not yet' })], routine: [item({ id: '2', triage: 'routine', decision: 'kept', autoKept: true })] }),
    );

    expect(receipt.added.map(entry => entry.id)).toEqual(['2']);
    expect(receipt.automatic).toBe(false);
  });

  it('should title the receipt by what it added, and say when it added nothing', () => {
    expect(receiptTitle(3, 4)).toBe('Chapter 3: added 4 to the Story Bible');
    expect(receiptTitle(3, 0)).toBe('Chapter 3 is final — nothing new for the Story Bible');
  });

  it('should mark an update the author edited', () => {
    expect(receiptLine({ claim: 'Mira is at the tower', decision: 'edited' })).toBe('Mira is at the tower · as you edited it');
    expect(receiptLine({ claim: 'Mira is at the tower', decision: 'kept' })).toBe('Mira is at the tower');
  });
});

describe('storyBibleWritten', () => {
  it('should count a chapter as written only once its review applied, never for a bridge', () => {
    expect(storyBibleWritten(review({ status: 'applied' }))).toBe(true);
    expect(storyBibleWritten(review({ status: 'ready' }))).toBe(false);
    expect(storyBibleWritten(review({ status: 'applied', bridgeOnly: true }))).toBe(false);
    expect(storyBibleWritten(undefined)).toBe(false);
  });
});

describe('the chat decisions card', () => {
  it('should ask one by one only about the unsure and the conflicting, and batch the confident updates approval left open', () => {
    const shown = review({
      consequential: [item({ decision: 'kept' })],
      routine: [item({ id: '2', triage: 'routine', decision: 'kept', autoKept: true }), item({ id: '3', triage: 'routine' })],
    });

    expect(askedItems(shown).map(entry => entry.id)).toEqual(['1']);
    expect(confidentItems(shown).map(entry => entry.id)).toEqual(['3']);
  });

  it('should sum up the confident batch by what is still open', () => {
    expect(confidentSummary([item({ decision: null }), item({ decision: 'kept' })])).toBe('1 confident addition — taken from the chapter, none conflicting with canon');
    expect(confidentSummary([item({ decision: 'kept' }), item({ decision: 'skipped' })])).toBe('2 confident additions, answered');
  });

  it('should ask to answer each conflict, else to add the confident batch', () => {
    expect(pendingCaption(review())).toBe('Answer each one; Done then makes the chapter final.');
    expect(pendingCaption(review({ open: { consequential: 0, routine: 18 } }))).toBe('Add them all, or review them one by one; the chapter then becomes final.');
  });

  it('should tell a conflict from an unsure update', () => {
    expect(isCanonConflict(item({ flag: 'missed_milestone' }))).toBe(true);
    expect(decisionTag(item({ flag: 'unplanned_disclosure', basis: 'inferred', category: 'knowledge' }))).toEqual({ label: 'conflicts', intent: 'danger' });
    expect(decisionTag(item({ basis: 'inferred' }))).toEqual({ label: 'unsure', intent: 'neutral' });
    expect(decisionTag(item({ basis: 'inferred', category: 'summary' }))).toEqual({ label: 'Summary later chapters see', intent: 'accent' });
  });

  it('should offer the two-way conflict choice for a rename or a reopened promise the server flagged', () => {
    const renamed = item({ category: 'entity', flag: 'renamed_record', claim: 'Renames mira from "Mira" to "Mirabel"' });
    const reopened = item({ category: 'promise', flag: 'reopened_promise', claim: 'Reopens: Mira owes the keeper' });

    expect([renamed, reopened].map(isCanonConflict)).toEqual([true, true]);
    expect([renamed, reopened].map(entry => decisionTag(entry).label)).toEqual(['conflicts', 'conflicts']);
    expect([renamed, reopened].map(entry => itemTag(entry).label)).toEqual(['Renames a record', 'Reopens a promise']);
    expect(itemStakes(reopened)).toBe('The Story Bible has this settled; keeping it opens it again.');
  });

  it('should hold a review that asks nothing as settling while its reading job may still be finalizing it', () => {
    expect(decisionsPhase(review(ANSWERED), true)).toBe('settling');
    expect(decisionsPhase(review(ANSWERED), false)).toBe('answered');
    expect(decisionsPhase(review(), true)).toBe('asking');
    expect(decisionsPhase(review({ status: 'preparing' }), false)).toBe('reading');
    expect(decisionsPhase(review({ status: 'failed' }), true)).toBe('failed');
  });

  it('should count what is left to decide, and say when the chapter is ready', () => {
    expect(decisionsTitle(review({ open: { consequential: 2, routine: 3 } }))).toBe('Chapter 4: 2 decisions for the Story Bible');
    expect(decisionsTitle(review({ open: { consequential: 1, routine: 0 } }))).toBe('Chapter 4: 1 decision for the Story Bible');
    expect(decisionsTitle(review({ open: { consequential: 0, routine: 18 } }))).toBe('Chapter 4: 18 additions for the Story Bible');
    expect(decisionsTitle(review(ANSWERED))).toBe('Chapter 4: ready for the Story Bible');
  });

  it('should say what Done writes', () => {
    expect(decisionsCaption(review({ consequential: [item({ decision: 'kept' })], routine: [] }))).toBe('Done makes chapter 4 final and adds 1 update to the Story Bible.');
    expect(decisionsCaption(review({ consequential: [item({ decision: 'skipped' })], routine: [] }))).toBe('Done makes chapter 4 final and adds nothing to the Story Bible.');
  });

  it('should ask for a chapter fix that keeps canon, naming the conflict', () => {
    expect(fixChapterNote({ claim: 'Mira learns the lamp rule' })).toBe('keep the Story Bible as it is and change the chapter instead — Mira learns the lamp rule');
  });
});
