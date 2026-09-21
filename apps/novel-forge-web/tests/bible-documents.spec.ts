import { describe, expect, it } from 'bun:test';

import { type BibleReadinessRoleResponse } from '../src/lib/apis/api-types.gen';
import { BIBLE_DOC_SECTION_LABEL, bibleHealth, docAddress, emptyPlaceholdersLabel, topicCoverageLabel, topicsByDocument } from '../src/lib/bible-documents';

describe('BIBLE_DOC_SECTION_LABEL', () => {
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

describe('emptyPlaceholdersLabel', () => {
  it('should use the singular for exactly one', () => {
    expect(emptyPlaceholdersLabel(1)).toBe('1 empty placeholder page');
  });

  it('should use the plural otherwise', () => {
    expect(emptyPlaceholdersLabel(3)).toBe('3 empty placeholder pages');
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

describe('bibleHealth', () => {
  it('should count records and guides together as entries', () => {
    const health = bibleHealth({ records: 5, guides: 2, secrets: 3, emptyPages: 1, roles: undefined });
    expect(health).toEqual({ entries: 7, records: 5, guides: 2, secrets: 3, emptyPages: 1 });
  });

  it('should leave topic coverage out until readiness reports roles', () => {
    expect(bibleHealth({ records: 0, guides: 0, secrets: 0, emptyPages: 0, roles: [] }).topics).toBeUndefined();
  });

  it('should report covered topics and name the missing ones in manifest order', () => {
    const roles = [role({ label: 'Premise', covered: true }), role({ label: 'Power system', covered: false }), role({ label: 'Cast', covered: false })];
    expect(bibleHealth({ records: 0, guides: 0, secrets: 0, emptyPages: 0, roles }).topics).toEqual({ covered: 1, total: 3, missing: ['Power system', 'Cast'] });
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
