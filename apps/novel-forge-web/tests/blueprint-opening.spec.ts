import { describe, expect, it } from 'bun:test';

import {
  briefBeats,
  type BriefsDraft,
  briefsLockIssue,
  type BriefsRound,
  buildBriefsSelection,
  citeChip,
  committedBriefs,
  editBrief,
  nextBriefsDraft,
  parseBriefsRound,
  resolveBriefsDraft,
  restoreBriefsDraft,
  reviseBriefInput,
} from '@/features/blueprint/briefs-step';
import { type LedgerEntryResponse } from '@/lib/apis';

function entry(overrides: Partial<LedgerEntryResponse> = {}): LedgerEntryResponse {
  return {
    id: '1',
    kind: 'decision',
    phase: 'opening',
    topic: 'briefs',
    statement: 'The Round: 2 chapter briefs (ch 1–2)',
    why: 'They open where the job does',
    rejectedAlternatives: [],
    writerLine: 'Chapter one has to make his job look worth keeping.',
    decidedBy: 'author',
    stepKey: 'briefs',
    payload: {
      briefs: [
        { chapter: 1, title: 'The Round', pov: 'kaen', purpose: 'Show him useful' },
        { chapter: 2, title: 'Brannoc’s Rule', pov: 'kaen', purpose: 'Give him a rule to break' },
      ],
    },
    links: {},
    status: 'active',
    withdrawnReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as LedgerEntryResponse;
}

const round = {
  id: '1',
  options: {
    arcKey: 'volume_1_arc_1',
    arcTitle: 'The Round',
    chapterStart: 1,
    chapterEnd: 2,
    briefs: [
      {
        id: 'br1',
        chapter: 1,
        title: 'The Round',
        pov: 'kaen',
        purpose: 'Show him useful',
        objective: 'He walks the round',
        scenes: [
          { goal: 'Collect', obstacle: 'A locked door', turn: 'He pockets it', beats: ['Dawn round', 'Two knocks'] },
          { goal: 'Leave', obstacle: 'Brannoc', turn: 'He lies', beats: ['The jar stays in his coat'] },
        ],
        endsOn: 'He pockets the jar',
        mustNotResolve: 'Whose memory it is',
        cites: ['bible_doc:world/how-the-tithe-works', 'entity:brannoc'],
        learns: [],
      },
      {
        id: 'br2',
        chapter: 2,
        title: 'Brannoc’s Rule',
        pov: 'kaen',
        purpose: 'Give him a rule to break',
        objective: 'x',
        scenes: [],
        endsOn: 'y',
        mustNotResolve: 'z',
        cites: [],
        learns: [],
      },
    ],
  },
} as never;

const parsed: BriefsRound = parseBriefsRound(round);

const draftOf = (briefs: BriefsDraft['briefs'], writerLine = 'Chapter one earns the job.'): BriefsDraft => ({
  briefs,
  why: { text: '', anchor: '' },
  writerLine: { text: writerLine, anchor: briefs.map(brief => `${brief.chapter}:${brief.title.trim()}`).join(' → ') },
});

describe('parseBriefsRound', () => {
  it('should read the arc, its range and every brief it offers', () => {
    expect(parsed.arcTitle).toBe('The Round');
    expect(parsed.chapterStart).toBe(1);
    expect(parsed.chapterEnd).toBe(2);
    expect(parsed.briefs.map(brief => brief.id)).toEqual(['br1', 'br2']);
  });

  it('should survive a round with no options at all', () => {
    expect(parseBriefsRound(null).briefs).toEqual([]);
    expect(parseBriefsRound({ id: '2', options: { briefs: ['junk', { chapter: 3 }] } } as never).briefs).toEqual([]);
  });

  it('should read every beat of a chapter in the order the scenes plan them', () => {
    expect(briefBeats(parsed.briefs[0] ?? null)).toEqual(['Dawn round', 'Two knocks', 'The jar stays in his coat']);
    expect(briefBeats(null)).toEqual([]);
  });
});

describe('citeChip', () => {
  it('should name a page and a card the way the author reads them', () => {
    expect(citeChip('bible_doc:world/how-the-tithe-works')).toEqual({ ref: 'bible_doc:world/how-the-tithe-works', kind: 'Page', label: 'How the tithe works' });
    expect(citeChip('entity:brannoc')).toEqual({ ref: 'entity:brannoc', kind: 'Card', label: 'Brannoc' });
  });

  it('should not throw on a ref with no prefix', () => {
    expect(citeChip('brannoc').label).toBe('Brannoc');
  });
});

describe('buildBriefsSelection', () => {
  it('should send every chapter with its option, and omit an empty POV', () => {
    const draft = draftOf([
      { optionId: 'br1', chapter: 1, title: 'The Round', pov: 'kaen', purpose: 'Show him useful' },
      { optionId: 'br2', chapter: 2, title: 'Brannoc’s Rule', pov: '', purpose: 'Give him a rule' },
    ]);

    expect(buildBriefsSelection(draft, parsed)).toEqual({
      briefs: [
        { optionId: 'br1', chapter: 1, title: 'The Round', pov: 'kaen', purpose: 'Show him useful' },
        { optionId: 'br2', chapter: 2, title: 'Brannoc’s Rule', purpose: 'Give him a rule' },
      ],
      writerLine: 'Chapter one earns the job.',
    });
  });

  it('should refuse exactly when the lock issue answers', () => {
    const blank = draftOf([{ optionId: 'br1', chapter: 1, title: '', pov: '', purpose: '' }]);
    expect(briefsLockIssue(blank, parsed)).not.toBeNull();
    expect(buildBriefsSelection(blank, parsed)).toBeNull();

    const short = draftOf([{ optionId: 'br1', chapter: 1, title: 'The Round', pov: '', purpose: 'Show him useful' }]);
    expect(briefsLockIssue(short, parsed)).toContain('2 chapters');
    expect(buildBriefsSelection(short, parsed)).toBeNull();
  });

  it('should refuse a lock whose writer line was written about an answer the author has since changed', () => {
    const draft = draftOf([
      { optionId: 'br1', chapter: 1, title: 'The Round', pov: 'kaen', purpose: 'Show him useful' },
      { optionId: 'br2', chapter: 2, title: 'Brannoc’s Rule', pov: 'kaen', purpose: 'Give him a rule' },
    ]);
    const renamed = { ...draft, briefs: editBrief(draft.briefs, 0, { title: 'Dawn Round' }) };

    expect(briefsLockIssue(renamed, parsed)).toContain('writes chapter one');
    expect(buildBriefsSelection(renamed, parsed)).toBeNull();
  });

  it('should keep the blank rows a helper is handed out of the selection', () => {
    const draft = draftOf([
      { optionId: 'br1', chapter: 1, title: 'The Round', pov: 'kaen', purpose: 'Show him useful' },
      { chapter: 2, title: '', pov: '', purpose: '' },
    ]);
    expect(committedBriefs(draft).map(brief => brief.chapter)).toEqual([1]);
  });
});

describe('restoreBriefsDraft', () => {
  it('should read back every chapter the last lock wrote, with its lines anchored to them', () => {
    const restored = restoreBriefsDraft([entry()]);

    expect(restored?.briefs.map(brief => brief.title)).toEqual(['The Round', 'Brannoc’s Rule']);
    expect(restored?.writerLine.text).toBe('Chapter one has to make his job look worth keeping.');
    expect(restored?.writerLine.anchor).toBe('1:The Round → 2:Brannoc’s Rule');
  });

  it('should answer null when nothing has been locked yet', () => {
    expect(restoreBriefsDraft([])).toBeNull();
    expect(restoreBriefsDraft([entry({ kind: 'direction' })])).toBeNull();
  });
});

describe('nextBriefsDraft', () => {
  it('should take a new round whole when the author has only been shown the last one', () => {
    const offered = draftOf(
      parsed.briefs.map(brief => ({ optionId: brief.id, chapter: brief.chapter, title: brief.title, pov: brief.pov, purpose: brief.purpose })),
      '',
    );
    const next = nextBriefsDraft(offered, offered, parsed);
    expect(next.briefs.map(brief => brief.title)).toEqual(['The Round', 'Brannoc’s Rule']);
  });

  it('should keep what the author wrote and resolve its option id against the new round by chapter', () => {
    const offered = draftOf(
      parsed.briefs.map(brief => ({ optionId: brief.id, chapter: brief.chapter, title: brief.title, pov: brief.pov, purpose: brief.purpose })),
      '',
    );
    const touched = { ...offered, briefs: editBrief(offered.briefs, 0, { title: 'Dawn Round' }) };
    const rerolled: BriefsRound = { ...parsed, briefs: parsed.briefs.map(brief => ({ ...brief, id: `x${brief.chapter}` })) };

    const next = nextBriefsDraft(touched, offered, rerolled);
    expect(next.briefs[0]?.title).toBe('Dawn Round');
    expect(next.briefs.map(brief => brief.optionId)).toEqual(['x1', 'x2']);
  });
});

describe('resolveBriefsDraft', () => {
  it('should give a draft read back from the notebook the ids of the round on screen, matched by chapter', () => {
    const restored = restoreBriefsDraft([entry()]);
    const resolved = resolveBriefsDraft(restored!, parsed);

    expect(restored?.briefs.every(brief => brief.optionId === undefined)).toBe(true);
    expect(resolved.briefs.map(brief => brief.optionId)).toEqual(['br1', 'br2']);
    expect(buildBriefsSelection(resolved, parsed)?.briefs.every(brief => brief.optionId)).toBe(true);
  });

  it('should leave a chapter the round no longer offers without an id', () => {
    const draft = draftOf([{ chapter: 9, title: 'Late', pov: '', purpose: 'x' }]);
    expect(resolveBriefsDraft(draft, parsed).briefs[0]?.optionId).toBeUndefined();
  });
});

describe('reviseBriefInput', () => {
  it('should name the chapter a revision is for, and send nothing for a whole-arc rewrite', () => {
    expect(reviseBriefInput(3)).toEqual({ chapter: 3 });
    expect(reviseBriefInput(null)).toBeUndefined();
  });
});
