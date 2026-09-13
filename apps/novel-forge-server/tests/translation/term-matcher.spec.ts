import { describe, expect, it } from 'bun:test';

import { countTerm, findTerm, LATIN_PROFILE, sourceTerms, type TranslationTermLike, ZH_PROFILE } from '@modules/translation';

describe('findTerm / countTerm — CJK (no word boundaries)', () => {
  it('should match a two-character name as a plain substring', () => {
    const text = '叶辰走进了大殿。叶辰点了点头。';
    expect(findTerm(text, '叶辰', ZH_PROFILE)).toBe(0);
    expect(countTerm(text, '叶辰', ZH_PROFILE)).toBe(2);
  });

  it('should never match a term shorter than the profile minimum length', () => {
    expect(findTerm('叶辰走进了大殿。', '叶', ZH_PROFILE)).toBe(-1);
    expect(countTerm('叶辰走进了大殿。', '叶', ZH_PROFILE)).toBe(0);
  });

  it('should count overlapping-free repeated occurrences', () => {
    expect(countTerm('大殿大殿大殿', '大殿', ZH_PROFILE)).toBe(3);
  });
});

describe('findTerm / countTerm — Latin (word boundaries)', () => {
  it('should match whole words only, not substrings inside a longer word', () => {
    expect(findTerm('Yefan smiled softly.', 'Fan', LATIN_PROFILE)).toBe(-1);
    expect(findTerm('Ye Fan smiled softly.', 'Fan', LATIN_PROFILE)).toBeGreaterThanOrEqual(0);
  });

  it('should never match a term shorter than the profile minimum length', () => {
    expect(findTerm('Mi bowed low.', 'Mi', LATIN_PROFILE)).toBe(-1);
  });

  it('should scan case-insensitively for terms with no common-word collision', () => {
    expect(findTerm('ye fan walked away', 'Ye Fan', LATIN_PROFILE)).toBeGreaterThanOrEqual(0);
    expect(countTerm('Ye Fan met ye fan again.', 'Ye Fan', LATIN_PROFILE)).toBe(2);
  });

  it('should stay case-sensitive for a single-word term that collides with a common English word', () => {
    expect(countTerm('the long road grew long. Long March began.', 'Long', LATIN_PROFILE)).toBe(1);
    expect(findTerm('the long road grew long.', 'Long', LATIN_PROFILE)).toBe(-1);
  });

  it('should escape regex metacharacters in the term', () => {
    const text = 'The result was 34, but only 3*4 was correct.';
    expect(findTerm(text, '3*4', LATIN_PROFILE)).toBe(text.indexOf('3*4'));
    expect(countTerm(text, '3*4', LATIN_PROFILE)).toBe(1);
  });
});

describe('sourceTerms', () => {
  it('should combine the source term with its variants', () => {
    const entry: TranslationTermLike = {
      sourceTerm: 'Ye Fan',
      variants: ['Yefan', 'Ye Fann'],
      target: 'Evan Vale',
      category: 'character',
      treatment: 'translate',
      status: 'approved',
    };
    expect(sourceTerms(entry)).toEqual(['Ye Fan', 'Yefan', 'Ye Fann']);
  });

  it('should return just the source term when variants are absent or null', () => {
    const entry: TranslationTermLike = { sourceTerm: 'Ye Fan', target: 'Evan Vale', category: 'character', treatment: 'translate', status: 'approved', variants: null };
    expect(sourceTerms(entry)).toEqual(['Ye Fan']);
  });
});
