import { describe, expect, it } from 'bun:test';

import {
  BIBLE_MANIFEST,
  BIBLE_STAGE_ORDER,
  chapterAt,
  chapterForStage,
  entityTypesForSection,
  isEntityBearingSection,
  LEGACY_CHAPTER_SLUGS,
  renderManifest,
  requiredEntityTypesForSlug,
} from '@modules/bible/bible-manifest';

describe('BIBLE_MANIFEST', () => {
  it('should declare exactly one chapter per builder stage', () => {
    expect(BIBLE_MANIFEST).toHaveLength(BIBLE_STAGE_ORDER.length);
    for (const stage of BIBLE_STAGE_ORDER) expect(chapterForStage(stage).stage).toBe(stage);
  });

  it('should give every chapter a unique section/slug address', () => {
    const addresses = BIBLE_MANIFEST.map(chapter => `${chapter.section}/${chapter.slug}`);
    expect(new Set(addresses).size).toBe(addresses.length);
  });

  it('should require at least one entity for every chapter that declares types', () => {
    for (const chapter of BIBLE_MANIFEST) {
      if (chapter.materializes.length > 0) expect(chapter.minEntities).toBeGreaterThan(0);
      else expect(chapter.minEntities).toBe(0);
    }
  });

  it('should give every chapter at least one required topic for the audit to check', () => {
    for (const chapter of BIBLE_MANIFEST) expect(chapter.requiredTopics.length).toBeGreaterThan(0);
  });

  it('should materialize the cast, the power system, the world and its factions as records', () => {
    expect(chapterForStage('characters').materializes).toContain('character');
    expect(chapterForStage('power').materializes).toContain('power_rule');
    expect(chapterForStage('factionsAndLocations').materializes).toContain('faction');
    expect(chapterForStage('world').materializes).toContain('location');
  });
});

describe('chapterAt', () => {
  it('should resolve a declared address', () => {
    expect(chapterAt('power', 'system-and-limits')?.stage).toBe('power');
  });

  it('should return undefined for an author-named slug the manifest does not declare', () => {
    expect(chapterAt('power', 'supers-and-rifts')).toBeUndefined();
  });
});

describe('entityTypesForSection', () => {
  it('should union the types every chapter in the section materializes', () => {
    expect(entityTypesForSection('world').sort()).toEqual(['concept', 'faction', 'location']);
  });

  it('should report a section that materializes nothing as not entity-bearing', () => {
    expect(entityTypesForSection('story_state')).toEqual([]);
    expect(isEntityBearingSection('story_state')).toBe(false);
  });

  it('should treat power as entity-bearing so an author-named power document is still held to records', () => {
    expect(isEntityBearingSection('power')).toBe(true);
  });
});

describe('requiredEntityTypesForSlug', () => {
  it('should hold a declared chapter to its own types', () => {
    expect(requiredEntityTypesForSlug('project', 'cast')).toEqual(['character']);
    expect(requiredEntityTypesForSlug('project', 'premise')).toEqual([]);
  });

  it('should hold an author-named slug in an all-record section to that section\u2019s types', () => {
    expect([...requiredEntityTypesForSlug('power', 'supers-and-rifts')].sort()).toEqual(['concept', 'power_rule']);
  });

  it('should exempt an author-named slug in a section that mixes record and prose chapters', () => {
    expect(requiredEntityTypesForSlug('project', 'reader-promise')).toEqual([]);
  });

  it('should exempt a section the manifest never declares', () => {
    expect(requiredEntityTypesForSlug('lore', 'anything')).toEqual([]);
  });
});

describe('LEGACY_CHAPTER_SLUGS', () => {
  it('should name a declared stage for every legacy address', () => {
    for (const legacy of LEGACY_CHAPTER_SLUGS) expect(() => chapterForStage(legacy.stage)).not.toThrow();
  });

  it('should differ from the address its stage now uses, so migration 0040 actually moves the row', () => {
    for (const legacy of LEGACY_CHAPTER_SLUGS) {
      const chapter = chapterForStage(legacy.stage);
      expect(`${legacy.section}/${legacy.slug}`).not.toBe(`${chapter.section}/${chapter.slug}`);
    }
  });

  it('should not leave the cast filed under the machine-internal ai section', () => {
    expect(LEGACY_CHAPTER_SLUGS.some(legacy => legacy.section === 'ai')).toBe(true);
    expect(BIBLE_MANIFEST.some(chapter => chapter.section === 'ai')).toBe(false);
  });
});

describe('renderManifest', () => {
  it('should state the entity requirement and the topics for each chapter', () => {
    const rendered = renderManifest();
    expect(rendered).toContain('power/system-and-limits');
    expect(rendered).toContain('must materialize at least 4 entities of type: power_rule, concept');
    expect(rendered).toContain('topics it must cover: progression ladder; costs and limits');
  });

  it('should not claim an entity requirement for a chapter that materializes nothing', () => {
    const volumeLine = renderManifest()
      .split('\n')
      .find(line => line.startsWith('story_state/volume-plan'));
    expect(volumeLine).toBeDefined();
    expect(volumeLine).not.toContain('must materialize');
  });
});
