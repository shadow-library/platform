import { describe, expect, it } from 'bun:test';

import {
  addPromiseText,
  buildPromiseSelection,
  driverAtCap,
  editPromiseText,
  EMPTY_PROMISE_ROUND,
  initialPromiseDraft,
  nextPromiseDraft,
  parsePromiseRound,
  type PromiseDraft,
  promiseEffects,
  promiseRoundKey,
  removePromiseText,
  restorePromiseDraft,
  toggleDriver,
} from '../src/features/blueprint/promise-step';
import { type BlueprintRoundResponse, type LedgerEntryResponse } from '../src/lib/apis';

function entry(overrides: Partial<LedgerEntryResponse> = {}): LedgerEntryResponse {
  return {
    id: '1',
    projectId: '7',
    kind: 'decision',
    phase: 'heart',
    topic: 'promise',
    statement: 'Mystery and Progression, ~800 chapters, Hopeful but costly',
    why: 'From the premise.',
    rejectedAlternatives: [],
    writerLine: 'Never resolve a debt off the page.',
    decidedBy: 'author',
    stepKey: 'promise',
    payload: { drivers: ['mystery', 'progression'], length: 'medium', tone: 'Hopeful but costly', promises: ['One', 'Two', 'Three'] },
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
  drivers: [
    { id: 'mystery', label: 'Mystery', fit: 'A buried manifest.', recommended: true },
    { id: 'progression', label: 'Progression', fit: 'A ladder of debts.', recommended: true },
    { id: 'slice_of_life', label: 'Slice of life', fit: 'A quieter book.' },
  ],
  lengths: [
    { id: 'short', label: '~200 chapters', note: 'One volume.' },
    { id: 'medium', label: '~800 chapters', note: 'Four volumes.' },
    { id: 'long', label: '2,000+ chapters', note: 'A decade.' },
  ],
  tones: [{ id: 'tn1', label: 'Hopeful but costly', note: 'Something is paid.' }],
  promises: [
    { id: 'pr1', text: 'Every power has a price' },
    { id: 'pr2', text: 'The past pays off in stages' },
    { id: 'pr3', text: 'Found family is earned slowly' },
  ],
  writerLine: 'Never resolve a debt off the page.',
  tailoring: [
    { id: 'opposition', driver: 'slice_of_life', when: 'absent', effect: 'Core asks what stands in the way.' },
    { id: 'power_ladder', driver: 'progression', when: 'present', effect: 'World asks for a power ladder.' },
    { id: 'seasons', driver: 'slice_of_life', when: 'present', effect: 'The Spine becomes seasons.' },
  ],
};

function round(options: unknown = OPTIONS): BlueprintRoundResponse {
  return {
    id: 'r1',
    stepKey: 'promise',
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

describe('parsePromiseRound', () => {
  it('should read the drivers, lengths, tones, promises and tailoring rules', () => {
    const parsed = parsePromiseRound(round());
    expect(parsed.drivers.map(driver => driver.id)).toEqual(['mystery', 'progression', 'slice_of_life']);
    expect(parsed.drivers[0]?.recommended).toBe(true);
    expect(parsed.tailoring).toHaveLength(3);
  });

  it('should read a round of a shape this build does not know as nothing on screen', () => {
    expect(parsePromiseRound(round(null))).toEqual(EMPTY_PROMISE_ROUND);
    expect(parsePromiseRound(round({ drivers: 'nope', tailoring: [{ id: 'x', driver: 'y', when: 'sometimes' }] }))).toEqual(EMPTY_PROMISE_ROUND);
  });
});

describe('promiseRoundKey', () => {
  it('should change when the options arrive', () => {
    expect(promiseRoundKey(round(null))).toBe('r1:pending');
    expect(promiseRoundKey(round())).toBe('r1:ready');
  });
});

describe('promiseEffects', () => {
  it('should state only what the chosen drivers change', () => {
    const { tailoring } = parsePromiseRound(round());
    expect(promiseEffects(tailoring, ['mystery', 'progression']).map(rule => rule.id)).toEqual(['opposition', 'power_ladder']);
    expect(promiseEffects(tailoring, ['slice_of_life']).map(rule => rule.id)).toEqual(['seasons']);
  });
});

describe('toggleDriver', () => {
  it('should refuse a third rather than silently un-choosing one', () => {
    expect(toggleDriver(['mystery'], 'romance')).toEqual(['mystery', 'romance']);
    expect(toggleDriver(['mystery', 'romance'], 'progression')).toEqual(['mystery', 'romance']);
    expect(toggleDriver(['mystery', 'romance'], 'mystery')).toEqual(['romance']);
  });

  it('should say which pills are at the cap so the screen disables them instead', () => {
    expect(driverAtCap(['mystery', 'romance'], 'progression')).toBe(true);
    expect(driverAtCap(['mystery', 'romance'], 'mystery')).toBe(false);
    expect(driverAtCap(['mystery'], 'progression')).toBe(false);
  });
});

describe('initialPromiseDraft', () => {
  it('should open on what the coach recommends, with the length still unanswered', () => {
    const draft = initialPromiseDraft(parsePromiseRound(round()));
    expect(draft.drivers).toEqual(['mystery', 'progression']);
    expect(draft.length).toBeNull();
    expect(draft.tone).toBe('Hopeful but costly');
    expect(draft.promises).toHaveLength(3);
  });

  it('should offer the coach’s writer line rather than generating and discarding it', () => {
    const draft = initialPromiseDraft(parsePromiseRound(round()));
    expect(draft.writerLine).toBe('Never resolve a debt off the page.');
    expect(draft.offeredWriterLine).toBe('Never resolve a debt off the page.');
  });

  it('should open on what the author already locked instead', () => {
    const restored = restorePromiseDraft([entry()]);
    const draft = initialPromiseDraft(parsePromiseRound(round()), restored ?? {});
    expect(draft.drivers).toEqual(['mystery', 'progression']);
    expect(draft.length).toBe('medium');
    expect(draft.promises.map(promise => promise.text)).toEqual(['One', 'Two', 'Three']);
    expect(draft.writerLine).toBe('Never resolve a debt off the page.');
  });
});

describe('nextPromiseDraft', () => {
  const parsed = parsePromiseRound(round());

  it('should keep the drivers, length and tone the author answered with', () => {
    const chosen = { ...initialPromiseDraft(parsed), drivers: ['romance'], length: 'long', tone: 'Grim' };
    const next = nextPromiseDraft(chosen, parsed);
    expect(next.drivers).toEqual(['romance']);
    expect(next.length).toBe('long');
    expect(next.tone).toBe('Grim');
  });

  it('should carry a line the author wrote and replace one they never touched', () => {
    const authored = { ...initialPromiseDraft(parsed), why: 'Mine.', writerLine: 'My own line.' };
    expect(nextPromiseDraft(authored, { ...parsed, writerLine: 'A fresh coach line.' })).toMatchObject({ why: 'Mine.', writerLine: 'My own line.' });

    const untouched = initialPromiseDraft(parsed);
    expect(nextPromiseDraft(untouched, { ...parsed, writerLine: 'A fresh coach line.' }).writerLine).toBe('A fresh coach line.');
  });

  it('should take the round’s reworked promises', () => {
    const current = { ...initialPromiseDraft(parsed), promises: [{ key: 'own1', text: 'Old' }] };
    expect(nextPromiseDraft(current, parsed).promises.map(promise => promise.text)).toEqual([
      'Every power has a price',
      'The past pays off in stages',
      'Found family is earned slowly',
    ]);
  });
});

describe('restorePromiseDraft', () => {
  it('should read nothing back before the promise is locked', () => {
    expect(restorePromiseDraft([])).toBeNull();
    expect(restorePromiseDraft([entry({ kind: 'direction' })])).toBeNull();
  });

  it('should ignore a payload of the wrong shape rather than crashing the screen', () => {
    expect(restorePromiseDraft([entry({ payload: { drivers: 'mystery', promises: [3] } })])).toEqual({
      why: 'From the premise.',
      writerLine: 'Never resolve a debt off the page.',
    });
  });
});

describe('promise draft edits', () => {
  const promises = [
    { key: 'pr1', optionId: 'pr1', text: 'One' },
    { key: 'pr2', optionId: 'pr2', text: 'Two' },
    { key: 'own1', text: 'Three' },
  ];

  it('should make an edited promise the author’s own and keep its row identity', () => {
    expect(editPromiseText(promises, 'pr1', 'Mine')).toEqual([
      { key: 'pr1', text: 'Mine' },
      { key: 'pr2', optionId: 'pr2', text: 'Two' },
      { key: 'own1', text: 'Three' },
    ]);
  });

  it('should add and remove promises within the bounds, never reusing a key', () => {
    expect(removePromiseText(promises, 'pr2').map(promise => promise.key)).toEqual(['pr1', 'own1']);
    expect(addPromiseText(promises).map(promise => promise.key)).toEqual(['pr1', 'pr2', 'own1', 'own2']);
    expect(addPromiseText([...promises, { key: 'own2', text: '4' }, { key: 'own3', text: '5' }])).toHaveLength(5);
  });
});

describe('buildPromiseSelection', () => {
  const parsed = parsePromiseRound(round());
  const draft: PromiseDraft = {
    drivers: ['mystery'],
    length: 'medium',
    tone: '  Hopeful but costly  ',
    promises: [
      { key: 'pr1', optionId: 'pr1', text: ' One ' },
      { key: 'own1', text: 'Two' },
      { key: 'own2', text: 'Three' },
      { key: 'own3', text: '   ' },
    ],
    why: '  ',
    offeredWriterLine: 'Never resolve a debt off the page.',
    writerLine: ' A line. ',
  };

  it('should send the tailoring contract the later phases read, resolving the tone against the round on screen', () => {
    expect(buildPromiseSelection(draft, parsed)).toEqual({
      drivers: ['mystery'],
      length: 'medium',
      tone: 'Hopeful but costly',
      toneOptionId: 'tn1',
      promises: [{ optionId: 'pr1', text: 'One' }, { text: 'Two' }, { text: 'Three' }],
      writerLine: 'A line.',
    });
  });

  it('should send a tone the round never offered without an option id', () => {
    expect(buildPromiseSelection({ ...draft, tone: 'Wry' }, parsed)?.toneOptionId).toBeUndefined();
  });

  it('should drop a promise id the round on screen no longer offers', () => {
    expect(buildPromiseSelection(draft, { ...parsed, promises: [] })?.promises[0]).toEqual({ text: 'One' });
  });

  it('should refuse a promise the server would refuse', () => {
    expect(buildPromiseSelection({ ...draft, drivers: [] }, parsed)).toBeNull();
    expect(buildPromiseSelection({ ...draft, length: null }, parsed)).toBeNull();
    expect(buildPromiseSelection({ ...draft, writerLine: ' ' }, parsed)).toBeNull();
    expect(
      buildPromiseSelection(
        {
          ...draft,
          promises: [
            { key: 'a', text: 'One' },
            { key: 'b', text: 'Two' },
          ],
        },
        parsed,
      ),
    ).toBeNull();
  });
});
