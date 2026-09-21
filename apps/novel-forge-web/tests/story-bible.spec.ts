import { describe, expect, it } from 'bun:test';

import { clipText, entityExcerpt, markdownPlainText, parseEntityType, stripEntityHeading } from '../src/lib/story-bible';

describe('parseEntityType', () => {
  it('should accept a known type', () => {
    expect(parseEntityType('power_rule')).toBe('power_rule');
  });

  it('should reject anything the API does not define', () => {
    expect(parseEntityType('villain')).toBeUndefined();
    expect(parseEntityType(undefined)).toBeUndefined();
    expect(parseEntityType(7)).toBeUndefined();
  });
});

describe('stripEntityHeading', () => {
  it('should drop a leading heading that only repeats the name', () => {
    expect(stripEntityHeading('# Detective Amara\n\nShe keeps the ledger.', 'Detective Amara')).toBe('She keeps the ledger.');
  });

  it('should keep a heading that says something else', () => {
    expect(stripEntityHeading('# Background\n\nShe keeps the ledger.', 'Detective Amara')).toBe('# Background\n\nShe keeps the ledger.');
  });

  it('should ignore emphasis around the name', () => {
    expect(stripEntityHeading('## *Detective Amara*\nShe keeps the ledger.', 'detective amara')).toBe('She keeps the ledger.');
  });
});

describe('markdownPlainText', () => {
  it('should drop headings, rules and list markers and keep the words', () => {
    const text = markdownPlainText('# Title\n\n- first\n- second\n\n---\n\n> quoted');
    expect(text.split(/\s+/)).toEqual(['first', 'second', 'quoted']);
  });

  it('should strip emphasis, code and links but keep their text', () => {
    expect(markdownPlainText('A **bold** and *soft* `term` with [a link](https://example.test) and ~~gone~~.')).toBe('A bold and soft term with a link and gone.');
  });

  it('should drop images entirely', () => {
    expect(markdownPlainText('Before ![portrait](a.png) after')).toBe('Before  after');
  });

  it('should keep underscores inside identifiers', () => {
    expect(markdownPlainText('see power_rule notes')).toBe('see power_rule notes');
  });
});

describe('clipText', () => {
  it('should return short text unchanged with whitespace collapsed', () => {
    expect(clipText('  one\n two  ', 20)).toBe('one two');
  });

  it('should cut long text on a word boundary and mark the cut', () => {
    expect(clipText('the quick brown fox jumps over the lazy dog', 18)).toBe('the quick brown…');
  });

  it('should cut mid-word when a single word fills the limit', () => {
    expect(clipText('abcdefghijklmnopqrstuvwxyz', 10)).toBe('abcdefghij…');
  });
});

describe('entityExcerpt', () => {
  it('should be empty for an entity with no summary', () => {
    expect(entityExcerpt({ name: 'Sergeant Boone', body: null })).toBe('');
    expect(entityExcerpt({ name: 'Sergeant Boone', body: '   ' })).toBe('');
  });

  it('should skip a heading that repeats the name and read only the first paragraph as plain text', () => {
    const body = '# Sergeant Boone\n\nA **gruff** harbour watchman.\n\nSecond paragraph never shows.';
    expect(entityExcerpt({ name: 'Sergeant Boone', body })).toBe('A gruff harbour watchman.');
  });

  it('should clip a long first paragraph to the card length', () => {
    const excerpt = entityExcerpt({ name: 'x', body: 'word '.repeat(80) }, 40);
    expect(excerpt.length).toBeLessThanOrEqual(41);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});
