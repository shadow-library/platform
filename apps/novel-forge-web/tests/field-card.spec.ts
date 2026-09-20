import { describe, expect, it } from 'bun:test';

import { countWords, EXPAND_CHARS, formatWordCount, previewText, readAllLabel, readAllText, resolveFieldValue } from '../src/lib/field-card';

const short = 'A courier who cannot lie.';
const long = 'x'.repeat(EXPAND_CHARS + 1);

describe('countWords', () => {
  it('should count runs of non-whitespace', () => {
    expect(countWords('A courier who cannot lie')).toBe(5);
  });

  it('should count a hyphenated compound once', () => {
    expect(countWords('state-of-the-art')).toBe(1);
  });

  it('should ignore separators that carry no letters or digits', () => {
    expect(countWords('grimdark · progression · slow burn')).toBe(4);
  });

  it('should collapse newlines and runs of spaces', () => {
    expect(countWords('one\n\n  two\ttHREE')).toBe(3);
  });

  it('should count nothing in an empty string', () => {
    expect(countWords('')).toBe(0);
  });
});

describe('formatWordCount', () => {
  it('should read singular for one word', () => {
    expect(formatWordCount(1)).toBe('1 word');
  });

  it('should read plural for none or many', () => {
    expect(formatWordCount(0)).toBe('0 words');
    expect(formatWordCount(92)).toBe('92 words');
  });
});

describe('resolveFieldValue', () => {
  it('should treat an unset field as empty', () => {
    expect(resolveFieldValue(undefined)).toEqual({ kind: 'empty' });
    expect(resolveFieldValue(null)).toEqual({ kind: 'empty' });
  });

  it('should treat whitespace alone as empty', () => {
    expect(resolveFieldValue('   \n  ')).toEqual({ kind: 'empty' });
  });

  it('should keep a short value on the card without an expander', () => {
    expect(resolveFieldValue(short)).toEqual({ kind: 'filled', text: short, words: 5, expandable: false });
  });

  it('should trim the surrounding whitespace off a value', () => {
    expect(resolveFieldValue(`  ${short}\n`)).toEqual({ kind: 'filled', text: short, words: 5, expandable: false });
  });

  it('should offer the sheet once the value outruns the clamp', () => {
    expect(resolveFieldValue(long)).toMatchObject({ kind: 'filled', expandable: true });
  });

  it('should leave a value exactly at the threshold on the card', () => {
    expect(resolveFieldValue('x'.repeat(EXPAND_CHARS))).toMatchObject({ expandable: false });
  });

  it('should offer the sheet for a short multi-paragraph value, which spends lines on breaks', () => {
    expect(resolveFieldValue('First beat.\n\nSecond beat.')).toMatchObject({ kind: 'filled', words: 4, expandable: true });
  });

  it('should offer the sheet for a long unbroken url', () => {
    expect(resolveFieldValue(`https://example.test/${'a'.repeat(EXPAND_CHARS)}`)).toMatchObject({ words: 1, expandable: true });
  });
});

describe('previewText', () => {
  it('should drop blank lines rather than spend the clamp on them', () => {
    expect(previewText('First.\n\n\nSecond.')).toBe('First.\nSecond.');
  });

  it('should keep single breaks', () => {
    expect(previewText('First.\nSecond.')).toBe('First.\nSecond.');
  });

  it('should leave a single-line value alone', () => {
    expect(previewText(short)).toBe(short);
  });
});

describe('readAllText', () => {
  it('should name the count the sheet will show', () => {
    expect(readAllText(92)).toBe('Read all 92 words');
  });
});

describe('readAllLabel', () => {
  it('should name the field so the panel does not repeat one label down the column', () => {
    expect(readAllLabel('Premise', 92)).toBe('Read all 92 words of Premise');
  });

  it('should start with the visible text so voice control still matches it', () => {
    expect(readAllLabel('Premise', 1).startsWith(readAllText(1))).toBe(true);
  });
});
