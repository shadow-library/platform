import { describe, expect, it } from 'bun:test';

import { type BibleDocListItem } from '../src/lib/apis/api-types.gen';
import { BIBLE_DOC_SECTION_LABEL, emptyPagesLabel, emptyToggleLabel, groupBibleDocs } from '../src/lib/bible-documents';

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
