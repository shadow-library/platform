import { describe, expect, it } from 'bun:test';

import {
  compareRating,
  CONTENT_RATING_LEVELS,
  type ContentRating,
  type ContentRatingDimension,
  type DarkContentLevel,
  isGenre,
  isRated,
  isRatingAtMost,
  isRatingLevel,
  isTag,
  NOVEL_GENRES,
  NOVEL_TAG_GROUPS,
  NOVEL_TAGS,
  ratingRank,
  TAG_GROUP_BY_TAG,
  TAG_GROUP_LABELS,
  TAG_GROUPS,
  UnknownRatingLevelError,
  type ViolenceLevel,
} from '@shadow-library/sdk';

describe('genres', () => {
  it('should hold a unique, non-empty genre list', () => {
    expect(NOVEL_GENRES.length).toBe(35);
    expect(new Set(NOVEL_GENRES).size).toBe(NOVEL_GENRES.length);
    expect(NOVEL_GENRES.every(genre => genre.trim() === genre && genre.length > 0)).toBe(true);
  });

  it('should recognise only declared genres', () => {
    expect(isGenre('Fantasy')).toBe(true);
    expect(isGenre('fantasy')).toBe(false);
    expect(isGenre(undefined)).toBe(false);
    expect(NOVEL_GENRES.every(isGenre)).toBe(true);
  });
});

describe('tags', () => {
  it('should hold a unique tag list covering every group', () => {
    expect(NOVEL_TAGS.length).toBe(143);
    expect(new Set(NOVEL_TAGS).size).toBe(NOVEL_TAGS.length);
    expect(TAG_GROUPS.length).toBe(12);
  });

  it('should expose groups whose tags concatenate back to the flat list', () => {
    expect(NOVEL_TAG_GROUPS.map(({ group }) => group)).toEqual([...TAG_GROUPS]);
    expect(NOVEL_TAG_GROUPS.flatMap(({ tags }) => [...tags])).toEqual([...NOVEL_TAGS]);
    expect(NOVEL_TAG_GROUPS.every(({ group, label }) => label === TAG_GROUP_LABELS[group])).toBe(true);
  });

  it('should map every tag back to the group that declares it', () => {
    expect(Object.keys(TAG_GROUP_BY_TAG).length).toBe(NOVEL_TAGS.length);
    expect(TAG_GROUP_BY_TAG['Male Protagonist']).toBe('Protagonist');
    expect(TAG_GROUP_BY_TAG['Terminal Illness']).toBe('DarkThemes');
  });

  it('should recognise only declared tags', () => {
    expect(isTag('Male Protagonist')).toBe(true);
    expect(isTag('Male protagonist')).toBe(false);
    expect(isTag(42)).toBe(false);
    expect(NOVEL_TAGS.every(isTag)).toBe(true);
  });
});

describe('content ratings', () => {
  it('should order each dimension lowest to highest', () => {
    expect(CONTENT_RATING_LEVELS.sexualContent).toEqual(['none', 'suggestive', 'moderate', 'explicit']);
    expect(CONTENT_RATING_LEVELS.violence).toEqual(['none', 'mild', 'graphic', 'extreme']);
    expect(CONTENT_RATING_LEVELS.darkContent).toEqual(['none', 'mild', 'heavy']);
    expect(ratingRank('violence', 'graphic')).toBe(2);
  });

  it('should compare levels by their position in the dimension', () => {
    expect(compareRating('sexualContent', 'suggestive', 'explicit')).toBeLessThan(0);
    expect(compareRating('darkContent', 'heavy', 'heavy')).toBe(0);
    expect(isRatingAtMost('sexualContent', 'moderate', 'moderate')).toBe(true);
    expect(isRatingAtMost('sexualContent', 'explicit', 'moderate')).toBe(false);
  });

  it('should treat an absent dimension as unrated rather than none', () => {
    const unrated: ContentRating = { violence: 'mild' };
    expect(isRated(unrated, 'violence')).toBe(true);
    expect(isRated(unrated, 'sexualContent')).toBe(false);
    expect(unrated.sexualContent).toBeUndefined();
  });

  it('should recognise a level only within its own dimension', () => {
    expect(isRatingLevel('violence', 'graphic')).toBe(true);
    expect(isRatingLevel('violence', 'explicit')).toBe(false);
    expect(isRatingLevel('darkContent', 'graphic')).toBe(false);
    expect(isRatingLevel('sexualContent', null)).toBe(false);
  });

  it('should throw on a level the dimension does not declare instead of ranking it below none', () => {
    const leak = (dimension: ContentRatingDimension): number => ratingRank(dimension, 'explicit');

    expect(() => leak('violence')).toThrow(UnknownRatingLevelError);
    expect(() => ratingRank('darkContent', 'graphic' as DarkContentLevel)).toThrow(/Unknown content rating level "graphic" for dimension 'darkContent'/);
    expect(() => compareRating('violence', 'mild', 'explicit' as ViolenceLevel)).toThrow(UnknownRatingLevelError);
    expect(() => isRatingAtMost('violence', 'nonsense' as ViolenceLevel, 'none')).toThrow(UnknownRatingLevelError);
    expect(leak('sexualContent')).toBe(3);
  });
});
