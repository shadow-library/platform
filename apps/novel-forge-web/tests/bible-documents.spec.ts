import { describe, expect, it } from 'bun:test';

import { type BibleDocListItem, type BibleReadinessRoleResponse } from '../src/lib/apis/api-types.gen';
import {
  BIBLE_DOC_SECTION_LABEL,
  bibleHealth,
  docAddress,
  docLengthLabel,
  emptyPagesLabel,
  emptyToggleLabel,
  groupBibleDocs,
  topicCoverageLabel,
  topicsByDocument,
} from '../src/lib/bible-documents';

function doc(overrides: Partial<BibleDocListItem> & Pick<BibleDocListItem, 'section' | 'slug'>): BibleDocListItem {
  return { title: overrides.slug, wordCount: 10, isEmpty: false, updatedAt: '2026-01-01T00:00:00.000Z', ...overrides };
}

describe('groupBibleDocs', () => {
  it('should order sections project, world, power, plot, story_state, ai, lore regardless of input order', () => {
    const docs = [doc({ section: 'lore', slug: 'songs' }), doc({ section: 'project', slug: 'premise' }), doc({ section: 'power', slug: 'gauges' })];
    expect(groupBibleDocs(docs).map(g => g.section)).toEqual(['project', 'power', 'lore']);
  });

  it('should leave out sections with no documents', () => {
    const docs = [doc({ section: 'world', slug: 'canal' })];
    expect(groupBibleDocs(docs).map(g => g.section)).toEqual(['world']);
  });

  it('should split a section into filled and empty documents', () => {
    const docs = [doc({ section: 'world', slug: 'canal' }), doc({ section: 'world', slug: 'default', isEmpty: true, wordCount: 0 })];
    const [group] = groupBibleDocs(docs);
    expect(group?.filled.map(d => d.slug)).toEqual(['canal']);
    expect(group?.empty.map(d => d.slug)).toEqual(['default']);
  });

  it('should label every section the way the owner named it', () => {
    expect(BIBLE_DOC_SECTION_LABEL.project).toBe('Core');
    expect(BIBLE_DOC_SECTION_LABEL.world).toBe('World');
    expect(BIBLE_DOC_SECTION_LABEL.power).toBe('Power');
    expect(BIBLE_DOC_SECTION_LABEL.plot).toBe('Plot');
    expect(BIBLE_DOC_SECTION_LABEL.story_state).toBe('Where things stand');
    expect(BIBLE_DOC_SECTION_LABEL.ai).toBe('Notes for the AI');
    expect(BIBLE_DOC_SECTION_LABEL.lore).toBe('Lore');
  });
});

describe('emptyPagesLabel', () => {
  it('should use the singular for exactly one', () => {
    expect(emptyPagesLabel(1)).toBe('1 empty page');
  });

  it('should use the plural otherwise', () => {
    expect(emptyPagesLabel(0)).toBe('0 empty pages');
    expect(emptyPagesLabel(3)).toBe('3 empty pages');
  });
});

describe('emptyToggleLabel', () => {
  it('should offer to reveal while collapsed and to hide again once revealed', () => {
    expect(emptyToggleLabel(1, false)).toBe('1 empty page');
    expect(emptyToggleLabel(2, false)).toBe('2 empty pages');
    expect(emptyToggleLabel(1, true)).toBe('Hide empty pages');
  });
});

function role(overrides: Partial<BibleReadinessRoleResponse> & Pick<BibleReadinessRoleResponse, 'label'>): BibleReadinessRoleResponse {
  return { stage: 'world', address: 'world/setting', covered: (overrides.coveredBy ?? []).length > 0, coveredBy: [], ...overrides };
}

describe('docAddress', () => {
  it('should join section and slug the way readiness names documents', () => {
    expect(docAddress({ section: 'world', slug: 'canal-city' })).toBe('world/canal-city');
  });
});

describe('topicsByDocument', () => {
  it('should list every topic a document covers', () => {
    const topics = topicsByDocument([
      role({ label: 'World and setting', coveredBy: ['world/canal-city'] }),
      role({ label: 'Factions and locations', coveredBy: ['world/canal-city', '2 faction records and 3 location records'] }),
    ]);
    expect(topics.get('world/canal-city')).toEqual(['World and setting', 'Factions and locations']);
  });

  it('should leave record summaries unmatched by any document', () => {
    const topics = topicsByDocument([role({ label: 'Cast', coveredBy: ['4 character records'] })]);
    expect(topics.get('world/canal-city')).toBeUndefined();
  });

  it('should be empty before readiness has loaded or when it carries no roles', () => {
    expect(topicsByDocument(undefined).size).toBe(0);
    expect(topicsByDocument([]).size).toBe(0);
  });
});

describe('docLengthLabel', () => {
  it('should say a page is empty rather than counting zero words', () => {
    expect(docLengthLabel({ isEmpty: true, wordCount: 0 })).toBe('Empty');
  });

  it('should count the words of a written page', () => {
    expect(docLengthLabel({ isEmpty: false, wordCount: 1 })).toBe('1 word');
    expect(docLengthLabel({ isEmpty: false, wordCount: 420 })).toBe('420 words');
  });
});

describe('bibleHealth', () => {
  const docs = [{ isEmpty: false }, { isEmpty: false }, { isEmpty: true }];

  it('should count written pages apart from empty ones', () => {
    const health = bibleHealth({ docs, entities: 5, facts: 2, roles: undefined });
    expect(health).toEqual({ pages: 2, emptyPages: 1, entities: 5, facts: 2 });
  });

  it('should leave topic coverage out until readiness reports roles', () => {
    expect(bibleHealth({ docs, entities: 0, facts: 0, roles: [] }).topics).toBeUndefined();
  });

  it('should report covered topics and name the missing ones in manifest order', () => {
    const roles = [role({ label: 'Premise', covered: true }), role({ label: 'Power system', covered: false }), role({ label: 'Cast', covered: false })];
    expect(bibleHealth({ docs, entities: 0, facts: 0, roles }).topics).toEqual({ covered: 1, total: 3, missing: ['Power system', 'Cast'] });
  });
});

describe('topicCoverageLabel', () => {
  it('should say every topic is covered when nothing is missing', () => {
    expect(topicCoverageLabel({ covered: 7, total: 7, missing: [] })).toBe('Every topic covered');
  });

  it('should name the missing topics', () => {
    expect(topicCoverageLabel({ covered: 5, total: 7, missing: ['Power system', 'Cast'] })).toBe('Missing: Power system, Cast');
  });
});
