import { describe, expect, it } from 'bun:test';

import { describeRatingViolations, findRatingViolations } from '@modules/publishing/rating-invariant';

describe('findRatingViolations', () => {
  it('should pass a novel rated at or above every published chapter', () => {
    const novel = { sexualContent: 'moderate', violence: 'graphic', darkContent: 'heavy' } as const;
    const chapters = [{ violence: 'mild' }, { sexualContent: 'moderate', violence: 'graphic' }, { darkContent: 'heavy' }] as const;
    expect(findRatingViolations(novel, chapters)).toEqual([]);
  });

  it('should report the dimension whose peak chapter level exceeds the novel', () => {
    const violations = findRatingViolations({ violence: 'mild' }, [{ violence: 'mild' }, { violence: 'extreme' }, { violence: 'graphic' }]);
    expect(violations).toEqual([{ dimension: 'violence', novel: 'mild', chapter: 'extreme' }]);
  });

  it('should report every violated dimension independently', () => {
    const violations = findRatingViolations({ sexualContent: 'explicit', violence: 'none' }, [{ sexualContent: 'moderate', violence: 'mild', darkContent: 'mild' }]);
    expect(violations).toEqual([
      { dimension: 'violence', novel: 'none', chapter: 'mild' },
      { dimension: 'darkContent', novel: undefined, chapter: 'mild' },
    ]);
  });

  it('should treat an unrated novel dimension as satisfying nothing, and never as none', () => {
    expect(findRatingViolations(undefined, [{ violence: 'none' }])).toEqual([{ dimension: 'violence', novel: undefined, chapter: 'none' }]);
    expect(findRatingViolations({ violence: 'none' }, [{ violence: 'none' }])).toEqual([]);
  });

  it('should let an unrated chapter dimension contribute nothing to the maximum', () => {
    expect(findRatingViolations(undefined, [null, undefined, {}, { violence: undefined }])).toEqual([]);
    expect(findRatingViolations({ violence: 'mild' }, [{ sexualContent: 'suggestive' }])).toEqual([{ dimension: 'sexualContent', novel: undefined, chapter: 'suggestive' }]);
  });

  it('should hold at the boundary where the peak chapter equals the novel', () => {
    expect(findRatingViolations({ darkContent: 'mild' }, [{ darkContent: 'mild' }])).toEqual([]);
    expect(findRatingViolations({ darkContent: 'mild' }, [{ darkContent: 'heavy' }])).toEqual([{ dimension: 'darkContent', novel: 'mild', chapter: 'heavy' }]);
    expect(findRatingViolations({ darkContent: 'heavy' }, [{ darkContent: 'mild' }])).toEqual([]);
  });

  it('should report an unrankable level instead of throwing or ranking it below none', () => {
    const chapters = [{ violence: 'suggestive' } as unknown as { violence: 'mild' }];
    expect(findRatingViolations({ violence: 'extreme' }, chapters)).toEqual([{ dimension: 'violence', novel: 'extreme', chapter: 'suggestive' }]);
    expect(findRatingViolations({ violence: 'nonsense' } as unknown as { violence: 'mild' }, [{ violence: 'mild' }])).toEqual([
      { dimension: 'violence', novel: 'nonsense', chapter: 'mild' },
    ]);
  });

  it('should pass an empty chapter set whatever the novel says', () => {
    expect(findRatingViolations({ violence: 'extreme' }, [])).toEqual([]);
    expect(findRatingViolations(null, [])).toEqual([]);
  });
});

describe('describeRatingViolations', () => {
  it('should name each dimension, its chapter peak and the novel level', () => {
    const message = describeRatingViolations([
      { dimension: 'violence', novel: 'mild', chapter: 'extreme' },
      { dimension: 'darkContent', chapter: 'heavy' },
    ]);
    expect(message).toBe('violence: chapters are ‘extreme’ but the novel is ‘mild’; darkContent: chapters are ‘heavy’ but the novel is unrated');
  });
});
