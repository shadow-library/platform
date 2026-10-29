import { describe, expect, it } from 'bun:test';

import { commitBarView, declineAsksScope, type SuggestionDecision } from '../src/features/chat/chat-view';
import { cardChanges, waitingChanges } from '../src/features/chat/progress-panel-view';
import {
  clearedDecisions,
  doneView,
  filterShows,
  focusAfterAnswer,
  itemAnswer,
  itemAnswered,
  itemDecisions,
  movedFocus,
  openingFocus,
  progressLabel,
  reviewableCard,
  reviewKeyAction,
  reviewSource,
  withDecisions,
} from '../src/features/chat/review-answers';
import { type ReviewItem, reviewItems } from '../src/features/chat/review-dialog-view';
import { type ProposalResponse } from '../src/lib/apis/api-types.gen';

type Op = ProposalResponse['changeSet'][number];

function proposal(changeSet: Op[], overrides: Partial<ProposalResponse> = {}): ProposalResponse {
  return {
    id: 'p1',
    projectId: 'n',
    scopeType: 'project',
    kind: 'organise',
    status: 'pending',
    changeSet,
    baseline: {},
    autoApplied: false,
    revertible: true,
    warnings: [],
    diagnostics: [],
    createdAt: '2026-10-29T10:00:00.000Z',
    updatedAt: '2026-10-29T10:00:00.000Z',
    ...overrides,
  };
}

const PAGE: Op = { op: 'bible_document.upsert', section: 'world', slug: 'pier', body: 'The tide takes the pier.' };
const WHOLE: Op = { ...PAGE, body: 'The tide takes the pier.\n\nGulls circle the wreck.' };
const TAMSIN: Op = { op: 'entity.upsert', type: 'character', entityKey: 'tamsin', name: 'Tamsin', body: 'Keeps the lamps.' };
const THREAD: Op = { op: 'promise.create', key: 'who-lit', label: 'Who lit the first lamp?' };
const CARD = proposal([PAGE, TAMSIN, WHOLE, THREAD]);
const ITEMS = reviewItems({ proposal: CARD });
const [PAIR, PERSON, QUESTION] = ITEMS as [ReviewItem, ReviewItem, ReviewItem];

const decisions = (...entries: [number, SuggestionDecision][]): Map<number, SuggestionDecision> => new Map(entries);
const rowsOf = (card: ProposalResponse, answers: Map<number, SuggestionDecision>, scopes = new Map()) => new Map(cardChanges(card, answers, scopes).map(row => [row.index, row]));

describe('reviewableCard', () => {
  it('should review a pending card of suggestions answered in the panel', () => {
    expect(reviewableCard(CARD)).toBe(true);
  });

  it('should leave settled cards, plans, actions and prose edits to their own surfaces', () => {
    expect(reviewableCard({ ...CARD, status: 'applied' })).toBe(false);
    expect(reviewableCard({ ...CARD, kind: 'chapter_plan' })).toBe(false);
    expect(reviewableCard(proposal([TAMSIN, { op: 'action.plan_chapter' }]))).toBe(false);
    expect(reviewableCard(proposal([{ op: 'draft.update', chapter: 2, body: 'New prose.' }]))).toBe(false);
  });
});

describe('itemDecisions', () => {
  it('should answer a single change with the decision alone', () => {
    expect(itemDecisions(PERSON, 'add')).toEqual([[1, 'add']]);
    expect(itemDecisions(PERSON, 'decline')).toEqual([[1, 'decline']]);
  });

  it('should keep the picked version of a page offered twice and leave the other out', () => {
    expect(PAIR.opIndexes).toEqual([0, 2]);
    expect(itemDecisions(PAIR, 'add', 'notes')).toEqual([
      [0, 'add'],
      [2, 'decline'],
    ]);
    expect(itemDecisions(PAIR, 'add', 'forge')).toEqual([
      [0, 'decline'],
      [2, 'add'],
    ]);
    expect(itemDecisions(PAIR, 'add')).toEqual(itemDecisions(PAIR, 'add', 'notes'));
  });

  it('should leave out both halves when the page is not added', () => {
    expect(itemDecisions(PAIR, 'decline', 'forge')).toEqual([
      [0, 'decline'],
      [2, 'decline'],
    ]);
  });

  it('should clear every op of an item to change the answer', () => {
    expect(clearedDecisions(PAIR)).toEqual([
      [0, undefined],
      [2, undefined],
    ]);
    expect([...withDecisions(decisions([0, 'add'], [2, 'decline'], [1, 'add']), clearedDecisions(PAIR))]).toEqual([[1, 'add']]);
  });
});

describe('itemAnswered', () => {
  it('should count a page offered twice as answered once either half is added or both have an answer', () => {
    expect(itemAnswered(PAIR, new Map())).toBe(false);
    expect(itemAnswered(PAIR, decisions([2, 'add']))).toBe(true);
    expect(itemAnswered(PAIR, decisions([0, 'add']))).toBe(true);
    expect(itemAnswered(PAIR, decisions([0, 'decline'], [2, 'decline']))).toBe(true);
    expect(itemAnswered(PERSON, decisions([0, 'add']))).toBe(false);
    expect(itemAnswered(PERSON, decisions([1, 'decline']))).toBe(true);
  });

  it('should leave a page open while only one half is declined, so its other version is still asked about', () => {
    expect(itemAnswered(PAIR, decisions([0, 'decline']))).toBe(false);
    expect(itemAnswered(PAIR, decisions([2, 'decline']))).toBe(false);
  });
});

describe('declineAsksScope', () => {
  it('should ask once for a page left out, on its later half', () => {
    const both = decisions([0, 'decline'], [2, 'decline']);
    expect(declineAsksScope(CARD, 0, both)).toBe(false);
    expect(declineAsksScope(CARD, 2, both)).toBe(true);
  });

  it('should not ask for the half left out when the other version is kept', () => {
    expect(declineAsksScope(CARD, 2, decisions([0, 'add'], [2, 'decline']))).toBe(false);
    expect(declineAsksScope(CARD, 0, decisions([0, 'decline'], [2, 'add']))).toBe(false);
  });

  it('should ask for a lone half declined while the other is unanswered, and for any other decline', () => {
    expect(declineAsksScope(CARD, 0, decisions([0, 'decline']))).toBe(true);
    expect(declineAsksScope(CARD, 1, decisions([1, 'decline']))).toBe(true);
    expect(declineAsksScope(CARD, 1, decisions([1, 'add']))).toBe(false);
    expect(declineAsksScope(proposal([{ op: 'action.plan_chapter' }]), 0, decisions([0, 'decline']))).toBe(false);
  });

  it('should carry the rule into the panel rows, settled or pending', () => {
    const both = decisions([0, 'decline'], [2, 'decline']);
    expect(cardChanges(CARD, both).map(row => row.askScope.length)).toEqual([0, 0, 3, 0]);
    const applied = { ...CARD, status: 'applied', opResults: [{ index: 0, status: 'applied' }] } as ProposalResponse;
    expect(cardChanges(applied, decisions([0, 'add'], [2, 'decline'])).map(row => row.askScope.length)).toEqual([0, 0, 0, 0]);
  });
});

describe('itemAnswer', () => {
  it('should read an open item and a kept version', () => {
    expect(itemAnswer(PAIR, rowsOf(CARD, new Map()))).toEqual({ status: 'open', askScope: [] });
    expect(itemAnswer(PAIR, rowsOf(CARD, decisions([0, 'decline'], [2, 'add'])))).toEqual({ status: 'add', kept: 'forge', askScope: [] });
  });

  it('should read a lone declined half as open, without asking its scope yet', () => {
    expect(itemAnswer(PAIR, rowsOf(CARD, decisions([0, 'decline'])))).toEqual({ status: 'open', askScope: [] });
    expect(itemAnswer(PAIR, rowsOf(CARD, decisions([2, 'decline'])))).toEqual({ status: 'open', askScope: [] });
  });

  it('should ask the scope on the op that owns it, and report it once recorded', () => {
    const both = decisions([0, 'decline'], [2, 'decline']);
    expect(itemAnswer(PAIR, rowsOf(CARD, both))).toEqual({ status: 'decline', scopeIndex: 2, askScope: ['never', 'not_now', 'not_this_version'] });
    expect(itemAnswer(PAIR, rowsOf(CARD, both, new Map([[2, 'not_now']])))).toEqual({ status: 'decline', scopeIndex: 2, askScope: [], scope: 'not_now' });
  });

  it('should read a saved card’s outcome', () => {
    const applied = { ...CARD, status: 'applied', opResults: [{ index: 2, status: 'applied' }] } as ProposalResponse;
    const answers = decisions([0, 'decline'], [1, 'decline'], [2, 'add'], [3, 'add']);
    expect(itemAnswer(PAIR, rowsOf(applied, answers)).status).toBe('added');
    expect(itemAnswer(PERSON, rowsOf(applied, answers))).toMatchObject({ status: 'declined', scopeIndex: 1 });
    expect(itemAnswer(QUESTION, rowsOf({ ...CARD, status: 'superseded' }, new Map())).status).toBe('replaced');
  });
});

describe('review focus', () => {
  it('should open on the first unanswered change, or the done panel', () => {
    expect(openingFocus(ITEMS, decisions([0, 'add']), true)).toEqual({ kind: 'item', key: PERSON.key });
    expect(openingFocus(ITEMS, decisions([0, 'add'], [1, 'add'], [3, 'add']), true)).toEqual({ kind: 'done' });
    expect(openingFocus(ITEMS, new Map(), false)).toEqual({ kind: 'done' });
    expect(openingFocus([], new Map(), true)).toEqual({ kind: 'done' });
  });

  it('should move on to the next unanswered change after an answer, wrapping, and finish when none is left', () => {
    expect(focusAfterAnswer(ITEMS, PAIR.key, decisions([0, 'add'], [2, 'decline']))).toEqual({ kind: 'item', key: PERSON.key });
    expect(focusAfterAnswer(ITEMS, QUESTION.key, decisions([3, 'add']))).toEqual({ kind: 'item', key: PAIR.key });
    expect(focusAfterAnswer(ITEMS, QUESTION.key, decisions([0, 'add'], [1, 'add'], [3, 'add']))).toEqual({ kind: 'done' });
  });

  it('should prefer the next unanswered change the filter shows, then any other still waiting', () => {
    const notPerson = (item: ReviewItem): boolean => item.key !== PERSON.key;
    expect(focusAfterAnswer(ITEMS, PAIR.key, decisions([0, 'add'], [2, 'decline']), notPerson)).toEqual({ kind: 'item', key: QUESTION.key });
    expect(focusAfterAnswer(ITEMS, PAIR.key, decisions([0, 'add'], [2, 'decline'], [3, 'add']), notPerson)).toEqual({ kind: 'item', key: PERSON.key });
  });

  it('should step through changes without wrapping, and step back into them from the done panel', () => {
    expect(movedFocus(ITEMS, { kind: 'item', key: PAIR.key }, -1)).toEqual({ kind: 'item', key: PAIR.key });
    expect(movedFocus(ITEMS, { kind: 'item', key: PAIR.key }, 1)).toEqual({ kind: 'item', key: PERSON.key });
    expect(movedFocus(ITEMS, { kind: 'item', key: QUESTION.key }, 1)).toEqual({ kind: 'item', key: QUESTION.key });
    expect(movedFocus(ITEMS, { kind: 'done' }, -1)).toEqual({ kind: 'item', key: QUESTION.key });
    expect(movedFocus(ITEMS, { kind: 'done' }, 1)).toEqual({ kind: 'done' });
    expect(movedFocus([], { kind: 'done' }, 1)).toEqual({ kind: 'done' });
  });

  it('should step only through the changes the filter shows, even from one it hides', () => {
    const notPerson = (item: ReviewItem): boolean => item.key !== PERSON.key;
    expect(movedFocus(ITEMS, { kind: 'item', key: PAIR.key }, 1, notPerson)).toEqual({ kind: 'item', key: QUESTION.key });
    expect(movedFocus(ITEMS, { kind: 'item', key: QUESTION.key }, -1, notPerson)).toEqual({ kind: 'item', key: PAIR.key });
    expect(movedFocus(ITEMS, { kind: 'item', key: PERSON.key }, 1, notPerson)).toEqual({ kind: 'item', key: QUESTION.key });
    expect(movedFocus(ITEMS, { kind: 'item', key: PAIR.key }, -1, notPerson)).toEqual({ kind: 'item', key: PAIR.key });
  });
});

describe('filterShows', () => {
  it('should show every change, the unanswered ones, or Forge’s ideas', () => {
    expect(filterShows('all', { idea: false }, false)).toBe(true);
    expect(filterShows('waiting', { idea: true }, false)).toBe(false);
    expect(filterShows('waiting', { idea: false }, true)).toBe(true);
    expect(filterShows('ideas', { idea: true }, false)).toBe(true);
    expect(filterShows('ideas', { idea: false }, true)).toBe(false);
  });
});

describe('waitingChanges', () => {
  it('should count a page offered twice once and skip actions', () => {
    expect(waitingChanges(CARD, new Map())).toBe(3);
    expect(waitingChanges(CARD, decisions([2, 'add']))).toBe(2);
    expect(waitingChanges(CARD, decisions([0, 'decline']))).toBe(3);
    expect(waitingChanges(CARD, decisions([0, 'decline'], [2, 'decline']))).toBe(2);
    expect(waitingChanges(proposal([TAMSIN, { op: 'action.plan_chapter' }]), new Map())).toBe(1);
  });
});

describe('reviewKeyAction', () => {
  const key = (value: string, modifiers: Partial<Record<'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'repeat', boolean>> = {}) => ({
    key: value,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    ...modifiers,
  });

  it('should map the review keys to their actions, whatever the letter case', () => {
    expect(reviewKeyAction(key('a'), false)).toEqual({ kind: 'add' });
    expect(reviewKeyAction(key('A'), false)).toEqual({ kind: 'add' });
    expect(reviewKeyAction(key('d'), false)).toEqual({ kind: 'decline' });
    expect(reviewKeyAction(key('j'), false)).toEqual({ kind: 'move', step: 1 });
    expect(reviewKeyAction(key('ArrowDown'), false)).toEqual({ kind: 'move', step: 1 });
    expect(reviewKeyAction(key('k'), false)).toEqual({ kind: 'move', step: -1 });
    expect(reviewKeyAction(key('ArrowUp'), false)).toEqual({ kind: 'move', step: -1 });
    expect(['1', '2', '3'].map(value => reviewKeyAction(key(value), false))).toEqual([0, 1, 2].map(position => ({ kind: 'scope', position })));
  });

  it('should ignore other keys, keys typed into a field and keys with a modifier', () => {
    expect(reviewKeyAction(key('x'), false)).toBeUndefined();
    expect(reviewKeyAction(key('4'), false)).toBeUndefined();
    expect(reviewKeyAction(key('Escape'), false)).toBeUndefined();
    expect(reviewKeyAction(key('a'), true)).toBeUndefined();
    expect(reviewKeyAction(key('a', { metaKey: true }), false)).toBeUndefined();
    expect(reviewKeyAction(key('d', { ctrlKey: true }), false)).toBeUndefined();
    expect(reviewKeyAction(key('j', { altKey: true }), false)).toBeUndefined();
    expect(reviewKeyAction(key('A', { shiftKey: true }), false)).toBeUndefined();
  });

  it('should ignore a held answer key so it answers one change, while movement keys repeat', () => {
    expect(reviewKeyAction(key('a', { repeat: true }), false)).toBeUndefined();
    expect(reviewKeyAction(key('d', { repeat: true }), false)).toBeUndefined();
    expect(reviewKeyAction(key('2', { repeat: true }), false)).toBeUndefined();
    expect(reviewKeyAction(key('j', { repeat: true }), false)).toEqual({ kind: 'move', step: 1 });
    expect(reviewKeyAction(key('ArrowUp', { repeat: true }), false)).toEqual({ kind: 'move', step: -1 });
  });
});

describe('review copy', () => {
  it('should name where the changes came from', () => {
    expect(reviewSource('organise', 12)).toBe('From organising your notes · 12 changes');
    expect(reviewSource('chat', 1)).toBe('From this chat turn · 1 change');
  });

  it('should report progress while pending and the outcome once saved', () => {
    expect(progressLabel('pending', 3, 12, 0)).toBe('3 of 12 answered');
    expect(progressLabel('applied', 12, 12, 9)).toBe('Saved · 9 added');
    expect(progressLabel('discarded', 12, 12, 0)).toBe('Saved · nothing added');
    expect(progressLabel('superseded', 0, 12, 0)).toBe('Replaced by a newer card');
  });

  it('should say how the card ended, and offer a commit the card still owes', () => {
    const none = commitBarView({ total: 2, decisions: new Map(), committing: false });
    expect(doneView({ status: 'applied', total: 12, added: 9, bar: none }).title).toBe('Your Story Bible is updated');
    expect(doneView({ status: 'applied', total: 12, added: 9, bar: none }).detail).toContain('9 changes added, 3 left out');
    expect(doneView({ status: 'discarded', total: 3, added: 0, bar: none }).detail).toBe('You left out all 3 changes.');
    expect(doneView({ status: 'superseded', total: 3, added: 0, bar: none }).title).toBe('These changes were replaced');
    expect(doneView({ status: 'pending', total: 0, added: 0, bar: none }).title).toBe('Nothing to review');
    const committing = commitBarView({ total: 2, decisions: new Map(), committing: true });
    expect(doneView({ status: 'pending', total: 2, added: 0, bar: committing })).toEqual({ title: 'Adding to your Story Bible…', detail: 'Your answers are being saved.' });
    const failed = commitBarView({ total: 2, decisions: decisions([0, 'add'], [1, 'decline']), committing: false, error: 'Offline.' });
    expect(doneView({ status: 'pending', total: 2, added: 0, bar: failed })).toMatchObject({ title: 'Couldn’t finish', commit: { label: 'Add 1 now', force: false } });
    const partial = commitBarView({ total: 3, decisions: decisions([0, 'add']), committing: false });
    expect(doneView({ status: 'pending', total: 2, added: 0, bar: partial }).commit).toEqual({ label: 'Add the 1 picked now', force: true });
  });
});
