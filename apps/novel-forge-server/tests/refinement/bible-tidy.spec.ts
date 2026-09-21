import { describe, expect, it } from 'bun:test';

import { validateChangeSet } from '@modules/refinement/change-set';
import {
  analyseBibleForTidy,
  chooseEntityType,
  composeTidyChangeSet,
  findAiNotes,
  readsLikeName,
  removeRanges,
  type TidyDoc,
  type TidyItem,
  toEntityKey,
} from '@modules/refinement/tidy/bible-tidy';

const FACTIONS_BODY = [
  '# Powers of the Delta',
  '',
  'Four blocs split the river trade between them.',
  '',
  '## The Salt Guild',
  '',
  'Merchants who own every evaporation pan south of the weir.',
  '',
  '## Lantern Order',
  '',
  'Monks who keep the channel lights burning and tax the barges for it.',
  '',
  '## House Varenne',
  '',
  'An old river dynasty holding the upper locks.',
  '',
  '## The Reed Compact (faction)',
  '',
  'Fishing villages sworn to one another against the Guild.',
].join('\n');

const NOTED_BODY = [
  'The canal city floods every spring.',
  '',
  'Brief fields: use knowledgeContract to mark when the heir learns the flood is engineered.',
  '',
  'Bargemen wear green (note: keep the colour consistent for the model) and never swim.',
  '',
  '- Tolls rise at the upper lock.',
  '- For the AI: never name the engineer before volume two.',
  '',
  'Last paragraph of prose.',
].join('\n');

function doc(section: TidyDoc['section'], slug: string, body: string | null, frontmatter: Record<string, unknown> | null = null): TidyDoc {
  return { section, slug, body, frontmatter };
}

function byKind<K extends TidyItem['kind']>(items: TidyItem[], kind: K): Extract<TidyItem, { kind: K }>[] {
  return items.filter((item): item is Extract<TidyItem, { kind: K }> => item.kind === kind);
}

describe('findAiNotes', () => {
  it('should find a brief-field paragraph, an inline note aside and an AI list item', () => {
    const notes = findAiNotes(NOTED_BODY).map(note => note.text);
    expect(notes).toEqual([
      'Brief fields: use knowledgeContract to mark when the heir learns the flood is engineered.',
      'note: keep the colour consistent for the model',
      'For the AI: never name the engineer before volume two.',
    ]);
  });

  it('should take a whole section under a notes-for-the-AI heading, without its heading', () => {
    const body = '# Canals\n\nStory prose.\n\n## Notes for the AI\n\nKeep chapters under the word target.\nNever resolve the flood early.\n\n## Bridges\n\nThree bridges.';
    const [note] = findAiNotes(body);
    expect(note?.text).toBe('Keep chapters under the word target.\nNever resolve the flood early.');
    expect(removeRanges(body, note ? [note] : [])).toBe('# Canals\n\nStory prose.\n\n## Bridges\n\nThree bridges.');
  });

  it('should leave ordinary prose and fenced code alone', () => {
    const body = 'The barges move at dawn.\n\n```\nknowledgeContract: not a note inside a fence\n```\n\nNote: the tide is higher in autumn.';
    expect(findAiNotes(body)).toEqual([]);
  });

  it('should not move story prose that only mentions a schema, frontmatter or a language model', () => {
    const body = 'The schema of the universe is woven from song.\n\nFrontmatter aside, mages are rare.\n\nThe oracle speaks like a language model, all odds and no answers.';
    expect(findAiNotes(body)).toEqual([]);
  });

  it('should not move story prose that names an AI or a model as a character', () => {
    const body = 'She sewed the gown for the model who would walk at dawn.\n\nThe colony built the vault for the AI that ran the reactor.';
    expect(findAiNotes(body)).toEqual([]);
  });

  it('should take a nested notes heading once, and leave the next story section whole', () => {
    const body = '## Notes for the AI\n\nKeep it tense.\n\n### AI notes\n\nNo dream sequences.\n\n## Bridges\n\nThree bridges cross the canal.';
    const notes = findAiNotes(body);
    expect(notes.map(note => note.text)).toEqual(['Keep it tense.\n\n### AI notes\n\nNo dream sequences.']);
    expect(removeRanges(body, notes)).toBe('## Bridges\n\nThree bridges cross the canal.');
  });
});

describe('removeRanges', () => {
  it('should merge overlapping and repeated spans instead of cutting twice', () => {
    expect(
      removeRanges('abcdefghij', [
        { start: 2, end: 5 },
        { start: 4, end: 7 },
        { start: 2, end: 5 },
      ]),
    ).toBe('abhij');
  });

  it('should remove note spans and leave a single paragraph break', () => {
    const notes = findAiNotes(NOTED_BODY);
    expect(removeRanges(NOTED_BODY, notes)).toBe(
      ['The canal city floods every spring.', '', 'Bargemen wear green and never swim.', '', '- Tolls rise at the upper lock.', '', 'Last paragraph of prose.'].join('\n'),
    );
  });
});

describe('readsLikeName', () => {
  it('should accept capitalised names and reject topic words, sentences and lowercase phrases', () => {
    expect(readsLikeName('The Salt Guild')).toBe(true);
    expect(readsLikeName('Varenne')).toBe(true);
    expect(readsLikeName('Costs and Limits')).toBe(false);
    expect(readsLikeName('Overview')).toBe(false);
    expect(readsLikeName('what the guild wants')).toBe(false);
    expect(readsLikeName('Who Rules the Delta?')).toBe(false);
  });
});

describe('chooseEntityType', () => {
  it('should prefer an explicit hint, then the name, then what the page lists, and give up rather than guess', () => {
    expect(chooseEntityType('Places', { name: 'Iron Hall', hint: 'faction' })).toBe('faction');
    expect(chooseEntityType('Places', { name: 'The Salt Guild', hint: null })).toBe('faction');
    expect(chooseEntityType('Factions', { name: 'Vess', hint: null })).toBe('faction');
    expect(chooseEntityType('The delta', { name: 'Red Temple', hint: null })).toBe('location');
    expect(chooseEntityType('Songs', { name: 'Ninefold Hymn', hint: null })).toBeNull();
  });
});

describe('toEntityKey', () => {
  it('should snake-case a name and fold accents', () => {
    expect(toEntityKey('House Varenne')).toBe('house_varenne');
    expect(toEntityKey('Éloise’s Crown')).toBe('eloise_s_crown');
  });
});

describe('analyseBibleForTidy', () => {
  const docs: TidyDoc[] = [
    doc('project', 'default', null),
    doc('world', 'default', '   \n'),
    doc('story_state', 'default', null),
    doc('world', 'delta-powers', FACTIONS_BODY, { title: 'Powers of the Delta' }),
    doc('world', 'lock-tolls', 'Tolls rise at every lock.', { title: 'lock-tolls' }),
    doc('world', 'life-on-the-delta', '## Social Order\n\nA.\n\n## Markets and Coin\n\nB.\n\n## Old Grudges\n\nC.', { title: 'Life on the Delta' }),
    doc('plot', 'river-war', '# The River War\n\nThe war begins at the weir.', { title: 'river-war' }),
    doc('world', 'canal-city', NOTED_BODY, { title: 'Canal City' }),
    doc('lore', 'houses-at-war', '## Act I\n\nA.\n\n## Act II\n\nB.\n\n## Act III\n\nC.\n\n## The Weir Pact\n\nD.', { title: 'Houses at War' }),
    doc('ai', 'style', 'Schema: keep the brief fields tidy.', { title: 'Style' }),
  ];
  const items = analyseBibleForTidy(docs, [{ entityKey: 'house_varenne', name: 'House Varenne' }]);

  it('should propose removing empty default placeholders except the one chapters fill', () => {
    expect(byKind(items, 'remove_empty').map(item => `${item.section}/${item.slug}`)).toEqual(['project/default', 'world/default']);
  });

  it('should retitle only titles stored as the slug, preferring the first heading', () => {
    expect(byKind(items, 'retitle').map(item => [item.slug, item.proposedTitle])).toEqual([
      ['lock-tolls', 'Lock tolls'],
      ['river-war', 'The River War'],
    ]);
  });

  it('should split a multi-entity document into named records, skipping ones that already exist', () => {
    const splits = byKind(items, 'split');
    expect(splits.map(item => [item.entityKey, item.entityName, item.entityType])).toEqual([
      ['the_salt_guild', 'The Salt Guild', 'faction'],
      ['lantern_order', 'Lantern Order', 'faction'],
      ['the_reed_compact', 'The Reed Compact', 'faction'],
    ]);
    expect(splits[0]?.text).toBe('Merchants who own every evaporation pan south of the weir.');
  });

  it('should not split a topic page that does not say what it lists', () => {
    expect(byKind(items, 'split').some(item => item.slug === 'life-on-the-delta')).toBe(false);
  });

  it('should not split a document that reads as a sequence of phases', () => {
    expect(byKind(items, 'split').some(item => item.slug === 'houses-at-war')).toBe(false);
  });

  it('should offer each AI note in a story page, and none from the notes-for-the-AI section itself', () => {
    const moves = byKind(items, 'move_ai_notes');
    expect(moves).toHaveLength(3);
    expect(moves.every(item => item.slug === 'canal-city' && item.targetSlug === 'world-notes')).toBe(true);
  });

  it('should give every item a distinct id', () => {
    expect(new Set(items.map(item => item.id)).size).toBe(items.length);
  });

  it('should change an id when the content it pins changes', () => {
    const edited = analyseBibleForTidy([doc('world', 'canal-city', NOTED_BODY.replace('knowledgeContract', 'knowledgeContract field'), { title: 'Canal City' })], []);
    const before = byKind(items, 'move_ai_notes').map(item => item.id);
    const after = byKind(edited, 'move_ai_notes').map(item => item.id);
    expect(after[0]).not.toBe(before[0]);
    expect(after.slice(1)).toEqual(before.slice(1));
  });
});

describe('composeTidyChangeSet', () => {
  const docs: TidyDoc[] = [
    doc('world', 'default', null),
    doc('world', 'canal-city', NOTED_BODY, { title: 'canal-city' }),
    doc('world', 'delta-powers', FACTIONS_BODY, { title: 'Powers of the Delta' }),
    doc('ai', 'world-notes', '## Earlier\n\nKept.', { title: 'World notes', owner: 'author' }),
  ];
  const items = analyseBibleForTidy(docs, []);

  it('should fold a retitle and note moves on one page into a single upsert, and append the notes to the AI page', () => {
    const selected = items.filter(item => item.slug === 'canal-city');
    const ops = composeTidyChangeSet(docs, selected);
    expect(ops.map(op => op.op)).toEqual(['bible_document.upsert', 'bible_document.upsert']);

    const [page, notes] = ops as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(page['frontmatter']).toEqual({ title: 'Canal city' });
    expect(page['body']).toBe(removeRanges(NOTED_BODY, findAiNotes(NOTED_BODY)));
    expect(notes['slug']).toBe('world-notes');
    expect(notes['frontmatter']).toEqual({ title: 'World notes', owner: 'author' });
    expect(notes['body']).toBe(
      [
        '## Earlier',
        '',
        'Kept.',
        '',
        '## From canal-city',
        '',
        'Brief fields: use knowledgeContract to mark when the heir learns the flood is engineered.',
        '',
        'note: keep the colour consistent for the model',
        '',
        'For the AI: never name the engineer before volume two.',
        '',
      ].join('\n'),
    );
  });

  it('should fold a retitle of the notes page and the notes moved onto it into one upsert', () => {
    const pages = [doc('world', 'canal-city', NOTED_BODY, { title: 'Canal City' }), doc('ai', 'world-notes', 'Kept.', { title: 'world-notes' })];
    const found = analyseBibleForTidy(pages, []);
    const ops = composeTidyChangeSet(pages, found) as unknown as Record<string, unknown>[];
    const notesOps = ops.filter(op => op['slug'] === 'world-notes');
    expect(notesOps).toHaveLength(1);
    expect(notesOps[0]?.['frontmatter']).toEqual({ title: 'World notes' });
    expect(notesOps[0]?.['body']).toStartWith('Kept.\n\n## From Canal City\n\n');
  });

  it('should move only the selected note and leave the rest of the page untouched', () => {
    const [second] = items.filter(item => item.kind === 'move_ai_notes').slice(1, 2);
    const ops = composeTidyChangeSet(docs, second ? [second] : []);
    const page = ops[0] as unknown as Record<string, unknown>;
    expect(page['frontmatter']).toEqual({ title: 'canal-city' });
    expect(page['body']).toContain('Brief fields: use knowledgeContract');
    expect(page['body']).toContain('Bargemen wear green and never swim.');
  });

  it('should honour an entity type override and create one record per split section, leaving the overview page alone', () => {
    const splits = items.filter(item => item.kind === 'split');
    const ops = composeTidyChangeSet(docs, [{ ...(splits[0] as TidyItem), entityTypeOverride: 'location' }, ...splits.slice(1)]);
    expect(ops.every(op => op.op === 'entity.upsert')).toBe(true);
    expect(ops.map(op => (op as { type: string }).type)).toEqual(['location', 'faction', 'faction', 'faction']);
  });

  it('should produce a structurally valid change-set once entity materialization is waived', () => {
    const ops = composeTidyChangeSet(docs, items);
    expect(ops[0]).toMatchObject({ op: 'bible_document.remove', section: 'world', slug: 'default' });
    expect(validateChangeSet(ops, undefined, { entityMaterialization: false })).toEqual([]);
  });
});
