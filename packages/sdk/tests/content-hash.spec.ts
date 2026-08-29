import { describe, expect, it } from 'bun:test';

import { chapterContentHash, computeContentHash } from '@shadow-library/sdk/publishing';

describe('computeContentHash', () => {
  it('should return a stable sha256 hex digest', () => {
    const hash = computeContentHash({ title: 'Arc One', objective: 'survive the trial' });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(computeContentHash({ title: 'Arc One', objective: 'survive the trial' })).toBe(hash);
  });

  it('should be independent of key order, including nested objects', () => {
    const a = computeContentHash({ title: 'Arc One', meta: { hook: 'cliffhanger', beat: 'dread' } });
    const b = computeContentHash({ meta: { beat: 'dread', hook: 'cliffhanger' }, title: 'Arc One' });
    expect(a).toBe(b);
  });

  it('should preserve array order and element identity', () => {
    const base = computeContentHash({ cast: ['hero', 'rival'] });
    expect(computeContentHash({ cast: ['hero', 'rival'] })).toBe(base);
    expect(computeContentHash({ cast: ['rival', 'hero'] })).not.toBe(base);
  });

  it('should change when content changes', () => {
    expect(computeContentHash({ body: 'v1' })).not.toBe(computeContentHash({ body: 'v2' }));
  });

  it('should treat undefined values as null', () => {
    expect(computeContentHash({ body: undefined })).toBe(computeContentHash({ body: null }));
  });
});

describe('chapterContentHash', () => {
  it('should match the published wire digest for a chapter with an author note', () => {
    const hash = chapterContentHash({ title: 'Chapter 1: The Gate', content: 'The gate opened at dawn.', authorNote: 'Thanks for reading!' });
    expect(hash).toBe('babfa2290158b4c1f541fae92edee13bfc871dbd5947b06f1786bc5234127009');
  });

  it('should match the published wire digest for a chapter without an author note', () => {
    const hash = chapterContentHash({ title: 'Chapter 2', content: 'Silence.' });
    expect(hash).toBe('3899a425a731c410793262e352239aa8f15dd896f09579d6032859f54a0bf5cb');
  });

  it('should treat an omitted, undefined and null author note identically', () => {
    const base = chapterContentHash({ title: 'Chapter 2', content: 'Silence.' });
    expect(chapterContentHash({ title: 'Chapter 2', content: 'Silence.', authorNote: undefined })).toBe(base);
    expect(chapterContentHash({ title: 'Chapter 2', content: 'Silence.', authorNote: null })).toBe(base);
  });

  it('should hash exactly the title, content and author note fields when the chapter is unrated', () => {
    const hash = chapterContentHash({ title: 'Chapter 2', content: 'Silence.', authorNote: 'note' });
    expect(hash).toBe(computeContentHash({ title: 'Chapter 2', content: 'Silence.', authorNote: 'note' }));
  });

  it('should keep an unrated chapter on its historical digest however the absent rating is spelled', () => {
    const base = chapterContentHash({ title: 'Chapter 2', content: 'Silence.' });
    expect(base).toBe('3899a425a731c410793262e352239aa8f15dd896f09579d6032859f54a0bf5cb');
    expect(chapterContentHash({ title: 'Chapter 2', content: 'Silence.', contentRating: undefined })).toBe(base);
    expect(chapterContentHash({ title: 'Chapter 2', content: 'Silence.', contentRating: null })).toBe(base);
    expect(chapterContentHash({ title: 'Chapter 2', content: 'Silence.', contentRating: {} })).toBe(base);
    expect(chapterContentHash({ title: 'Chapter 2', content: 'Silence.', contentRating: { violence: undefined } })).toBe(base);
    expect(chapterContentHash({ title: 'Chapter 2', content: 'Silence.', contentRating: { violence: null } as never })).toBe(base);
  });

  it('should change when a rating is added, changed or removed', () => {
    const unrated = chapterContentHash({ title: 'Chapter 2', content: 'Silence.' });
    const mild = chapterContentHash({ title: 'Chapter 2', content: 'Silence.', contentRating: { violence: 'mild' } });
    const graphic = chapterContentHash({ title: 'Chapter 2', content: 'Silence.', contentRating: { violence: 'graphic' } });
    expect(mild).not.toBe(unrated);
    expect(graphic).not.toBe(mild);
    expect(chapterContentHash({ title: 'Chapter 2', content: 'Silence.', contentRating: {} })).toBe(unrated);
  });

  it('should be stable when the rating is unchanged, whatever the dimension order', () => {
    const a = chapterContentHash({ title: 'Chapter 2', content: 'Silence.', contentRating: { violence: 'graphic', sexualContent: 'suggestive' } });
    const b = chapterContentHash({ title: 'Chapter 2', content: 'Silence.', contentRating: { sexualContent: 'suggestive', violence: 'graphic' } });
    expect(a).toBe(b);
  });

  it('should distinguish an unrated dimension from an explicit none', () => {
    const unrated = chapterContentHash({ title: 'Chapter 2', content: 'Silence.', contentRating: { violence: 'mild' } });
    const none = chapterContentHash({ title: 'Chapter 2', content: 'Silence.', contentRating: { violence: 'mild', sexualContent: 'none' } });
    expect(none).not.toBe(unrated);
  });
});
