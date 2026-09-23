import { describe, expect, it } from 'bun:test';

import { computeNextStep, deriveNextStepInput, type NextStepInput, type NextStepStateInput } from '../src/lib/next-step';

function input(overrides: Partial<NextStepInput> = {}): NextStepInput {
  return {
    volumesTotal: 3,
    planApproved: true,
    draftsTotal: 10,
    draftsFinal: 10,
    briefsRemaining: 0,
    arcsLeft: false,
    reviewQueueCount: 0,
    ...overrides,
  };
}

describe('computeNextStep for a novel still in its Blueprint', () => {
  it('should send the author back to the Blueprint rather than telling them to build the plan by hand', () => {
    const result = computeNextStep(input({ blueprintStage: 'blueprint', blueprintPhaseLabel: 'Spine', volumesTotal: 0, planApproved: false, draftsTotal: 0, draftsFinal: 0 }));

    expect(result.next).toMatchObject({ id: 'continue-blueprint', label: 'Continue the Blueprint', target: { screen: 'blueprint' } });
    expect(result.next?.reason).toContain('Spine');
    expect(result.comingUp.map(item => item.id)).toEqual(['open-workspace', 'generate-chapter']);
  });

  it('should offer the gate once every required step is locked', () => {
    const result = computeNextStep(input({ blueprintStage: 'blueprint', blueprintComplete: true, volumesTotal: 0, planApproved: false, draftsTotal: 0, draftsFinal: 0 }));

    expect(result.next).toMatchObject({ id: 'continue-blueprint', label: 'Open the gate', target: { screen: 'blueprint' } });
  });

  it('should still put a contradicted chapter first, because a Blueprint-stage novel can already have drafts', () => {
    expect(computeNextStep(input({ blueprintStage: 'blueprint', contradictedChapter: 4 })).next?.id).toBe('repair-chapter');
  });

  it('should go back to the Workspace roadmap once the gate is open', () => {
    const result = computeNextStep(input({ blueprintStage: 'workspace', briefsRemaining: 3, nextBriefChapter: 1 }));

    expect(result.next?.id).toBe('generate-chapter');
  });
});

describe('computeNextStep', () => {
  it('should send a first-time novelist to the story bible when nothing is outlined yet', () => {
    const result = computeNextStep(input({ volumesTotal: 0, planApproved: false, draftsTotal: 0, draftsFinal: 0 }));
    expect(result.next).toMatchObject({ id: 'build-plan', target: { screen: 'story-bible' } });
    expect(result.comingUp.map(item => item.id)).toEqual(['approve-plan', 'generate-chapter', 'plan-next-arc']);
  });

  it('should ask for plan approval once volumes exist but are not approved', () => {
    const result = computeNextStep(input({ volumesTotal: 3, planApproved: false, draftsTotal: 0, draftsFinal: 0 }));
    expect(result.next).toMatchObject({ id: 'approve-plan', target: { screen: 'volumes' } });
    expect(result.comingUp.map(item => item.id)).toEqual(['generate-chapter', 'plan-next-arc', 'finalize-chapters']);
  });

  it('should point at the specific next chapter once briefs are outlined but not all drafted', () => {
    const result = computeNextStep(input({ briefsRemaining: 4, nextBriefChapter: 7 }));
    expect(result.next).toMatchObject({ id: 'generate-chapter', label: 'Generate chapter 7', target: { screen: 'chapters', chapter: 7 } });
  });

  it('should fall back to a generic generate label when the next brief chapter is unknown', () => {
    const result = computeNextStep(input({ briefsRemaining: 2 }));
    expect(result.next?.label).toBe('Generate the next chapter');
  });

  it('should prefer generating over planning the next arc when both conditions hold, but preview the arc next', () => {
    const result = computeNextStep(input({ briefsRemaining: 2, nextBriefChapter: 9, arcsLeft: true, nextArcVolumeKey: 'v2' }));
    expect(result.next?.id).toBe('generate-chapter');
    expect(result.comingUp[0]).toEqual({ id: 'plan-next-arc', label: 'Plan the next arc' });
  });

  it('should ask to plan the next arc once briefs run out early and the volume plan still has range left', () => {
    const result = computeNextStep(input({ briefsRemaining: 0, arcsLeft: true, nextArcVolumeKey: 'v3' }));
    expect(result.next).toMatchObject({ id: 'plan-next-arc', target: { screen: 'volumes', volumeKey: 'v3' } });
  });

  it('should ask to finalize through the chat assistant once every outlined chapter is drafted and approved', () => {
    const result = computeNextStep(input({ draftsTotal: 10, draftsFinal: 6, briefsRemaining: 0, arcsLeft: false, reviewQueueCount: 0, notFinalChapterRange: '7–10' }));
    expect(result.next).toMatchObject({
      id: 'finalize-chapters',
      target: { screen: 'chat' },
      reason: 'Every drafted chapter is approved — ask the assistant to finalize chapters 7–10.',
    });
  });

  it('should give a generic finalize reason when the not-final chapter range is unknown', () => {
    const result = computeNextStep(input({ draftsTotal: 10, draftsFinal: 6, briefsRemaining: 0, arcsLeft: false, reviewQueueCount: 0 }));
    expect(result.next?.reason).toBe('Every drafted chapter is approved — ask the assistant to finalize them.');
  });

  it('should use singular phrasing in the finalize reason for a single not-final chapter', () => {
    const result = computeNextStep(input({ draftsTotal: 10, draftsFinal: 9, briefsRemaining: 0, arcsLeft: false, reviewQueueCount: 0, notFinalChapterRange: '10' }));
    expect(result.next?.reason).toBe('Every drafted chapter is approved — ask the assistant to finalize chapter 10.');
  });

  it('should not offer to finalize while anything is still pending review', () => {
    const result = computeNextStep(input({ draftsTotal: 10, draftsFinal: 6, briefsRemaining: 0, arcsLeft: false, reviewQueueCount: 2 }));
    expect(result.next?.id).toBe('review-queue');
  });

  it('should report nothing left to do once the project is fully drafted, approved, and finalized', () => {
    const result = computeNextStep(input({ draftsTotal: 10, draftsFinal: 10, briefsRemaining: 0, arcsLeft: false, reviewQueueCount: 0 }));
    expect(result.next).toBeUndefined();
    expect(result.comingUp).toEqual([]);
  });

  it('should send a contradicted draft to repair, with the review drawer flagged open, before anything else pending', () => {
    const result = computeNextStep(input({ contradictedChapter: 5, reviewQueueCount: 3, briefsRemaining: 2, nextBriefChapter: 11, arcsLeft: true }));
    expect(result.next).toMatchObject({ id: 'repair-chapter', label: 'Repair chapter 5', target: { screen: 'chapters', chapter: 5, review: true } });
  });

  it('should surface the review queue as coming up right after a repair, since the contradiction is itself in that queue', () => {
    const result = computeNextStep(input({ contradictedChapter: 5, reviewQueueCount: 1, briefsRemaining: 2, nextBriefChapter: 11 }));
    expect(result.comingUp[0]).toMatchObject({ id: 'review-queue', label: 'Review 1 item' });
  });

  it('should send pending review items to the queue when nothing is contradicted', () => {
    const result = computeNextStep(input({ reviewQueueCount: 3 }));
    expect(result.next).toMatchObject({ id: 'review-queue', label: 'Review 3 items', target: { screen: 'review' } });
  });

  it('should cap the coming-up preview at three items', () => {
    const result = computeNextStep(input({ volumesTotal: 0, planApproved: false, draftsTotal: 0, draftsFinal: 0 }));
    expect(result.comingUp.length).toBeLessThanOrEqual(3);
  });
});

function state(overrides: Partial<NextStepStateInput> = {}): NextStepStateInput {
  return {
    volumesTotal: 1,
    planApproved: true,
    draftsTotal: 0,
    draftsFinal: 0,
    briefs: [],
    volumes: [],
    draftedChapters: [],
    reviewDrafts: [],
    pendingContinuityCount: 0,
    pendingRefinementCount: 0,
    ...overrides,
  };
}

describe('deriveNextStepInput', () => {
  it('should pick the lowest brief chapter that truly has no draft, not the one at the drafted-count position', () => {
    // Regression: briefs 1-3 outlined, chapters 1 and 3 drafted but chapter 2 is not — a positional
    // guess off the draft count (2) would wrongly land on chapter 3, which already has a draft.
    const result = deriveNextStepInput(
      state({
        briefs: [{ chapter: 1 }, { chapter: 2 }, { chapter: 3 }],
        draftedChapters: [
          { chapter: 1, status: 'final' },
          { chapter: 3, status: 'draft' },
        ],
      }),
    );
    expect(result.briefsRemaining).toBe(1);
    expect(result.nextBriefChapter).toBe(2);
  });

  it('should pick the lowest un-drafted brief chapter even when brief numbering has gaps', () => {
    const result = deriveNextStepInput(
      state({
        briefs: [{ chapter: 1 }, { chapter: 2 }, { chapter: 3 }, { chapter: 5 }, { chapter: 6 }],
        draftedChapters: [
          { chapter: 1, status: 'final' },
          { chapter: 2, status: 'final' },
          { chapter: 3, status: 'final' },
        ],
      }),
    );
    expect(result.briefsRemaining).toBe(2);
    expect(result.nextBriefChapter).toBe(5);
  });

  it('should leave the next brief chapter unset once every outlined brief has a draft', () => {
    const result = deriveNextStepInput(
      state({
        briefs: [{ chapter: 1 }, { chapter: 2 }],
        draftedChapters: [
          { chapter: 1, status: 'final' },
          { chapter: 2, status: 'draft' },
        ],
      }),
    );
    expect(result.briefsRemaining).toBe(0);
    expect(result.nextBriefChapter).toBeUndefined();
  });

  it('should collapse the not-final chapters into a range for the finalize reason text', () => {
    const result = deriveNextStepInput(
      state({
        draftedChapters: [
          { chapter: 1, status: 'final' },
          { chapter: 2, status: 'draft' },
          { chapter: 3, status: 'draft' },
          { chapter: 5, status: 'draft' },
        ],
      }),
    );
    expect(result.notFinalChapterRange).toBe('2–3, 5');
  });

  it('should leave the not-final chapter range unset once every draft is final', () => {
    const result = deriveNextStepInput(
      state({
        draftedChapters: [
          { chapter: 1, status: 'final' },
          { chapter: 2, status: 'final' },
        ],
      }),
    );
    expect(result.notFinalChapterRange).toBeUndefined();
  });

  it('should size a volume from its target chapter count when its end chapter is not set yet', () => {
    const result = deriveNextStepInput(
      state({ volumes: [{ volumeKey: 'v1', ordinal: 1, startChapter: 1, endChapter: null, targetChapterCount: 12 }], briefs: [{ chapter: 1, volumeKey: 'v1' }] }),
    );
    expect(result.arcsLeft).toBe(true);
    expect(result.nextArcVolumeKey).toBe('v1');
  });

  it('should report no arcs left once briefs cover every volume’s planned chapter range', () => {
    const result = deriveNextStepInput(
      state({
        volumes: [{ volumeKey: 'v1', ordinal: 1, startChapter: 1, endChapter: 3 }],
        briefs: [
          { chapter: 1, volumeKey: 'v1' },
          { chapter: 2, volumeKey: 'v1' },
          { chapter: 3, volumeKey: 'v1' },
        ],
      }),
    );
    expect(result.arcsLeft).toBe(false);
    expect(result.nextArcVolumeKey).toBeUndefined();
  });

  it('should offer the earliest volume by ordinal that still needs more arcs', () => {
    const result = deriveNextStepInput(
      state({
        volumes: [
          { volumeKey: 'v1', ordinal: 1, startChapter: 1, endChapter: 3 },
          { volumeKey: 'v2', ordinal: 2, startChapter: 4, endChapter: 6 },
        ],
        briefs: [
          { chapter: 1, volumeKey: 'v1' },
          { chapter: 2, volumeKey: 'v1' },
          { chapter: 3, volumeKey: 'v1' },
          { chapter: 4, volumeKey: 'v2' },
        ],
      }),
    );
    expect(result.nextArcVolumeKey).toBe('v2');
  });

  it('should surface the lowest contradicted chapter when more than one draft is flagged', () => {
    const result = deriveNextStepInput(
      state({
        reviewDrafts: [
          { chapter: 9, reviewStatus: 'contradiction' },
          { chapter: 4, reviewStatus: 'contradiction' },
          { chapter: 6, reviewStatus: 'needs_review' },
        ],
      }),
    );
    expect(result.contradictedChapter).toBe(4);
  });

  it('should combine queued drafts with pending continuity and refinement proposals into one review-queue count', () => {
    const result = deriveNextStepInput(state({ reviewDrafts: [{ chapter: 1, reviewStatus: 'needs_review' }], pendingContinuityCount: 2, pendingRefinementCount: 1 }));
    expect(result.reviewQueueCount).toBe(4);
  });
});
