import { describe, expect, it } from 'bun:test';

import { paragraphAt, paragraphNumberAt, proseParagraphs } from '@shadow-library/sdk';

function blocks(text: string): string[] {
  return proseParagraphs(text).map(({ start, end }) => text.slice(start, end));
}

describe('proseParagraphs', () => {
  it('should split plain prose on blank lines, ignoring spaces and tabs on a blank line and around the text', () => {
    expect(blocks('\n\n  First line\nstill first.\n  \t\nSecond.  \n\n')).toEqual(['First line\nstill first.', 'Second.']);
    expect(proseParagraphs('')).toEqual([]);
    expect(proseParagraphs(' \n\t\n')).toEqual([]);
  });

  it.each([
    ['a heading over its first paragraph', '# Chapter 3\nShe ran.\n\nThe pier was empty.', ['# Chapter 3', 'She ran.', 'The pier was empty.']],
    ['a scene break between two lines', 'She ran.\n* * *\nMorning came.', ['She ran.', 'Morning came.']],
    ['a scene break of underscores after a blank line', 'She ran.\n\n___\n\nMorning came.', ['She ran.', 'Morning came.']],
    ['a loose list', '- one\n\n- two\n\n- three\n\nAfter.', ['- one\n\n- two\n\n- three', 'After.']],
    ['a list right after a line', 'She said:\n- one\n- two', ['She said:', '- one\n- two']],
    ['an ordered list after a line only when it starts at 1', 'Count:\n1. one\n2. two\n\nYear\n2024. was long', ['Count:', '1. one\n2. two', 'Year\n2024. was long']],
    ['a fenced code block with a blank line inside', 'Before.\n\n```\nline one\n\nline two\n```\n\nAfter.', ['Before.', '```\nline one\n\nline two\n```', 'After.']],
    ['a fence never closed', '~~~\nopen\n\nstill open', ['~~~\nopen\n\nstill open']],
    ['CRLF line endings', 'One.\r\n\r\nTwo\r\nlines.\r\n\r\nThree.', ['One.', 'Two\r\nlines.', 'Three.']],
    ['a setext heading', 'Title\n---\nBody.', ['Title\n---', 'Body.']],
    ['a quote with a lazy line, then a paragraph', '> She said\nit twice.\n\nHe left.', ['> She said\nit twice.', 'He left.']],
    ['indented code across a blank line', 'Text.\n\n    code\n\n    more\nAfter.', ['Text.', 'code\n\n    more', 'After.']],
    ['a list item continued by an indented paragraph', '- item\n\n  more of it\n\nAfter.', ['- item\n\n  more of it', 'After.']],
  ])('should read %s as a reader does', (_, text, expected) => {
    expect(blocks(text)).toEqual(expected);
  });

  it('should give each block UTF-16 offsets into the text it read', () => {
    const text = 'Sea 🌊 wall.\n\nGulls.';
    expect(proseParagraphs(text)).toEqual([
      { start: 0, end: 12 },
      { start: 14, end: 20 },
    ]);
  });
});

describe('paragraphAt', () => {
  const text = '# Chapter 3\nShe ran.\n* * *\nMorning came.';

  it('should number blocks from 1, with an offset on a scene break or between blocks belonging to the next one', () => {
    expect(paragraphAt(text, 0)).toBe(1);
    expect(paragraphAt(text, text.indexOf('ran'))).toBe(2);
    expect(paragraphAt(text, text.indexOf('* * *'))).toBe(3);
    expect(paragraphAt(text, text.indexOf('Morning'))).toBe(3);
  });

  it('should give an offset past the last block to the last one, and an empty text paragraph 1', () => {
    expect(paragraphAt(text, text.length + 5)).toBe(3);
    expect(paragraphAt('', 0)).toBe(1);
    expect(paragraphNumberAt([], 4)).toBe(1);
  });
});
