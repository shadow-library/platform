import { describe, expect, it } from 'bun:test';

import { previousTail, segmentSource } from '@modules/translation';

const countChars = (text: string) => text.length;

describe('segmentSource', () => {
  it('should return a single segment when everything fits under the budget', () => {
    const text = '第一段。\n\n第二段。\n\n第三段。';
    const segments = segmentSource(text, 1000, countChars);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ index: 0, start: 0, end: text.length, text });
  });

  it('should always return at least one segment for empty input', () => {
    const segments = segmentSource('', 10, countChars);
    expect(segments).toEqual([{ index: 0, start: 0, end: 0, text: '' }]);
  });

  it('should pack paragraphs greedily and reproduce the normalised text when joined with a blank line', () => {
    const paragraphs = ['Alpha paragraph one.', 'Beta paragraph two.', 'Gamma paragraph three.', 'Delta paragraph four.'];
    const text = paragraphs.join('\n\n');
    const maxTokens = 40;
    const segments = segmentSource(text, maxTokens, countChars);

    expect(segments.length).toBeGreaterThan(1);
    for (const segment of segments) expect(countChars(segment.text)).toBeLessThanOrEqual(maxTokens);
    expect(segments.map(s => s.text).join('\n\n')).toBe(text);
    segments.forEach((segment, i) => expect(segment.index).toBe(i));
  });

  it('should normalise CRLF line endings and trim trailing whitespace before segmenting', () => {
    const segments = segmentSource('First.\r\n\r\nSecond.\r\n\r\n  ', 1000, countChars);
    expect(segments[0]?.text).toBe('First.\n\nSecond.');
  });

  it('should collapse runs of three or more newlines so a blank-line join still reproduces the text', () => {
    const paragraphs = ['Alpha paragraph one.', 'Beta paragraph two.', 'Gamma paragraph three.'];
    const text = paragraphs.join('\n\n\n\n');
    const maxTokens = 22;
    const segments = segmentSource(text, maxTokens, countChars);

    expect(segments.map(s => s.text).join('\n\n')).toBe(paragraphs.join('\n\n'));
  });

  it('should split a paragraph longer than the budget at sentence punctuation', () => {
    const paragraph = '叶辰点了点头。他转身离开了大殿。长老目送他远去。';
    const segments = segmentSource(paragraph, 12, countChars);

    expect(segments.length).toBeGreaterThan(1);
    for (const segment of segments) expect(countChars(segment.text)).toBeLessThanOrEqual(12);
    const first = segments[0];
    const last = segments[segments.length - 1];
    expect(first && last && paragraph.slice(first.start, last.end)).toBe(paragraph);
  });

  it('should hard-split a paragraph with no sentence punctuation at all', () => {
    const paragraph = '叶'.repeat(50);
    const segments = segmentSource(paragraph, 10, countChars);

    expect(segments.length).toBe(5);
    for (const segment of segments) expect(countChars(segment.text)).toBeLessThanOrEqual(10);
    expect(segments.map(s => s.text).join('')).toBe(paragraph);
  });

  it('should keep every segment within budget even mixing normal and oversized paragraphs', () => {
    const text = `Short one.\n\n${'叶'.repeat(30)}\n\nShort two.`;
    const segments = segmentSource(text, 10, countChars);
    for (const segment of segments) expect(countChars(segment.text)).toBeLessThanOrEqual(10);
  });
});

describe('previousTail', () => {
  it('should return the last paragraphs up to the character budget', () => {
    const text = 'First paragraph here.\n\nSecond paragraph here.\n\nThird and final paragraph here.';
    const tail = previousTail(text, 40);
    expect(tail).toBe('Third and final paragraph here.');
  });

  it('should include multiple trailing paragraphs when they fit together', () => {
    const text = 'Alpha.\n\nBeta.\n\nGamma.';
    const tail = previousTail(text, 100);
    expect(tail).toBe(text);
  });

  it('should include a paragraph that exactly fits the budget alongside the last one', () => {
    const text = ['1234567890', '1234567890', '1234567890'].join('\n\n');
    const tail = previousTail(text, 22);
    expect(tail).toBe('1234567890\n\n1234567890');
    expect(tail).toHaveLength(22);
  });

  it('should tail-cut a single trailing paragraph that alone exceeds the budget', () => {
    const long = 'x'.repeat(50);
    const tail = previousTail(long, 10);
    expect(tail).toBe(long.slice(-10));
    expect(tail).toHaveLength(10);
  });

  it('should return an empty string for empty input', () => {
    expect(previousTail('')).toBe('');
  });
});
