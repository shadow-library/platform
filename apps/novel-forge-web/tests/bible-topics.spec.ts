import { describe, expect, it } from 'bun:test';

import { type BibleDocListItem, type BibleReadinessRoleResponse } from '../src/lib/apis/api-types.gen';
import { documentTopic, entityTopic, newEntryType, parseBibleTopic, stagesByDocument, tabsFit, topicByKeywords, topicForEntityType } from '../src/lib/bible-topics';

function doc(overrides: Partial<BibleDocListItem> & Pick<BibleDocListItem, 'section' | 'slug'>): BibleDocListItem {
  return { title: overrides.slug, wordCount: 100, isEmpty: false, updatedAt: '2026-01-01T00:00:00.000Z', ...overrides };
}

function role(overrides: Partial<BibleReadinessRoleResponse> & Pick<BibleReadinessRoleResponse, 'stage'>): BibleReadinessRoleResponse {
  return { label: overrides.stage, address: 'project/premise', covered: true, coveredBy: [], ...overrides };
}

describe('entityTopic', () => {
  it('should file every typed record under its obvious topic', () => {
    expect(entityTopic({ type: 'character', name: 'Detective Amara' })).toBe('people');
    expect(entityTopic({ type: 'faction', name: 'House Velan' })).toBe('factions');
    expect(entityTopic({ type: 'location', name: 'The Salt Docks' })).toBe('places');
    expect(entityTopic({ type: 'power_rule', name: 'Tidebinding costs breath' })).toBe('power');
    expect(entityTopic({ type: 'item', name: 'Tideglass' })).toBe('objects');
  });

  it('should read a concept by its name first', () => {
    expect(entityTopic({ type: 'concept', name: 'The Tidebinding System', excerpt: 'An old history of the docks.' })).toBe('power');
    expect(entityTopic({ type: 'concept', name: 'The Harbour Crew' })).toBe('people');
    expect(entityTopic({ type: 'concept', name: 'The Lantern Guild' })).toBe('factions');
  });

  it('should fall back to the opening lines when the name says nothing', () => {
    expect(entityTopic({ type: 'concept', name: 'Stillwater', excerpt: 'A walled city on the northern delta.' })).toBe('places');
  });

  it('should default an unreadable concept to lore', () => {
    expect(entityTopic({ type: 'concept', name: 'The Debt', excerpt: 'What is owed is never forgotten.' })).toBe('lore');
  });
});

describe('topicByKeywords', () => {
  it('should match whole words only', () => {
    expect(topicByKeywords('Classical music')).toBeUndefined();
    expect(topicByKeywords('Magic classes')).toBe('power');
  });

  it('should prefer the earlier topic when a text reads as two', () => {
    expect(topicByKeywords('The cast of the city')).toBe('people');
  });

  it('should only consider the allowed topics', () => {
    expect(topicByKeywords('The war for the magic', ['people', 'places'])).toBeUndefined();
  });
});

describe('documentTopic', () => {
  it('should send anything marked author-only to Author-only, whatever its section', () => {
    expect(documentTopic(doc({ section: 'plot', slug: 'ending', title: 'Author-only: the true ending' }))).toBe('author');
    expect(documentTopic(doc({ section: 'world', slug: 'author-notes' }))).toBe('author');
  });

  it('should keep a power document with power', () => {
    expect(documentTopic(doc({ section: 'power', slug: 'rules-and-limits', title: 'Rules & Limits' }))).toBe('power');
    expect(documentTopic(doc({ section: 'power', slug: 'house-ranks', title: 'Ranks of the Houses' }))).toBe('power');
  });

  it('should keep a plot or project page as story core unless its title is about the cast, a group or a place', () => {
    expect(documentTopic(doc({ section: 'project', slug: 'premise', title: 'Premise' }))).toBe('core');
    expect(documentTopic(doc({ section: 'plot', slug: 'the-war-begins', title: 'The War Begins' }))).toBe('core');
    expect(documentTopic(doc({ section: 'plot', slug: 'relationship-arc', title: 'Relationship Arc' }))).toBe('people');
    expect(documentTopic(doc({ section: 'story_state', slug: 'guilds', title: 'Where the Guilds Stand' }))).toBe('factions');
  });

  it('should let a world or lore page file by any topic its title names', () => {
    expect(documentTopic(doc({ section: 'world', slug: 'geography', title: 'Geography' }))).toBe('places');
    expect(documentTopic(doc({ section: 'lore', slug: 'relics', title: 'Relics of the Old Age' }))).toBe('objects');
  });

  it('should use the readiness role a page covers when its title names no topic', () => {
    const stages = stagesByDocument([role({ stage: 'characters', coveredBy: ['world/who-is-who'] })]);
    expect(documentTopic(doc({ section: 'world', slug: 'who-is-who', title: 'Who Is Who' }), stages)).toBe('people');
  });

  it('should fall back to the storage section', () => {
    expect(documentTopic(doc({ section: 'world', slug: 'overview', title: 'Overview' }))).toBe('lore');
    expect(documentTopic(doc({ section: 'ai', slug: 'pacing', title: 'Pacing & Tone' }))).toBe('core');
  });

  it('should read the slug as words when the title is missing its keyword', () => {
    expect(documentTopic(doc({ section: 'world', slug: 'major-cities', title: 'Where people live' }))).toBe('places');
  });
});

describe('stagesByDocument', () => {
  it('should file a page covering several roles under the earliest in manifest order', () => {
    const roles = [role({ stage: 'characters', coveredBy: ['world/setting'] }), role({ stage: 'world', coveredBy: ['world/setting', 'lore/songs'] })];
    const stages = stagesByDocument(roles);
    expect(stages.get('world/setting')).toBe('world');
    expect(stages.get('lore/songs')).toBe('world');
  });

  it('should be empty before readiness has loaded', () => {
    expect(stagesByDocument(undefined).size).toBe(0);
  });
});

describe('topicForEntityType', () => {
  it('should map a typed record and leave a concept to be read', () => {
    expect(topicForEntityType('location')).toBe('places');
    expect(topicForEntityType('concept')).toBeUndefined();
  });
});

describe('parseBibleTopic', () => {
  it('should accept a known topic and reject anything else', () => {
    expect(parseBibleTopic('people')).toBe('people');
    expect(parseBibleTopic('everything')).toBeUndefined();
    expect(parseBibleTopic(undefined)).toBeUndefined();
  });
});

describe('newEntryType', () => {
  it('should start a new entry as the kind its topic holds', () => {
    expect(newEntryType('people')).toBe('character');
    expect(newEntryType('factions')).toBe('faction');
    expect(newEntryType('places')).toBe('location');
    expect(newEntryType('power')).toBe('power_rule');
    expect(newEntryType('objects')).toBe('item');
  });

  it('should fall back to a concept where no record kind belongs to the topic', () => {
    expect(newEntryType('core')).toBe('concept');
    expect(newEntryType('lore')).toBe('concept');
    expect(newEntryType('author')).toBe('concept');
  });
});

describe('tabsFit', () => {
  it('should keep the tabs until they have been measured and the room is known', () => {
    expect(tabsFit(undefined, 300)).toBe(true);
    expect(tabsFit(900, 0)).toBe(true);
  });

  it('should keep the tabs while they fit and swap them once they do not', () => {
    expect(tabsFit(900, 900)).toBe(true);
    expect(tabsFit(900, 1200)).toBe(true);
    expect(tabsFit(900, 899)).toBe(false);
  });
});
