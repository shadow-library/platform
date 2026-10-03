import { describe, expect, it } from 'bun:test';

import { type ChapterReviewRecordResponse, type GenerationJobItem, type ListChapterReviewsResponse, type ReviewFindingResponse } from '../src/lib/apis/api-types.gen';
import {
  approvalMessage,
  approvalRefusal,
  blockingHold,
  categoryLabel,
  dispositionView,
  findingState,
  groupFindings,
  holdDetail,
  holdMessage,
  kindDescription,
  kindStatus,
  kindSubline,
  openFindingsNote,
  overrideWarning,
  remedyNote,
  repairSource,
  reviewJobState,
  reviewSettledNotice,
  staleNotice,
  versionLabel,
  visibleForm,
} from '../src/lib/chapter-checks';

const FINDING: ReviewFindingResponse = { id: 'f1', severity: 'warning', category: 'continuity', text: 'The lamp moves rooms.', evidence: 'the lamp in the hall' };
const BLOCKING: ReviewFindingResponse = { id: 'b1', severity: 'blocking', category: 'knowledge', text: 'Tamsin knows about the ledger too early.' };
const OVERRIDDEN: ReviewFindingResponse = { ...BLOCKING, remedy: { action: 'overridden', reason: 'intended', updatedAt: '2026-09-26T10:30:00.000Z' } };
const BLOCKED: Partial<ChapterReviewRecordResponse> = { disposition: 'blocking', findings: [BLOCKING, { ...BLOCKING, id: 'b2' }], openFindings: 2, openBlocking: 2 };

function review(overrides: Partial<ChapterReviewRecordResponse> = {}): ChapterReviewRecordResponse {
  return {
    id: 'r1',
    chapter: 4,
    kind: 'judge',
    disposition: 'issues',
    draftRevision: 2,
    stale: false,
    isolated: false,
    findings: [FINDING],
    openFindings: 1,
    openBlocking: 0,
    checked: ['continuity with the Story Bible'],
    createdAt: '2026-09-26T10:00:00.000Z',
    ...overrides,
  };
}

function list(latest: ChapterReviewRecordResponse[], currentRevision: number | null = 2): ListChapterReviewsResponse {
  return { chapter: 4, currentRevision, latest, history: latest };
}

function job(overrides: Partial<GenerationJobItem> = {}): GenerationJobItem {
  return {
    id: 'j1',
    projectId: 'p1',
    kind: 'review',
    target: 'chapter-4-judge',
    status: 'in_progress',
    attempts: 1,
    createdAt: '2026-09-26T11:00:00.000Z',
    updatedAt: '2026-09-26T11:00:00.000Z',
    usage: { calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0, estimatedCostUsd: 0 },
    ...overrides,
  } as GenerationJobItem;
}

describe('categoryLabel', () => {
  it('should name proofreading findings and say the editor’s read proofreads', () => {
    expect(categoryLabel('proofreading')).toBe('Proofreading');
    expect(kindDescription('editorial')).toContain('proofreading: grammar, spelling, punctuation, tense and point-of-view slips, names and references');
  });
});

describe('versionLabel', () => {
  it('should name the draft revision, or the final text when there is none', () => {
    expect(versionLabel(3)).toBe('version 3');
    expect(versionLabel(null)).toBe('the final text');
  });
});

describe('staleNotice', () => {
  it('should say nothing about a review of the text on screen', () => {
    expect(staleNotice(review(), 2)).toBeUndefined();
  });

  it('should name both versions once the text has moved on', () => {
    expect(staleNotice(review({ stale: true }), 3)).toBe('This review is for version 2. This is version 3. Its findings describe the older text.');
  });

  it('should still call a review stale when the text changed without a new revision', () => {
    expect(staleNotice(review({ stale: true }), 2)).toBe('This review is for version 2. The text has changed since. Its findings describe the older text.');
  });
});

describe('dispositionView', () => {
  it('should say a failed review assessed nothing', () => {
    expect(dispositionView(review({ disposition: 'failed' }))).toEqual({ label: 'Not assessed', intent: 'neutral' });
  });

  it('should suggest a revision while a blocking finding is open', () => {
    expect(dispositionView(review({ disposition: 'blocking', findings: [BLOCKING], openBlocking: 1 }))).toEqual({ label: 'Revision suggested', intent: 'danger' });
  });

  it('should read a review whose findings are all answered as clear', () => {
    expect(dispositionView(review({ disposition: 'blocking', findings: [OVERRIDDEN], openFindings: 0, openBlocking: 0 }))).toEqual({
      label: 'No issue detected',
      intent: 'success',
    });
  });

  it('should keep notes visible while any finding is open', () => {
    expect(dispositionView(review()).label).toBe('Looks good · notes');
  });
});

describe('kindStatus', () => {
  it('should put a running job ahead of the stored review', () => {
    expect(kindStatus(review(), 'running')).toEqual({ label: 'Reviewing…', intent: 'info' });
    expect(kindStatus(undefined, 'queued').label).toBe('Queued');
  });

  it('should tell apart never run, out of date, blocking, open and clear', () => {
    expect(kindStatus(undefined, undefined).label).toBe('Not run');
    expect(kindStatus(review({ stale: true }), undefined).label).toBe('Out of date');
    expect(kindStatus(review({ ...BLOCKED, findings: [...(BLOCKED.findings ?? []), FINDING], openFindings: 3 }), undefined).label).toBe('2 blocking');
    expect(kindStatus(review(), undefined).label).toBe('1 open');
    expect(kindStatus(review({ disposition: 'clear', findings: [], openFindings: 0 }), undefined).label).toBe('No issue');
  });
});

describe('kindSubline', () => {
  it('should show which version was reviewed and which is on screen', () => {
    expect(kindSubline(undefined, 2)).toBe('Not run yet');
    expect(kindSubline(review(), 2)).toBe('Reviewed version 2');
    expect(kindSubline(review({ stale: true }), 3)).toBe('Reviewed version 2 · this is version 3');
  });
});

describe('groupFindings', () => {
  it('should group by severity, blocking first, and drop empty groups', () => {
    const findings: ReviewFindingResponse[] = [
      { ...FINDING, id: 'n', severity: 'note' },
      { ...FINDING, id: 'b', severity: 'blocking' },
      { ...FINDING, id: 'n2', severity: 'note' },
    ];
    expect(groupFindings(findings).map(group => [group.label, group.findings.map(finding => finding.id)])).toEqual([
      ['Blocking', ['b']],
      ['Notes', ['n', 'n2']],
    ]);
  });
});

describe('findingState', () => {
  it('should keep a finding the author will fix open, and settle a dismissed or overridden one', () => {
    const at = '2026-09-26T10:00:00.000Z';
    expect(findingState(FINDING)).toBe('open');
    expect(findingState({ remedy: { action: 'fixing_myself', updatedAt: at } })).toBe('fixing');
    expect(findingState({ remedy: { action: 'dismissed', reason: 'deliberate', updatedAt: at } })).toBe('settled');
    expect(findingState({ remedy: { action: 'overridden', updatedAt: at } })).toBe('settled');
  });
});

describe('remedyNote', () => {
  const at = '2026-09-26T10:00:00.000Z';

  it('should carry the reason a finding was dismissed or overridden', () => {
    expect(remedyNote({ action: 'dismissed', reason: 'the repetition is deliberate', updatedAt: at }, 'warning')).toBe(
      'Dismissed: the repetition is deliberate — won’t be raised again for this text',
    );
    expect(remedyNote({ action: 'overridden', reason: 'approved by the author', updatedAt: at }, 'blocking')).toBe(
      'Overridden: approved by the author — recorded as intended for this text',
    );
  });

  it('should warn that fixing a blocking finding yourself still holds the next chapter', () => {
    expect(remedyNote({ action: 'fixing_myself', updatedAt: at }, 'blocking')).toContain('still holds the next chapter');
    expect(remedyNote({ action: 'fixing_myself', updatedAt: at }, 'note')).toBe('You’ll fix it yourself — rechecked on the next review');
  });
});

describe('reviewJobState', () => {
  it('should follow only this chapter’s review jobs, newest per kind', () => {
    const jobs = [
      job({ id: 'a', status: 'pending' }),
      job({ id: 'old', status: 'failed' }),
      job({ id: 'b', target: 'chapter-4-editorial' }),
      job({ id: 'other', target: 'chapter-14-judge', status: 'pending' }),
      job({ id: 'gen', kind: 'generate', target: '4', status: 'pending' }),
    ];
    expect(reviewJobState(jobs, 4, undefined)).toEqual({ active: { judge: 'queued', editorial: 'running' }, failed: {}, activeIds: ['a', 'b'] });
  });

  it('should claim no failure before the reviews have loaded', () => {
    expect(reviewJobState([job({ status: 'failed' })], 4, undefined).failed).toEqual({});
  });

  it('should report a failed job newer than the kind’s latest review', () => {
    const failed = job({ status: 'failed', lastError: 'The model timed out', updatedAt: '2026-09-26T11:00:00.000Z' });
    expect(reviewJobState([failed], 4, list([review()])).failed).toEqual({ judge: 'The model timed out' });
    expect(reviewJobState([failed], 4, list([review({ createdAt: '2026-09-26T12:00:00.000Z' })])).failed).toEqual({});
  });
});

describe('blockingHold', () => {
  it('should read the open blocking findings of the latest judge review of the current text', () => {
    expect(blockingHold(list([review(BLOCKED)]))).toBe(2);
    expect(blockingHold(list([review({ ...BLOCKED, stale: true })]))).toBe(0);
    expect(blockingHold(list([review({ ...BLOCKED, kind: 'editorial' })]))).toBe(0);
    expect(blockingHold(undefined)).toBe(0);
  });
});

describe('holdMessage', () => {
  it('should name the chapter it holds', () => {
    expect(holdMessage(4, 1)).toBe('Chapter 4 has a blocking finding — chapter 5 waits until you answer it.');
    expect(holdMessage(4, 3)).toBe('Chapter 4 has 3 blocking findings — chapter 5 waits until you answer them.');
  });
});

describe('holdMessage without a current review', () => {
  it('should still say the chapter holds the next one', () => {
    expect(holdMessage(4, 0)).toBe('Chapter 4 has a conflict the judge flagged — chapter 5 waits until it’s resolved.');
  });
});

describe('holdDetail', () => {
  it('should pluralise with the findings and mention the override only when approval is offered', () => {
    expect(holdDetail(1, null, true)).toBe('Fix the text and run the AI review again, dismiss it with a reason, or override it. Approving this version records it as overridden.');
    expect(holdDetail(2, null, false)).toBe('Fix the text and run the AI review again, dismiss them with a reason, or override them.');
  });

  it('should fall back to the draft’s judge note when no current review explains the hold', () => {
    expect(holdDetail(0, '[hard] The ledger burns twice.', false)).toBe(
      '[hard] The ledger burns twice. Run the AI review to see it as findings you can answer, or repair or regenerate the chapter.',
    );
    expect(holdDetail(0, null, false)).toBe('Run the AI review to see it as findings you can answer, or repair or regenerate the chapter.');
  });
});

describe('approvalRefusal', () => {
  it('should withhold approval of a contradiction no current review explains', () => {
    expect(approvalRefusal('contradiction', 0)).toContain('Run the AI review first');
  });

  it('should allow approving over open blocking findings, and anything not a contradiction', () => {
    expect(approvalRefusal('contradiction', 2)).toBeUndefined();
    expect(approvalRefusal('needs_review', 0)).toBeUndefined();
  });
});

describe('overrideWarning', () => {
  it('should count the findings and include those the author will fix', () => {
    expect(overrideWarning(1)).toBe('Approving records 1 blocking finding as overridden — including any you marked “I’ll fix it myself”.');
    expect(overrideWarning(3)).toBe('Approving records 3 blocking findings as overridden — including any you marked “I’ll fix it myself”.');
  });
});

describe('openFindingsNote', () => {
  it('should hand the reviser only open blocking findings and warnings', () => {
    const fixing: ReviewFindingResponse = { ...BLOCKING, id: 'b3', text: 'The tide turns early.', remedy: { action: 'fixing_myself', updatedAt: '2026-09-26T10:30:00.000Z' } };
    const note: ReviewFindingResponse = { ...FINDING, id: 'n1', severity: 'note', text: 'Readability was not assessed.' };
    expect(openFindingsNote({ findings: [OVERRIDDEN, fixing, FINDING, note] })).toBe('[hard] The tide turns early.\n[soft] The lamp moves rooms.');
  });
});

describe('repairSource', () => {
  it('should prefer the current judge review’s open findings over the draft’s note', () => {
    expect(repairSource(list([review({ findings: [OVERRIDDEN, FINDING] })]), '[hard] old')).toBe('[soft] The lamp moves rooms.');
  });

  it('should fall back to the draft’s note when the judge review is stale or missing', () => {
    expect(repairSource(list([review({ stale: true })]), '[hard] old')).toBe('[hard] old');
    expect(repairSource(undefined, '[hard] old')).toBe('[hard] old');
  });
});

describe('reviewSettledNotice', () => {
  it('should word the toast by how the job ended', () => {
    expect(reviewSettledNotice(job({ status: 'done' }), 4)).toEqual({ intent: 'success', message: 'The AI review of chapter 4 is ready — see Checks' });
    expect(reviewSettledNotice(job({ status: 'failed', lastError: 'Timed out' }), 4)).toEqual({ intent: 'danger', message: 'The AI review of chapter 4 failed: Timed out' });
    expect(reviewSettledNotice(job({ status: 'cancelled', target: 'chapter-4-editorial' }), 4)).toEqual({
      intent: 'warning',
      message: 'The editor’s read of chapter 4 was cancelled',
    });
  });

  it('should say nothing about another chapter’s job', () => {
    expect(reviewSettledNotice(job({ status: 'done', target: 'chapter-5-judge' }), 4)).toBeUndefined();
  });
});

describe('approvalMessage', () => {
  it('should say how many findings an approval recorded as overridden', () => {
    expect(approvalMessage(4, 0)).toBe('Chapter 4 approved');
    expect(approvalMessage(4, 1)).toBe('Chapter 4 approved — 1 blocking finding was recorded as overridden');
    expect(approvalMessage(4, 2, true)).toBe('Chapter 4 approved as written — 2 blocking findings were recorded as overridden');
  });
});

describe('visibleForm', () => {
  const form = { kind: 'judge', findingId: 'f1', action: 'dismissed' } as const;
  const reviews = list([review()]);

  it('should keep a form on an open finding of the selected kind while the drawer is open', () => {
    expect(visibleForm(form, reviews, 'judge', true)).toEqual(form);
  });

  it('should drop the form once the drawer closes or another kind is selected, so Escape closes the drawer', () => {
    expect(visibleForm(form, reviews, 'judge', false)).toBeUndefined();
    expect(visibleForm(form, list([review(), review({ id: 'r2', kind: 'editorial' })]), 'editorial', true)).toBeUndefined();
  });

  it('should drop a form whose finding is no longer rendered as open', () => {
    expect(visibleForm({ ...form, findingId: 'gone' }, reviews, 'judge', true)).toBeUndefined();
    expect(visibleForm(form, list([review({ stale: true })]), 'judge', true)).toBeUndefined();
    expect(
      visibleForm(
        form,
        list([review({ findings: [{ ...FINDING, remedy: { action: 'dismissed', reason: 'x', updatedAt: '2026-09-26T10:30:00.000Z' } }], openFindings: 0 })]),
        'judge',
        true,
      ),
    ).toBeUndefined();
    expect(visibleForm(form, undefined, 'judge', true)).toBeUndefined();
  });
});
