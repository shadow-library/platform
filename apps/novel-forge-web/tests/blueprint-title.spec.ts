import { describe, expect, it } from 'bun:test';

import {
  buildTitleSelection,
  checkableTitles,
  checksFor,
  EMPTY_TITLE_DRAFT,
  indexChecks,
  parseTitleGroups,
  restoreTitle,
  restoreTitleDraft,
  titleCandidates,
  type TitleDraft,
  titleRoundKey,
  titlesToCheck,
  toggleStar,
  workingTitleText,
} from '../src/features/blueprint/title-step';
import { type BlueprintRoundResponse, type LedgerEntryResponse, type TitleChecksResponse } from '../src/lib/apis';

function entry(overrides: Partial<LedgerEntryResponse> = {}): LedgerEntryResponse {
  return {
    id: '1',
    projectId: '7',
    kind: 'decision',
    phase: 'heart',
    topic: 'title',
    statement: 'The Memory Tithe',
    why: null,
    rejectedAlternatives: [],
    writerLine: null,
    decidedBy: 'author',
    stepKey: 'title',
    payload: { choiceId: 't1', shortlist: ['What the River Keeps'] },
    links: {},
    supersedesId: null,
    supersededAt: null,
    withdrawnReason: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const OPTIONS = {
  groups: [
    {
      style: 'short_literary',
      label: 'Short and literary',
      titles: [
        { id: 't1', text: 'The Memory Tithe', from: 'the cost rule' },
        { id: 't2', text: 'What the River Keeps', from: 'the theme' },
      ],
    },
    { style: 'web_novel_descriptive', label: 'Web-novel descriptive', titles: [{ id: 't3', text: 'I Collect Memories for a Living', from: 'the hook' }] },
  ],
};

function round(options: unknown = OPTIONS): BlueprintRoundResponse {
  return {
    id: 'r1',
    stepKey: 'title',
    round: 1,
    status: 'ready',
    jobId: null,
    steer: null,
    nudges: [],
    keepAsDirection: false,
    feedback: [],
    input: null,
    focus: null,
    options,
    coachMessage: null,
    error: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as BlueprintRoundResponse;
}

const candidates = titleCandidates(parseTitleGroups(round()));

describe('parseTitleGroups', () => {
  it('should keep the style, its label and the decision each title came from', () => {
    const groups = parseTitleGroups(round());
    expect(groups.map(group => group.label)).toEqual(['Short and literary', 'Web-novel descriptive']);
    expect(groups[0]?.titles[0]).toEqual({ id: 't1', text: 'The Memory Tithe', from: 'the cost rule' });
  });

  it('should read a round of a shape this build does not know as no titles', () => {
    expect(parseTitleGroups(round(null))).toEqual([]);
    expect(parseTitleGroups(round({ groups: [{ style: 'x', titles: [{ id: 1 }] }] }))).toEqual([]);
  });
});

describe('titleRoundKey', () => {
  it('should change when the titles arrive', () => {
    expect(titleRoundKey(round(null))).toBe('r1:pending');
    expect(titleRoundKey(round())).toBe('r1:ready');
  });
});

describe('toggleStar', () => {
  it('should shortlist up to five and refuse a sixth', () => {
    expect(toggleStar([], 't1')).toEqual(['t1']);
    expect(toggleStar(['t1'], 't1')).toEqual([]);
    expect(toggleStar(['a', 'b', 'c', 'd', 'e'], 't1')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('workingTitleText', () => {
  it('should prefer the title the author typed over the one they picked', () => {
    expect(workingTitleText({ ...EMPTY_TITLE_DRAFT, workingId: 't1' }, candidates)).toBe('The Memory Tithe');
    expect(workingTitleText({ ...EMPTY_TITLE_DRAFT, workingId: 't1', ownTitle: ' Mine ' }, candidates)).toBe('Mine');
    expect(workingTitleText(EMPTY_TITLE_DRAFT, candidates)).toBe('');
  });
});

describe('buildTitleSelection', () => {
  const draft: TitleDraft = { workingId: 't1', ownTitle: '', starred: ['t1', 't2'], verdicts: { t3: { verdict: 'not', reason: ' Too long ' } }, why: ' Because. ' };

  it('should send the working title, the rest of the shortlist and the refusals', () => {
    expect(buildTitleSelection(draft, candidates)).toEqual({
      working: { optionId: 't1', text: 'The Memory Tithe' },
      shortlist: ['What the River Keeps'],
      rejected: [{ optionId: 't3', reason: 'Too long' }],
      why: 'Because.',
    });
  });

  it('should send the author’s own title without an option id', () => {
    expect(buildTitleSelection({ ...draft, ownTitle: 'The Ledger of Small Debts' }, candidates)?.working).toEqual({ text: 'The Ledger of Small Debts' });
  });

  it('should never refuse the title it is locking', () => {
    expect(buildTitleSelection({ ...draft, verdicts: { t1: { verdict: 'not', reason: 'A misclick' } } }, candidates)?.rejected).toBeUndefined();
  });

  it('should drop a refusal with no reason, because the reason is what stops it coming back', () => {
    expect(buildTitleSelection({ ...draft, verdicts: { t3: { verdict: 'not', reason: '   ' } } }, candidates)?.rejected).toBeUndefined();
  });

  it('should not turn "more like this" into a rejection', () => {
    expect(buildTitleSelection({ ...draft, verdicts: { t3: { verdict: 'more' } } }, candidates)?.rejected).toBeUndefined();
  });

  it('should refuse to build a lock with no title at all', () => {
    expect(buildTitleSelection(EMPTY_TITLE_DRAFT, candidates)).toBeNull();
  });
});

describe('titlesToCheck', () => {
  it('should check what is on screen, minus what the author has ruled out', () => {
    expect(titlesToCheck(candidates, { ...EMPTY_TITLE_DRAFT, verdicts: { t3: { verdict: 'not', reason: 'No' } } })).toEqual(['The Memory Tithe', 'What the River Keeps']);
  });

  it('should say how many titles a batch leaves out rather than dropping them quietly', () => {
    expect(checkableTitles(candidates, EMPTY_TITLE_DRAFT)).toHaveLength(3);
    expect(titlesToCheck(candidates, EMPTY_TITLE_DRAFT)).toHaveLength(3);
  });

  it('should check the author’s own title first and never the same title twice', () => {
    expect(titlesToCheck(candidates, { ...EMPTY_TITLE_DRAFT, ownTitle: 'The Memory Tithe' })[0]).toBe('The Memory Tithe');
    expect(titlesToCheck(candidates, { ...EMPTY_TITLE_DRAFT, ownTitle: 'The Memory Tithe' })).toHaveLength(3);
  });
});

describe('checksFor', () => {
  const results: TitleChecksResponse[] = [
    {
      title: 'The Memory Tithe',
      catalogFit: { status: 'ok', detail: 'Fits a catalog card' },
      library: { status: 'warn', detail: 'Another novel of yours already has this title' },
      published: { status: 'unknown', detail: 'Not checked' },
    },
  ];

  it('should find a title’s checks whatever its case and spacing', () => {
    expect(checksFor(indexChecks(results), '  the memory tithe ')?.library.status).toBe('warn');
    expect(checksFor(indexChecks(results), 'What the River Keeps')).toBeNull();
  });
});

describe('restoreTitle', () => {
  const refused = entry({ id: '2', kind: 'rejected', topic: 'title.ruled_out', statement: 'I Collect Memories for a Living', why: 'No first-person titles', payload: null });

  it('should read back the working title, the shortlist and the refusals it recorded', () => {
    expect(restoreTitle([entry(), refused])).toEqual({
      workingTitle: 'The Memory Tithe',
      starred: ['What the River Keeps'],
      ruledOut: [{ title: 'I Collect Memories for a Living', reason: 'No first-person titles' }],
    });
  });

  it('should read nothing back before a title is locked', () => {
    expect(restoreTitle([])).toEqual({ workingTitle: '', starred: [], ruledOut: [] });
  });

  it('should resolve the locked title against this round’s ids, so a new round cannot lose it', () => {
    const draft = restoreTitleDraft(EMPTY_TITLE_DRAFT, [entry(), refused], candidates);
    expect(draft.workingId).toBe('t1');
    expect(draft.ownTitle).toBe('');
    expect(draft.starred).toEqual(['t2']);
    expect(draft.verdicts).toEqual({ t3: { verdict: 'not', reason: 'No first-person titles' } });
  });

  it('should keep a locked title this round does not offer as the author’s own', () => {
    const own = entry({ statement: 'The Ledger of Small Debts', payload: null });
    expect(restoreTitleDraft(EMPTY_TITLE_DRAFT, [own], candidates)).toMatchObject({ workingId: null, ownTitle: 'The Ledger of Small Debts' });
  });

  it('should let whatever the author has touched win over the notebook', () => {
    const touched = { ...EMPTY_TITLE_DRAFT, workingId: 't2', verdicts: { t3: { verdict: 'more' as const } } };
    const draft = restoreTitleDraft(touched, [entry(), refused], candidates);
    expect(draft.workingId).toBe('t2');
    expect(draft.verdicts['t3']).toEqual({ verdict: 'more' });
  });
});
