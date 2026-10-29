import { textDigest } from '@shadow-library/sdk';
import { describe, expect, it } from 'bun:test';

import { mixedPagePairs } from '../src/features/chat/chat-view';
import {
  addedParagraphs,
  filterCounts,
  nextOpenItem,
  type ReviewItem,
  reviewItems,
  type ReviewItemsInput,
  reviewProgress,
  wordDiff,
} from '../src/features/chat/review-dialog-view';
import { type ProposalResponse } from '../src/lib/apis/api-types.gen';
import { type OrganiseCardEntry, type OrganiseReceipt } from '../src/lib/apis/chat.api';

type Op = ProposalResponse['changeSet'][number];

function card(kind: string, changeSet: Op[]): ReviewItemsInput['proposal'] {
  return { id: 'p1', kind: kind as 'organise', changeSet };
}

function one(input: ReviewItemsInput): ReviewItem {
  const [item] = reviewItems(input);
  if (!item) throw new Error('no item');
  return item;
}

const NOTES = 'Tamsin keeps the lamps.\n\nHollis hides a tin box.\n\nThe tide takes the pier.';
const entry = (opIndex: number, label: OrganiseCardEntry['label'], paragraphs: number[] = []): OrganiseCardEntry => ({ opIndex, label, paragraphs });
const receipt = (card: OrganiseCardEntry[], notes = NOTES): OrganiseReceipt => ({
  notesDigest: textDigest(notes),
  paragraphs: 3,
  unusedParagraphs: [],
  fromNotes: 0,
  suggested: 0,
  rules: 0,
  applied: [],
  card,
});

const PAGE: Op = { op: 'bible_document.upsert', section: 'world', slug: 'pier', body: 'The tide takes the pier.' };
const WHOLE_PAGE: Op = { ...PAGE, body: 'The tide takes the pier.\n\nGulls circle the wreck.\n\nSalt blooms on the stones.' };

describe('mixedPagePairs', () => {
  it('should pair the same page offered twice on an organise card whatever the labels', () => {
    expect(mixedPagePairs(card('organise', [PAGE, { op: 'entity.upsert', type: 'character', name: 'A' }, WHOLE_PAGE]))).toEqual(new Map([[0, 2]]));
  });

  it('should not pair on other cards, other pages or a page offered once', () => {
    expect(mixedPagePairs(card('chat', [PAGE, WHOLE_PAGE])).size).toBe(0);
    expect(mixedPagePairs(card('organise', [PAGE, { ...PAGE, slug: 'other' }])).size).toBe(0);
    expect(mixedPagePairs(card('organise', [PAGE])).size).toBe(0);
  });

  it('should not pair a page offered three or more times', () => {
    expect(mixedPagePairs(card('organise', [PAGE, WHOLE_PAGE, { ...PAGE, body: 'x' }])).size).toBe(0);
  });
});

describe('reviewItems', () => {
  it('should return nothing for an empty card or one with only actions', () => {
    expect(reviewItems({ proposal: card('chat', []) })).toEqual([]);
    expect(reviewItems({ proposal: card('chat', [{ op: 'action.plan_chapter', chapter: 2 }]) })).toEqual([]);
  });

  it('should make one item per change in order and skip actions', () => {
    const items = reviewItems({
      proposal: card('chat', [
        { op: 'premise.update', premise: 'A lamp-keeper', quote: 'she keeps lamps' },
        { op: 'action.plan_chapter', chapter: 2 },
        { op: 'entity.upsert', type: 'character', entityKey: 'tamsin', name: 'Tamsin', body: 'Keeper', motivation: 'Escape' },
      ]),
      current: [],
    });
    expect(items.map(item => item.key)).toEqual(['p1:0', 'p1:2']);
    expect(items[0]).toMatchObject({ kindLabel: 'Updates the story', group: 'premise', groupLabel: 'The story', idea: false, yourWords: 'she keeps lamps' });
    expect(items[0]?.cite).toBe('from your message: “she keeps lamps”');
    expect(items[1]).toMatchObject({ kindLabel: 'New character', title: 'Tamsin', group: 'people' });
    expect(items[1]?.content).toEqual({
      kind: 'fields',
      fields: [
        { label: 'Name', value: 'Tamsin' },
        { label: 'Who they are', value: 'Keeper' },
        { label: 'What they want', value: 'Escape' },
      ],
    });
  });

  it('should label every upsert type from whether the artifact exists', () => {
    const changeSet: Op[] = [
      { op: 'entity.upsert', type: 'faction', name: 'A' },
      { op: 'entity.upsert', type: 'location', name: 'B' },
      { op: 'entity.upsert', type: 'power_rule', name: 'C' },
      { op: 'entity.upsert', type: 'item', name: 'D' },
      { op: 'entity.upsert', type: 'concept', name: 'E' },
      { op: 'promise.create', kind: 'thread', key: 't', label: 'Who hid her?' },
      { op: 'promise.create', kind: 'mystery', key: 'm', label: 'Why?' },
      { op: 'promise.update', kind: 'thread', key: 't', status: 'open' },
      PAGE,
      { op: 'fact.upsert', factKey: 'f', body: 'x' },
      { op: 'volume.upsert', volumeKey: 'v', title: 'One' },
      { op: 'milestone.upsert', milestoneKey: 'm', label: 'Dock' },
    ];
    const labels = (current: ReviewItemsInput['current']) => reviewItems({ proposal: card('chat', changeSet), current }).map(item => item.kindLabel);
    expect(labels([])).toEqual([
      'New faction',
      'New place',
      'New power rule',
      'New item',
      'New concept',
      'New thread',
      'New mystery',
      'Updates thread',
      'New page',
      'New fact',
      'New volume',
      'New milestone',
    ]);
    expect(labels(changeSet.map((_, index) => ({ index, exists: true, values: {} })))).toEqual([
      'Updates faction',
      'Updates place',
      'Updates power rule',
      'Updates item',
      'Updates concept',
      'Updates thread',
      'Updates mystery',
      'Updates thread',
      'Updates page',
      'Updates fact',
      'Updates volume',
      'Updates milestone',
    ]);
  });

  it('should use a neutral noun and await current while it has not loaded', () => {
    const items = reviewItems({ proposal: card('chat', [PAGE, { op: 'entity.upsert', type: 'character', name: 'A' }, { op: 'brief.update', chapter: 3, body: 'x' }]) });
    expect(items.map(item => item.kindLabel)).toEqual(['Page', 'Character', 'Updates a chapter plan']);
    expect(items.map(item => item.awaitsCurrent)).toEqual([true, true, false]);
    const loaded = reviewItems({ proposal: card('chat', [PAGE]), current: [] });
    expect(loaded[0]).toMatchObject({ awaitsCurrent: false, kindLabel: 'New page' });
  });

  it('should label removals and draft ops', () => {
    const labels = reviewItems({
      proposal: card('chat', [{ op: 'fact.remove' }, { op: 'volume.remove' }, { op: 'brief.remove' }, { op: 'draft.update' }, { op: 'draft.remove' }]),
    }).map(item => item.kindLabel);
    expect(labels).toEqual(['Removes a fact', 'Removes a volume', 'Removes a chapter plan', 'Updates a draft', 'Removes a draft']);
  });

  it('should show a promise question as emphasised fields', () => {
    const item = one({ proposal: card('chat', [{ op: 'promise.create', kind: 'thread', key: 't', label: 'Who hid her?' }]), current: [] });
    expect(item.content).toEqual({ kind: 'fields', fields: [{ label: 'The open question', value: 'Who hid her?', emphasis: true }] });
  });

  it('should show a page body as markdown titled from its frontmatter', () => {
    const item = one({ proposal: card('chat', [{ op: 'bible_document.upsert', section: 'world', slug: 'the-lamps', frontmatter: { title: 'The Lamps' }, body: '# Lamps' }]) });
    expect(item.title).toBe('The Lamps');
    expect(item.content).toEqual({ kind: 'markdown', markdown: '# Lamps' });
  });

  it('should diff a page title and body rather than the raw frontmatter', () => {
    const item = one({
      proposal: card('chat', [{ op: 'bible_document.upsert', section: 'world', slug: 'p', frontmatter: { title: 'The Lamps', tags: ['a'] }, body: 'Same.' }]),
      current: [{ index: 0, exists: true, values: { frontmatter: { title: 'Lamps', tags: ['a'] }, body: 'Same.' } }],
    });
    expect(item.content.kind).toBe('diff');
    if (item.content.kind !== 'diff') return;
    expect(item.content.fields.map(field => field.label)).toEqual(['Title']);
  });

  it('should diff only the changed fields against current values', () => {
    const item = one({
      proposal: card('chat', [{ op: 'entity.upsert', type: 'character', entityKey: 'tamsin', name: 'Tamsin', body: 'Keeper of the lamps', motivation: 'Escape' }]),
      current: [{ index: 0, exists: true, values: { type: 'character', name: 'Tamsin', body: 'Keeper', motivation: 'Escape' } }],
    });
    expect(item).toMatchObject({ kindLabel: 'Updates character', unchanged: false });
    if (item.content.kind !== 'diff') throw new Error('expected diff');
    expect(item.content.fields.map(field => field.label)).toEqual(['Who they are']);
    expect(item.content.fields[0]?.segments).toEqual([
      { kind: 'same', text: 'Keeper' },
      { kind: 'added', text: ' of the lamps' },
    ]);
  });

  it('should show clearing a list as a diff', () => {
    const item = one({
      proposal: card('chat', [{ op: 'premise.update', themes: [] }]),
      current: [{ index: 0, exists: true, values: { themes: ['loss', 'tides'] } }],
    });
    if (item.content.kind !== 'diff') throw new Error('expected diff');
    expect(item.content.fields[0]).toEqual({ label: 'Themes', segments: [{ kind: 'removed', text: 'loss, tides' }] });
  });

  it('should flag an update that changes nothing and fall back to plain content', () => {
    const op = { op: 'entity.upsert', type: 'character', name: 'Tamsin', body: 'Keeper' };
    const same = one({ proposal: card('chat', [op]), current: [{ index: 0, exists: true, values: { type: 'character', name: 'Tamsin', body: 'Keeper' } }] });
    expect(same).toMatchObject({ unchanged: true });
    expect(same.content.kind).toBe('fields');
    const fresh = one({ proposal: card('chat', [op]), current: [{ index: 0, exists: false, values: {} }] });
    expect(fresh).toMatchObject({ unchanged: false, kindLabel: 'New character' });
    expect(fresh.content.kind).toBe('fields');
  });

  it('should treat a changed entity type or milestone kind as a change shown as Kind', () => {
    const entity = one({
      proposal: card('chat', [{ op: 'entity.upsert', type: 'faction', name: 'Tamsin', body: 'Keeper' }]),
      current: [{ index: 0, exists: true, values: { type: 'character', name: 'Tamsin', body: 'Keeper' } }],
    });
    expect(entity.unchanged).toBe(false);
    if (entity.content.kind !== 'diff') throw new Error('expected diff');
    expect(entity.content.fields).toEqual([
      {
        label: 'Kind',
        segments: [
          { kind: 'removed', text: 'character' },
          { kind: 'added', text: 'faction' },
        ],
      },
    ]);
    const milestone = one({
      proposal: card('chat', [{ op: 'milestone.upsert', milestoneKey: 'm', label: 'Dock', kind: 'event' }]),
      current: [{ index: 0, exists: true, values: { label: 'Dock', kind: 'rank' } }],
    });
    if (milestone.content.kind !== 'diff') throw new Error('expected diff');
    expect(milestone.content.fields.map(field => field.label)).toEqual(['Kind']);
  });

  it('should compare every current key and ignore object key order when deciding nothing changed', () => {
    const op = { op: 'bible_document.upsert', section: 'world', slug: 'p', frontmatter: { title: 'T', tags: ['a'] }, body: 'Same.' };
    const same = one({ proposal: card('chat', [op]), current: [{ index: 0, exists: true, values: { body: 'Same.', frontmatter: { tags: ['a'], title: 'T' } } }] });
    expect(same.unchanged).toBe(true);
    const hidden = one({ proposal: card('chat', [op]), current: [{ index: 0, exists: true, values: { body: 'Same.', frontmatter: { title: 'T', tags: ['b'] } } }] });
    expect(hidden.unchanged).toBe(false);
    expect(hidden.content.kind).toBe('markdown');
  });

  it('should use per-type fields for volumes, milestones and facts', () => {
    const items = reviewItems({
      proposal: card('chat', [
        { op: 'volume.upsert', volumeKey: 'v', title: 'One', objective: 'Reach the pier' },
        { op: 'milestone.upsert', milestoneKey: 'm', label: 'Dock' },
        { op: 'fact.upsert', factKey: 'f', body: 'Gulls', writerNote: 'Keep it quiet' },
      ]),
      current: [],
    });
    expect(items.map(item => item.content)).toEqual([
      {
        kind: 'fields',
        fields: [
          { label: 'Title', value: 'One' },
          { label: 'Objective', value: 'Reach the pier' },
        ],
      },
      { kind: 'fields', fields: [{ label: 'Milestone', value: 'Dock' }] },
      {
        kind: 'fields',
        fields: [
          { label: 'Text', value: 'Gulls' },
          { label: 'Writer note', value: 'Keep it quiet' },
        ],
      },
    ]);
  });

  it('should fall back to the written text for other ops', () => {
    const item = one({ proposal: card('chat', [{ op: 'brief.update', chapter: 3, title: 'The tide', body: 'Plan' }]) });
    expect(item.content).toEqual({ kind: 'markdown', markdown: 'Plan' });
  });

  it.each([
    ['suggested and suggested', [entry(0, 'suggested'), entry(1, 'from_notes', [2]), entry(2, 'suggested')]],
    ['from notes and suggested', [entry(0, 'from_notes', [3]), entry(1, 'from_notes', [2]), entry(2, 'suggested')]],
    ['no labels', []],
  ])('should merge a page offered twice into one idea item (%s)', (_name, card_) => {
    const changeSet: Op[] = [PAGE, { op: 'entity.upsert', type: 'character', name: 'Hollis', body: 'x' }, WHOLE_PAGE];
    const items = reviewItems({ proposal: card('organise', changeSet), receipt: receipt(card_), current: [] });
    expect(items.map(item => item.opIndexes)).toEqual([[0, 2], [1]]);
    const pair = items[0];
    expect(pair).toMatchObject({ key: 'p1:0', idea: true, tag: 'not in your notes' });
    expect(pair?.content).toEqual({ kind: 'markdown', markdown: 'The tide takes the pier.' });
    expect(pair?.versions?.map(version => [version.opIndex, version.key, version.addedBlocks])).toEqual([
      [0, 'notes', 0],
      [2, 'forge', 2],
    ]);
    expect(pair?.versions?.[1]?.content).toEqual({
      kind: 'blocks',
      blocks: [
        { markdown: 'The tide takes the pier.', added: false },
        { markdown: 'Gulls circle the wreck.', added: true },
        { markdown: 'Salt blooms on the stones.', added: true },
      ],
    });
  });

  it('should not pair the same page twice on a card that is not an organise card', () => {
    expect(reviewItems({ proposal: card('chat', [PAGE, WHOLE_PAGE]), current: [] })).toHaveLength(2);
  });

  it('should keep a lone page half and plain entries as single items', () => {
    const items = reviewItems({ proposal: card('organise', [PAGE]), receipt: receipt([entry(0, 'suggested')]) });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ opIndexes: [0], idea: true });
    expect(items[0]?.versions).toBeUndefined();
  });

  it('should treat a missing receipt as a plain item', () => {
    const item = one({ proposal: card('organise', [{ op: 'entity.upsert', type: 'character', name: 'Tamsin' }]) });
    expect(item).toMatchObject({ idea: false, tag: undefined, note: undefined, yourWords: undefined });
  });

  it('should tag planner-only entries and note retired ones', () => {
    const items = reviewItems({
      proposal: card('organise', [
        { op: 'entity.upsert', type: 'character', name: 'A' },
        { op: 'entity.upsert', type: 'character', name: 'B' },
      ]),
      receipt: receipt([entry(0, 'planner_only'), entry(1, 'retired')]),
    });
    expect(items[0]?.tag).toBe('planner-only');
    expect(items[1]?.note).toBe('Takes out an earlier organise entry');
  });

  it('should quote the notes paragraphs while the digest matches', () => {
    const proposal = card('organise', [{ op: 'entity.upsert', type: 'character', name: 'Hollis' }]);
    const item = one({ proposal, receipt: receipt([entry(0, 'from_notes', [1, 2])]), notes: NOTES });
    expect(item.yourWords).toBe('Tamsin keeps the lamps.\n\nHollis hides a tin box.');
    expect(item.cite).toBe('from your notes, ¶1, ¶2');
  });

  it('should drop the notes text when the notes changed, are missing or the number is out of range', () => {
    const proposal = card('organise', [{ op: 'entity.upsert', type: 'character', name: 'Hollis' }]);
    const given = receipt([entry(0, 'from_notes', [1])]);
    expect(one({ proposal, receipt: given, notes: `${NOTES} more` }).yourWords).toBeUndefined();
    expect(one({ proposal, receipt: given }).yourWords).toBeUndefined();
    expect(one({ proposal, notes: NOTES }).yourWords).toBeUndefined();
    expect(one({ proposal, receipt: receipt([entry(0, 'from_notes', [9])]), notes: NOTES }).yourWords).toBeUndefined();
  });
});

describe('wordDiff', () => {
  it('should mark added and removed words and merge neighbours', () => {
    expect(wordDiff('The tide takes the pier.', 'The sea takes the old pier.')).toEqual([
      { kind: 'same', text: 'The ' },
      { kind: 'removed', text: 'tide' },
      { kind: 'added', text: 'sea' },
      { kind: 'same', text: ' takes the' },
      { kind: 'added', text: ' old' },
      { kind: 'same', text: ' pier.' },
    ]);
  });

  it('should treat punctuation as its own token', () => {
    expect(wordDiff('a, b', 'a; b')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: ',' },
      { kind: 'added', text: ';' },
      { kind: 'same', text: ' b' },
    ]);
  });

  it('should fold a whitespace-only gap between two changes into the change', () => {
    expect(wordDiff('one two end', 'uno dos end')).toEqual([
      { kind: 'removed', text: 'one two' },
      { kind: 'added', text: 'uno dos' },
      { kind: 'same', text: ' end' },
    ]);
  });

  it('should handle empty sides and identical text', () => {
    expect(wordDiff('', '')).toEqual([]);
    expect(wordDiff('', 'new text')).toEqual([{ kind: 'added', text: 'new text' }]);
    expect(wordDiff('old text', '')).toEqual([{ kind: 'removed', text: 'old text' }]);
    expect(wordDiff('same', 'same')).toEqual([{ kind: 'same', text: 'same' }]);
  });

  it('should reconstruct both sides from the segments', () => {
    const before = 'one two three four five six\n\nsecond paragraph here';
    const after = 'one 2 three five six seven\n\nsecond paragraph there\n\nthird';
    const segments = wordDiff(before, after);
    expect(
      segments
        .filter(s => s.kind !== 'added')
        .map(s => s.text)
        .join(''),
    ).toBe(before);
    expect(
      segments
        .filter(s => s.kind !== 'removed')
        .map(s => s.text)
        .join(''),
    ).toBe(after);
  });

  it('should keep segments small for a long page edited near both ends', () => {
    const paragraph = (n: number): string => Array.from({ length: 100 }, (_, i) => `w${n}x${i}`).join(' ');
    const paragraphs = Array.from({ length: 20 }, (_, n) => paragraph(n));
    const before = paragraphs.join('\n\n');
    const edited = [...paragraphs];
    edited[0] = (edited[0] ?? '').replace('w0x3', 'changed');
    edited[19] = (edited[19] ?? '').replace('w19x96', 'altered');
    const segments = wordDiff(before, edited.join('\n\n'));
    const changed = segments.filter(s => s.kind !== 'same');
    expect(changed.map(s => s.text)).toEqual(['w0x3', 'changed', 'w19x96', 'altered']);
    expect(segments.length).toBeLessThanOrEqual(7);
  });

  it('should keep segments short when every paragraph of a page is lightly edited', () => {
    const paragraph = (n: number, word: string): string => Array.from({ length: 60 }, (_, i) => (i === 30 ? word : `w${n}x${i}`)).join(' ');
    const before = Array.from({ length: 25 }, (_, n) => paragraph(n, 'old')).join('\n\n');
    const after = Array.from({ length: 25 }, (_, n) => paragraph(n, 'new')).join('\n\n');
    const changed = wordDiff(before, after).filter(s => s.kind !== 'same');
    expect(changed).toHaveLength(50);
    expect(changed.every(s => s.text === 'old' || s.text === 'new')).toBe(true);
  });

  it('should fall back to whole replacement for huge unrelated text', () => {
    const before = Array.from({ length: 3000 }, (_, i) => `a${i}`).join(' ');
    const after = Array.from({ length: 3000 }, (_, i) => `b${i}`).join(' ');
    expect(wordDiff(before, after).map(s => s.kind)).toEqual(['removed', 'added']);
  });
});

describe('addedParagraphs', () => {
  it('should flag only paragraphs missing from the notes body', () => {
    expect(addedParagraphs('One.\n\nTwo.', 'One.\n\nNew.\n\nTwo.')).toEqual([
      { markdown: 'One.', added: false },
      { markdown: 'New.', added: true },
      { markdown: 'Two.', added: false },
    ]);
  });
});

describe('review progress', () => {
  const item = (key: string, idea = false): ReviewItem => ({
    key,
    opIndexes: [0],
    group: 'other',
    groupLabel: 'Other',
    kindLabel: 'x',
    title: key,
    idea,
    content: { kind: 'markdown', markdown: '' },
    awaitsCurrent: false,
    unchanged: false,
  });
  const items = [item('a'), item('b', true), item('c'), item('d', true)];

  it('should count all, waiting and idea items', () => {
    expect(filterCounts(items, i => i.key === 'a')).toEqual({ all: 4, waiting: 3, ideas: 2 });
    expect(filterCounts([], () => false)).toEqual({ all: 0, waiting: 0, ideas: 0 });
  });

  it('should find the next open item, wrapping and skipping decided ones', () => {
    const decided = new Set(['b', 'c']);
    expect(nextOpenItem(items, 'a', i => decided.has(i.key))).toBe('d');
    expect(nextOpenItem(items, 'd', i => decided.has(i.key))).toBe('a');
    expect(nextOpenItem(items, 'zzz', i => decided.has(i.key))).toBe('a');
  });

  it('should return the item itself when it is the only one open and undefined when all are decided', () => {
    expect(nextOpenItem(items, 'a', i => i.key !== 'a')).toBe('a');
    expect(nextOpenItem(items, 'a', () => true)).toBeUndefined();
    expect(nextOpenItem([], 'a', () => false)).toBeUndefined();
  });

  it('should report answered against total', () => {
    expect(reviewProgress(items, i => i.idea)).toEqual({ answered: 2, total: 4 });
    expect(reviewProgress([], () => true)).toEqual({ answered: 0, total: 0 });
  });
});
