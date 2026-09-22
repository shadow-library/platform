import { describe, expect, it } from 'bun:test';

import { anchorLine } from '../src/features/blueprint/anchored-line';
import {
  arcsDraftAnchor,
  arcsDraftFrom,
  arcsLockIssue,
  buildArcsSelection,
  editArc,
  ladderRungs,
  nextArcsDraft,
  parseArcsRound,
  placeRung,
  restoreArcsDraft,
} from '../src/features/blueprint/arcs-step';
import { buildCastSelection, castDraftFrom, castLockIssue, delegateMember, editMember, nextCastDraft, parseCastRound, restoreCastDraft } from '../src/features/blueprint/cast-step';
import {
  backlogPlace,
  buildPlacesSelection,
  editPlace,
  nextPlacesDraft,
  parsePlacesRound,
  type PlacesDraft,
  placesDraftFrom,
  placesLockIssue,
  restorePlacesDraft,
} from '../src/features/blueprint/places-step';
import {
  buildSpineSelection,
  editMovement,
  nextSpineDraft,
  parseSpineRound,
  restoreSpineDraft,
  type RevealDraft,
  SPINE_LABELS,
  type SpineDraft,
  spineDraftAnchor,
  spineDraftFrom,
  spineLockIssue,
} from '../src/features/blueprint/spine-step';
import { type BlueprintRoundResponse, type LedgerEntryResponse } from '../src/lib/apis';

function entry(overrides: Partial<LedgerEntryResponse> = {}): LedgerEntryResponse {
  return {
    id: '1',
    projectId: '7',
    kind: 'decision',
    phase: 'spine',
    topic: 'spine',
    statement: 'Discovery → Choice',
    why: null,
    rejectedAlternatives: [],
    writerLine: null,
    decidedBy: 'author',
    stepKey: 'spine',
    payload: null,
    links: {},
    supersedesId: null,
    supersededAt: null,
    withdrawnReason: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function round(options: unknown, overrides: Partial<BlueprintRoundResponse> = {}): BlueprintRoundResponse {
  return {
    id: 'r1',
    stepKey: 'spine_pass',
    round: 1,
    status: 'ready',
    focus: null,
    steer: null,
    nudges: [],
    keepAsDirection: false,
    feedback: [],
    input: null,
    options,
    coachMessage: 'Drawn.',
    error: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as BlueprintRoundResponse;
}

const spineOptions = {
  mode: 'movements',
  endingQuestion: 'Will he take the memory back?',
  revealsRequired: true,
  movements: [
    { id: 'mv1', title: 'Discovery', summary: 'The stolen tithes', change: 'useful', chapters: 60 },
    { id: 'mv2', title: 'Choice', summary: 'The ending question', change: 'chooses', chapters: 40 },
  ],
  reveals: [{ id: 'rv1', movement: 1, when: 'End arc 1', truth: 'The jar is his', writerNote: 'Keep the jar shut', terms: ['his own memory'], pinned: true }],
  note: 'The last one answers it.',
};

const castOptions = {
  members: [
    { id: 'cm1', name: 'Brannoc', descriptor: 'His master', role: 'mentor', wants: 'To retire', doesInVolumeOne: 'Signs the licence', minor: false },
    { id: 'cm2', name: 'Tomas', descriptor: 'A tithe-house boy', role: 'ally', wants: 'To matter', doesInVolumeOne: 'Runs messages', minor: true },
  ],
  later: [{ id: 'lc1', name: 'The Salt Consul', line: 'Buys the coast', volume: 3 }],
  ladder: {
    first: 'Arden',
    second: 'Lise',
    rungs: [
      { id: 'lr1', name: 'distrust', meaning: 'They expect to be robbed' },
      { id: 'lr2', name: 'a deal', meaning: 'They trade' },
    ],
  },
};

const placesOptions = {
  places: [
    { id: 'pl1', name: 'The Tithe Quarter', kind: 'place', detail: 'deep', summary: 'Where the lamps are paid for', usedIn: 'arc 1' },
    { id: 'pl2', name: 'The Salt Coast', kind: 'place', detail: 'sketch', summary: 'Somewhere south' },
  ],
  backlog: [{ id: 'bl1', item: 'The first tithe', why: 'Nothing needs it yet' }],
};

const arcsOptions = {
  volumeTitle: 'Discovery',
  volumeChapters: 30,
  arcs: [
    { id: 'ac1', title: 'The Round', purpose: 'Show the tithe', turn: 'The jar is his', chapters: 10, rung: 'distrust' },
    { id: 'ac2', title: 'Hollow Market', purpose: 'Make him need them', turn: 'He owes Lise', chapters: 12 },
  ],
};

describe('spine-step', () => {
  it('should parse the mode, the pinned ending question and whether the schedule is required', () => {
    const parsed = parseSpineRound(round(spineOptions));

    expect(parsed).toMatchObject({ mode: 'movements', endingQuestion: 'Will he take the memory back?', revealsRequired: true });
    expect(parsed.movements.map(movement => movement.id)).toEqual(['mv1', 'mv2']);
    expect(SPINE_LABELS[parseSpineRound(round({ ...spineOptions, mode: 'seasons' })).mode].movements).toBe('Seasons of a life');
  });

  it('should refuse to build a selection without a writer line, and one whose mystery has no reveals', () => {
    const parsed = parseSpineRound(round(spineOptions));
    const draft = spineDraftFrom(parsed);

    expect(buildSpineSelection(draft, parsed)).toBeNull();

    const written = { ...draft, writerLine: anchorLine('He is still useful to everyone.', 'Discovery → Choice') };
    expect(buildSpineSelection(written, parsed)?.movements).toHaveLength(2);
    expect(buildSpineSelection({ ...written, reveals: [] }, parsed)).toBeNull();
    expect(buildSpineSelection({ ...written, reveals: [] }, { ...parsed, revealsRequired: false })?.reveals).toBeUndefined();
  });

  it('should name why the lock is unavailable, and refuse exactly when it does', () => {
    const parsed = parseSpineRound(round(spineOptions));
    const draft = spineDraftFrom(parsed);

    expect(spineLockIssue(draft, parsed)).toContain('writes chapter one');

    const written = { ...draft, writerLine: anchorLine('He is still useful.', 'Discovery → Choice') };
    expect(spineLockIssue(written, parsed)).toBeNull();
    expect(spineLockIssue({ ...written, reveals: [] }, parsed)).toContain('Mystery drives this novel');
    expect(spineLockIssue({ ...written, reveals: [{ ...(written.reveals[0] as RevealDraft), writerNote: '' }] }, parsed)).toContain('without stating it');
    expect(spineLockIssue({ ...written, reveals: [{ ...(written.reveals[0] as RevealDraft), writerNote: 'Never say the jar is his' }] }, parsed)).toContain('states the truth');

    for (const broken of [draft, { ...written, reveals: [] }]) expect(buildSpineSelection(broken, parsed)).toBeNull();
  });

  it('should send the reveal with its movement, its note and its give-away phrases split out', () => {
    const parsed = parseSpineRound(round(spineOptions));
    const written = { ...spineDraftFrom(parsed), writerLine: anchorLine('He is still useful.', 'Discovery → Choice') };

    expect(buildSpineSelection(written, parsed)?.reveals).toEqual([
      { optionId: 'rv1', movement: 1, when: 'End arc 1', truth: 'The jar is his', writerNote: 'Keep the jar shut', terms: ['his own memory'] },
    ]);
  });

  it('should anchor its lines to the movements the lock will carry, not to the half-typed row on screen', () => {
    const parsed = parseSpineRound(round(spineOptions));
    const half = { ...spineDraftFrom(parsed), movements: [...spineDraftFrom(parsed).movements, { title: 'A third', summary: '', change: '', chapters: 0 }] };

    expect(spineDraftAnchor(half)).toBe('Discovery → Choice');
    const written = { ...half, writerLine: anchorLine('He is still useful.', spineDraftAnchor(half)) };
    expect(spineLockIssue(written, parsed)).toBeNull();
    expect(buildSpineSelection(written, parsed)).not.toBeNull();
  });

  it('should drop the option id of a movement the author renamed, and drop the movement when its name is emptied', () => {
    const movements = spineDraftFrom(parseSpineRound(round(spineOptions))).movements;

    expect(editMovement(movements, 0, { title: 'The Round' })[0]?.optionId).toBeUndefined();
    expect(editMovement(movements, 0, { summary: 'something else' })[0]?.optionId).toBe('mv1');
    expect(editMovement(movements, 1, { title: '  ' })).toHaveLength(2);
    expect(editMovement(movements, 0, { title: '' })).toHaveLength(2);
  });

  it('should take a new round only where the author has not written, re-resolving the ids by title', () => {
    const parsed = parseSpineRound(round(spineOptions));
    const offered = spineDraftFrom(parsed);
    const touched: SpineDraft = { ...offered, movements: editMovement(offered.movements, 0, { summary: 'his own words' }) };

    const reordered = parseSpineRound(
      round({
        ...spineOptions,
        movements: [
          { ...spineOptions.movements[1], id: 'mv1' },
          { ...spineOptions.movements[0], id: 'mv2' },
        ],
      }),
    );
    const untouched = nextSpineDraft(offered, offered, reordered);
    expect(untouched.movements[0]?.title).toBe('Choice');

    const kept = nextSpineDraft(touched, offered, reordered);
    expect(kept.movements[0]?.summary).toBe('his own words');
    expect(kept.movements[0]?.optionId).toBe('mv2');
  });

  it('should read both of its decisions back, so a re-lock carries the whole answer', () => {
    const restored = restoreSpineDraft([
      entry({ payload: { movements: [{ title: 'Discovery', summary: 'x', change: 'useful', chapters: 60 }], note: 'n' }, writerLine: 'A line' }),
      entry({ id: '2', topic: 'spine.reveals', statement: 'End arc 1: the jar is his', payload: { reveals: [{ when: 'End arc 1', truth: 'The jar is his' }] } }),
    ]);

    expect(restored?.movements).toHaveLength(1);
    expect(restored?.reveals[0]).toEqual({ movement: 1, when: 'End arc 1', truth: 'The jar is his', writerNote: '', terms: '' });
    expect(restored?.writerLine.anchor).toBe('Discovery');
    expect(restoreSpineDraft([])).toBeNull();
  });
});

describe('cast-step', () => {
  it('should mark a minor card as the system’s and let the author take it back', () => {
    const draft = castDraftFrom(parseCastRound(round(castOptions)));

    expect(draft.members.map(member => member.decidedBy)).toEqual(['author', 'system']);
    expect(delegateMember(draft.members, 1, 'author')[1]?.decidedBy).toBe('author');
    expect(delegateMember(draft.members, 0, 'system')[0]?.decidedBy).toBe('system');
  });

  it('should drop the blank card the screen offers rather than committing it when a You/System pill is clicked', () => {
    const draft = castDraftFrom(parseCastRound(round(castOptions)));
    const onScreen = [...draft.members, { name: '', descriptor: '', role: '', wants: '', doesInVolumeOne: '', decidedBy: 'author' as const }];

    expect(delegateMember(onScreen, 0, 'system')).toHaveLength(2);
    expect(delegateMember(onScreen, 2, 'system')).toHaveLength(2);
  });

  it('should name why the lock is unavailable rather than going quietly dark', () => {
    const parsed = parseCastRound(round(castOptions));
    const draft = castDraftFrom(parsed);

    expect(castLockIssue(draft)).toContain('writes chapter one');
    const written = { ...draft, writerLine: anchorLine('Brannoc is there.', 'Brannoc, Tomas') };
    expect(castLockIssue(written)).toBeNull();
    expect(castLockIssue({ ...written, members: [written.members[0]!, { ...written.members[1]!, name: 'brannoc' }] })).toContain('same character');
    expect(castLockIssue({ ...written, ladder: { ...written.ladder, second: 'arden' } })).toContain('same person twice');
  });

  it('should send who decided each card with the selection, and refuse two cards with one name', () => {
    const parsed = parseCastRound(round(castOptions));
    const draft = { ...castDraftFrom(parsed), writerLine: anchorLine('Brannoc is in every lamp chapter.', 'Brannoc, Tomas') };

    expect(buildCastSelection(draft)?.members.map(member => member.decidedBy)).toEqual(['author', 'system']);
    expect(buildCastSelection(draft)?.ladder?.rungs.map(rung => rung.name)).toEqual(['distrust', 'a deal']);

    const doubled = { ...draft, members: [draft.members[0]!, { ...draft.members[1]!, name: 'brannoc' }] };
    expect(buildCastSelection(doubled)).toBeNull();
  });

  it('should keep a renamed card as the author’s own and re-resolve its id against the next round', () => {
    const parsed = parseCastRound(round(castOptions));
    const offered = castDraftFrom(parsed);
    const renamed = { ...offered, members: editMember(offered.members, 0, { name: 'Bran' }) };
    expect(renamed.members[0]?.optionId).toBeUndefined();

    const next = parseCastRound(
      round({
        ...castOptions,
        members: [
          { ...castOptions.members[1], id: 'cm1' },
          { ...castOptions.members[0], id: 'cm9', name: 'Bran' },
        ],
      }),
    );
    expect(nextCastDraft(renamed, offered, next).members[0]?.optionId).toBe('cm9');
    expect(nextCastDraft(offered, offered, next).members[0]?.name).toBe('Tomas');
  });

  it('should restore the cast and the ladder together', () => {
    const restored = restoreCastDraft([
      entry({
        phase: 'volume_one',
        topic: 'cast',
        stepKey: 'cast',
        statement: 'Brannoc, Tomas',
        payload: {
          members: [
            { name: 'Brannoc', descriptor: 'His master', decidedBy: 'author' },
            { name: 'Tomas', descriptor: 'A boy', decidedBy: 'system' },
          ],
          later: [],
        },
      }),
      entry({ id: '2', phase: 'volume_one', topic: 'cast.ladder', stepKey: 'cast', payload: { first: 'Arden', second: 'Lise', rungs: [{ name: 'distrust' }] } }),
    ]);

    expect(restored?.members.map(member => member.decidedBy)).toEqual(['author', 'system']);
    expect(restored?.ladder.rungs).toEqual([{ name: 'distrust', meaning: '' }]);
  });
});

describe('places-step', () => {
  it('should refuse an answer where nothing is detailed, and accept one where somewhere is', () => {
    const parsed = parsePlacesRound(round(placesOptions));
    const draft: PlacesDraft = { ...placesDraftFrom(parsed), writerLine: anchorLine('It all happens in the Quarter.', 'The Tithe Quarter, The Salt Coast') };

    expect(buildPlacesSelection(draft)?.places).toHaveLength(2);
    expect(buildPlacesSelection({ ...draft, places: draft.places.map(place => ({ ...place, detail: 'sketch' as const })) })).toBeNull();
  });

  it('should move a place to the backlog rather than deleting it', () => {
    const draft = placesDraftFrom(parsePlacesRound(round(placesOptions)));
    const backlogged = backlogPlace(draft, 1);

    expect(backlogged.places.map(place => place.name)).toEqual(['The Tithe Quarter']);
    expect(backlogged.backlog.map(item => item.item)).toEqual(['The first tithe', 'The Salt Coast']);
  });

  it('should drop the blank row the screen offers rather than backlogging it', () => {
    const draft = placesDraftFrom(parsePlacesRound(round(placesOptions)));
    const onScreen = [...draft.places, { name: '', kind: 'place' as const, detail: 'sketch' as const, summary: '', usedIn: '' }];

    const blank = backlogPlace({ ...draft, places: onScreen }, 2);
    expect(blank.places).toHaveLength(2);
    expect(blank.backlog).toHaveLength(1);

    const real = backlogPlace({ ...draft, places: onScreen }, 1);
    expect(real.places).toHaveLength(1);
    expect(real.backlog.map(item => item.item)).toEqual(['The first tithe', 'The Salt Coast']);
  });

  it('should name why the lock is unavailable rather than going quietly dark', () => {
    const draft = placesDraftFrom(parsePlacesRound(round(placesOptions)));

    expect(placesLockIssue(draft)).toContain('writes chapter one');
    const written = { ...draft, writerLine: anchorLine('It all happens in the Quarter.', 'The Tithe Quarter, The Salt Coast') };
    expect(placesLockIssue(written)).toBeNull();
    expect(placesLockIssue({ ...written, places: written.places.map(place => ({ ...place, detail: 'sketch' as const })) })).toContain('Nowhere is detailed');
  });

  it('should restore the backlog the Notebook already holds, even with no places decision', () => {
    const restored = restorePlacesDraft([
      entry({ id: '9', kind: 'backlog', phase: 'volume_one', topic: 'places.backlog', stepKey: 'places', statement: 'The first tithe', why: 'Nothing needs it yet' }),
    ]);

    expect(restored?.places).toEqual([]);
    expect(restored?.backlog).toEqual([{ item: 'The first tithe', why: 'Nothing needs it yet' }]);
    expect(restorePlacesDraft([])).toBeNull();
  });

  it('should drop the option id of a place the author renamed and re-resolve it on the next round', () => {
    const parsed = parsePlacesRound(round(placesOptions));
    const offered = placesDraftFrom(parsed);
    const renamed = { ...offered, places: editPlace(offered.places, 0, { name: 'The Quarter' }) };

    expect(renamed.places[0]?.optionId).toBeUndefined();
    const next = parsePlacesRound(round({ ...placesOptions, places: [{ ...placesOptions.places[0], id: 'pl7', name: 'The Quarter' }] }));
    expect(nextPlacesDraft(renamed, offered, next).places[0]?.optionId).toBe('pl7');
  });
});

describe('arcs-step', () => {
  it('should offer only the rungs the cast screen locked', () => {
    expect(ladderRungs([entry({ topic: 'cast.ladder', payload: { rungs: [{ name: 'distrust' }, { name: 'a deal' }] } })])).toEqual(['distrust', 'a deal']);
    expect(ladderRungs([])).toEqual([]);
  });

  it('should land a rung on one arc only, and take it off when it is placed there again', () => {
    const arcs = arcsDraftFrom(parseArcsRound(round(arcsOptions))).arcs;

    expect(placeRung(arcs, 1, 'distrust').map(arc => arc.rung)).toEqual(['', 'distrust']);
    expect(placeRung(arcs, 0, 'distrust').map(arc => arc.rung)).toEqual(['', '']);
  });

  it('should drop the blank row the screen offers rather than committing it, whichever list the click hands over', () => {
    const draft = arcsDraftFrom(parseArcsRound(round(arcsOptions)));
    const onScreen = [...draft.arcs, { title: '', purpose: '', turn: '', chapters: 0, rung: '' }];

    expect(placeRung(onScreen, 1, 'a deal')).toHaveLength(2);
    expect(placeRung(onScreen, 2, 'a deal')).toHaveLength(2);
  });

  it('should refuse more arcs than volume one has chapters, and say so', () => {
    const parsed = parseArcsRound(round({ ...arcsOptions, volumeChapters: 1 }));
    const draft = { ...arcsDraftFrom(parsed), writerLine: anchorLine('Arc one ends on the jar.', 'The Round → Hollow Market') };

    expect(arcsLockIssue(draft, parsed.volumeChapters)).toContain('cannot hold 2 arcs');
    expect(buildArcsSelection(draft, parsed.volumeChapters)).toBeNull();
    expect(buildArcsSelection(draft, 30)).not.toBeNull();
  });

  it('should anchor its lines to the arcs the lock will carry, not to the half-typed row on screen', () => {
    const parsed = parseArcsRound(round(arcsOptions));
    const half = { ...arcsDraftFrom(parsed), arcs: [...arcsDraftFrom(parsed).arcs, { title: 'A third', purpose: '', turn: '', chapters: 0, rung: '' }] };

    expect(arcsDraftAnchor(half)).toBe('The Round → Hollow Market');
    const written = { ...half, writerLine: anchorLine('Arc one ends on the jar.', arcsDraftAnchor(half)) };
    expect(arcsLockIssue(written, parsed.volumeChapters)).toBeNull();
    expect(buildArcsSelection(written, parsed.volumeChapters)).not.toBeNull();
  });

  it('should send the arc lengths and rungs, and refuse an arc with no turn', () => {
    const parsed = parseArcsRound(round(arcsOptions));
    const draft = { ...arcsDraftFrom(parsed), writerLine: anchorLine('Arc one ends on the jar.', 'The Round → Hollow Market') };

    expect(buildArcsSelection(draft)?.arcs).toEqual([
      { optionId: 'ac1', title: 'The Round', purpose: 'Show the tithe', turn: 'The jar is his', chapters: 10, rung: 'distrust' },
      { optionId: 'ac2', title: 'Hollow Market', purpose: 'Make him need them', turn: 'He owes Lise', chapters: 12 },
    ]);
    expect(buildArcsSelection({ ...draft, arcs: draft.arcs.map(arc => ({ ...arc, turn: '' })) })).toBeNull();
    expect(buildArcsSelection(arcsDraftFrom(parsed))).toBeNull();
  });

  it('should restore the arcs as lengths, from the chapter ranges the lock laid out', () => {
    const restored = restoreArcsDraft([
      entry({
        phase: 'volume_one',
        topic: 'arcs',
        stepKey: 'arcs',
        payload: { arcs: [{ title: 'The Round', purpose: 'p', turn: 't', chapterStart: 1, chapterEnd: 10, rung: 'distrust' }] },
      }),
    ]);

    expect(restored?.arcs[0]).toEqual({ title: 'The Round', purpose: 'p', turn: 't', chapters: 10, rung: 'distrust' });
    expect(restoreArcsDraft([])).toBeNull();
  });

  it('should keep an arc the author rewrote across a new round, with its id resolved again by title', () => {
    const parsed = parseArcsRound(round(arcsOptions));
    const offered = arcsDraftFrom(parsed);
    const touched = { ...offered, arcs: editArc(offered.arcs, 0, { purpose: 'his own purpose' }) };

    const next = parseArcsRound(
      round({
        ...arcsOptions,
        arcs: [
          { ...arcsOptions.arcs[1], id: 'ac1' },
          { ...arcsOptions.arcs[0], id: 'ac4' },
        ],
      }),
    );
    expect(nextArcsDraft(touched, offered, next).arcs[0]).toMatchObject({ purpose: 'his own purpose', optionId: 'ac4' });
    expect(nextArcsDraft(offered, offered, next).arcs[0]?.title).toBe('Hollow Market');
  });
});
