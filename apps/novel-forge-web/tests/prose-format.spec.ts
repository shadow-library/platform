import { describe, expect, it } from 'bun:test';

import { insertAtCursor, prefixSelectedLines, SCENE_BREAK, surroundSelection } from '../src/lib/prose-format';

describe('surroundSelection', () => {
  it('should wrap the selection and keep the same words selected', () => {
    expect(surroundSelection('She ran home.', { start: 4, end: 7 }, '**', '**')).toEqual({ text: 'She **ran** home.', selection: { start: 6, end: 9 } });
  });

  it('should put the cursor between the marks when nothing is selected', () => {
    expect(surroundSelection('ab', { start: 1, end: 1 }, '*', '*')).toEqual({ text: 'a**b', selection: { start: 2, end: 2 } });
  });
});

describe('prefixSelectedLines', () => {
  it('should prefix every line the selection touches, whole, and select them', () => {
    const text = 'one\ntwo\nthree';
    expect(prefixSelectedLines(text, { start: 5, end: 9 }, () => '- ')).toEqual({ text: 'one\n- two\n- three', selection: { start: 4, end: 17 } });
  });

  it('should number the lines from one', () => {
    expect(prefixSelectedLines('a\nb', { start: 0, end: 3 }, index => `${index + 1}. `).text).toBe('1. a\n2. b');
  });
});

describe('insertAtCursor', () => {
  it('should insert at the cursor and leave the cursor after the insert', () => {
    expect(insertAtCursor('ab', 1, SCENE_BREAK)).toEqual({ text: `a${SCENE_BREAK}b`, selection: { start: 1 + SCENE_BREAK.length, end: 1 + SCENE_BREAK.length } });
  });
});
