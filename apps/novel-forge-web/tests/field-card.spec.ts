import { describe, expect, it } from 'bun:test';

import { countWords, formatWordCount } from '../src/lib/field-card';

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
