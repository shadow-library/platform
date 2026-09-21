import { describe, expect, it } from 'bun:test';

import { type BibleDocListItem } from '../src/lib/apis/api-types.gen';
import {
  type BibleEntry,
  buildCatalogue,
  countByTopic,
  defaultTopic,
  type EntryEntity,
  entryMeta,
  entryTarget,
  filterEntries,
  groupByTopic,
  groupWithinTopic,
  guideChangedSince,
  guideId,
  guidesMentioning,
  leadSection,
  mentionedEntities,
  mentionsName,
  parseGuideAddress,
  recentEntries,
  recordId,
  visibleTopics,
} from '../src/lib/bible-entries';

function entity(overrides: Partial<EntryEntity> & Pick<EntryEntity, 'entityKey'>): EntryEntity {
  return { id: overrides.entityKey, name: overrides.entityKey, type: 'character', updatedAt: '2026-03-01T00:00:00.000Z', ...overrides };
}

function doc(overrides: Partial<BibleDocListItem> & Pick<BibleDocListItem, 'section' | 'slug'>): BibleDocListItem {
  return { title: overrides.slug, wordCount: 300, isEmpty: false, updatedAt: '2026-03-01T00:00:00.000Z', ...overrides };
}

const entities: EntryEntity[] = [
  entity({ entityKey: 'amara', name: 'Detective Amara', significance: 'major', body: 'A harbour detective who never sleeps.' }),
  entity({ entityKey: 'boone', name: 'Sergeant Boone' }),
  entity({ entityKey: 'velan', name: 'House Velan', type: 'faction' }),
  entity({ entityKey: 'crew', name: 'The Night Crew', type: 'concept' }),
  entity({ entityKey: 'docks', name: 'The Salt Docks', type: 'location', updatedAt: '2026-03-20T00:00:00.000Z' }),
];

const docs: BibleDocListItem[] = [
  doc({ section: 'project', slug: 'premise', title: 'Premise', excerpt: 'Detective Amara hunts a forger.' }),
  doc({ section: 'plot', slug: 'cast-arcs', title: 'Cast Arcs', excerpt: 'How Sergeant Boone falls.', updatedAt: '2026-03-19T00:00:00.000Z' }),
  doc({ section: 'world', slug: 'default', title: 'Default', isEmpty: true, wordCount: 0 }),
];

const catalogue = buildCatalogue(entities, docs);

function byId(id: string): BibleEntry {
  const entry = catalogue.entries.find(candidate => candidate.id === id);
  if (!entry) throw new Error(`missing ${id}`);
  return entry;
}

describe('buildCatalogue', () => {
  it('should make one entry per record and per written guide', () => {
    expect(catalogue.entries.map(entry => entry.id).sort()).toEqual(
      ['guide:plot/cast-arcs', 'guide:project/premise', 'record:amara', 'record:boone', 'record:crew', 'record:docks', 'record:velan'].sort(),
    );
  });

  it('should hold empty placeholder pages apart with their topic', () => {
    expect(catalogue.emptyDocs).toEqual([{ topic: 'lore', doc: docs[2] as BibleDocListItem }]);
  });

  it('should give each entry its topic and a plain one-line summary', () => {
    expect(byId('record:amara')).toMatchObject({ topic: 'people', summary: 'A harbour detective who never sleeps.' });
    expect(byId('record:crew').topic).toBe('people');
    expect(byId('guide:plot/cast-arcs').topic).toBe('people');
    expect(byId('guide:project/premise')).toMatchObject({ topic: 'core', summary: 'Detective Amara hunts a forger.' });
  });
});

describe('countByTopic and visibleTopics', () => {
  it('should count every topic, empty ones as zero', () => {
    const counts = countByTopic(catalogue.entries);
    expect(counts).toMatchObject({ core: 1, people: 4, factions: 1, places: 1, power: 0 });
  });

  it('should hide empty topics but keep the active one', () => {
    const counts = countByTopic(catalogue.entries);
    expect(visibleTopics(counts)).toEqual(['core', 'people', 'factions', 'places']);
    expect(visibleTopics(counts, 'power')).toEqual(['core', 'people', 'factions', 'places', 'power']);
  });

  it('should default to the first topic with anything in it', () => {
    expect(defaultTopic(countByTopic([{ topic: 'places' }, { topic: 'lore' }]))).toBe('places');
    expect(defaultTopic(countByTopic([]))).toBe('core');
  });
});

describe('groupWithinTopic', () => {
  it('should head records by kind in canonical order, major first, then the guides', () => {
    const people = catalogue.entries.filter(entry => entry.topic === 'people');
    const groups = groupWithinTopic(people, 'people');
    expect(groups.map(group => group.label)).toEqual(['Characters', 'Groups', 'Guides']);
    expect(groups[0]?.entries.map(entry => entry.name)).toEqual(['Detective Amara', 'Sergeant Boone']);
  });

  it('should head a concept outside the cast and factions as a concept', () => {
    const lore = [{ ...byId('record:crew'), topic: 'lore' as const }];
    expect(groupWithinTopic(lore, 'lore').map(group => group.label)).toEqual(['Concepts']);
  });
});

describe('groupByTopic', () => {
  it('should group by topic in tab order and drop empty topics', () => {
    expect(groupByTopic(catalogue.entries).map(group => group.label)).toEqual(['Story core', 'People', 'Factions & peoples', 'Places']);
  });
});

describe('filterEntries', () => {
  const secretCounts = new Map([['boone', 2]]);

  it('should narrow by kind', () => {
    expect(filterEntries(catalogue.entries, 'guides', secretCounts).every(entry => entry.kind === 'guide')).toBe(true);
    expect(filterEntries(catalogue.entries, 'records', secretCounts)).toHaveLength(5);
    expect(filterEntries(catalogue.entries, 'secrets', secretCounts).map(entry => entry.id)).toEqual(['record:boone']);
  });

  it('should search names, keys and summaries case-insensitively', () => {
    expect(filterEntries(catalogue.entries, 'all', secretCounts, 'FORGER').map(entry => entry.id)).toEqual(['guide:project/premise']);
    expect(filterEntries(catalogue.entries, 'all', secretCounts, 'velan').map(entry => entry.id)).toEqual(['record:velan']);
  });
});

describe('recentEntries', () => {
  it('should list the week’s changes newest first and keep older ones apart', () => {
    const recent = recentEntries(catalogue.entries, new Date('2026-03-21T00:00:00.000Z'));
    expect(recent.thisWeek.map(entry => entry.id)).toEqual(['record:docks', 'guide:plot/cast-arcs']);
    expect(recent.earlier).toHaveLength(5);
  });
});

describe('entryMeta', () => {
  it('should say only what a kind header does not', () => {
    expect(entryMeta(byId('record:amara'), false)).toBe('Major');
    expect(entryMeta(byId('guide:project/premise'), false)).toBe('300 words');
  });

  it('should name the kind in a mixed list', () => {
    expect(entryMeta(byId('record:boone'), true)).toBe('Character · minor');
    expect(entryMeta(byId('guide:project/premise'), true)).toBe('Guide · 300 words');
  });
});

describe('entry addresses', () => {
  it('should round-trip a guide address through the URL', () => {
    expect(parseGuideAddress('plot/cast-arcs')).toEqual({ section: 'plot', slug: 'cast-arcs' });
    expect(guideId({ section: 'plot', slug: 'cast-arcs' })).toBe('guide:plot/cast-arcs');
    expect(entryTarget(byId('guide:plot/cast-arcs'))).toEqual({ guide: 'plot/cast-arcs' });
    expect(entryTarget(byId('record:amara'))).toEqual({ entity: 'amara' });
    expect(recordId('amara')).toBe('record:amara');
  });

  it('should reject an unknown section or a missing slug', () => {
    expect(parseGuideAddress('diary/entry')).toBeUndefined();
    expect(parseGuideAddress('plot/')).toBeUndefined();
    expect(parseGuideAddress('plot')).toBeUndefined();
    expect(parseGuideAddress(3)).toBeUndefined();
  });
});

describe('mentionsName', () => {
  it('should match a whole name regardless of case or line breaks inside it', () => {
    expect(mentionsName('then detective\namara arrived', 'Detective Amara')).toBe(true);
  });

  it('should not match a name inside a longer word', () => {
    expect(mentionsName('The Boonesfield road', 'Boone')).toBe(false);
    expect(mentionsName('Boone’s badge', 'Boone')).toBe(true);
  });

  it('should ignore names too short to mean anything', () => {
    expect(mentionsName('Al went home', 'Al')).toBe(false);
  });

  it('should treat regex characters in a name literally', () => {
    expect(mentionsName('The (Old) Pier', '(Old) Pier')).toBe(true);
    expect(mentionsName('The Old Pier', '(Old) Pier')).toBe(false);
  });
});

describe('mentionedEntities', () => {
  it('should list the records a text names, alphabetically', () => {
    expect(mentionedEntities('Sergeant Boone met Detective Amara at the Salt Docks.', entities).map(entity => entity.entityKey)).toEqual(['amara', 'boone', 'docks']);
  });
});

describe('guidesMentioning', () => {
  it('should match a name against each written guide’s title and excerpt', () => {
    expect(guidesMentioning('Sergeant Boone', docs).map(entry => entry.slug)).toEqual(['cast-arcs']);
    expect(guidesMentioning('Default', docs)).toEqual([]);
  });
});

describe('leadSection', () => {
  it('should keep a short body whole', () => {
    expect(leadSection('One paragraph.')).toEqual({ lead: 'One paragraph.', truncated: false });
  });

  it('should stop before the second heading', () => {
    const body = 'Opening.\n\n## Voice\n\nClipped.\n\n## History\n\nLong ago.';
    expect(leadSection(body)).toEqual({ lead: 'Opening.\n\n## Voice\n\nClipped.', truncated: true });
  });

  it('should stop at a block boundary once the lead is long enough', () => {
    const body = `${'a'.repeat(50)}\n\n${'b'.repeat(50)}\n\n${'c'.repeat(50)}`;
    expect(leadSection(body, 60)).toEqual({ lead: `${'a'.repeat(50)}\n\n${'b'.repeat(50)}`, truncated: true });
  });

  it('should never cut a leading heading from its first paragraph', () => {
    expect(leadSection('## Only\n\nText.\n\n## Next\n\nMore.', 1).lead).toBe('## Only\n\nText.');
  });

  it('should read an empty body as nothing to show', () => {
    expect(leadSection('')).toEqual({ lead: '', truncated: false });
  });
});

describe('guideChangedSince', () => {
  it('should see no change when the guide still carries the time the editor opened on', () => {
    expect(guideChangedSince('2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00Z')).toBe(false);
  });

  it('should see a change once the guide was saved again', () => {
    expect(guideChangedSince('2026-03-01T00:00:00.000Z', '2026-03-01T00:00:01.000Z')).toBe(true);
  });

  it('should treat an unknown starting point as changed so it can never overwrite blind', () => {
    expect(guideChangedSince(undefined, '2026-03-01T00:00:00.000Z')).toBe(true);
  });
});
