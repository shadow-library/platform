import { UnknownRatingLevelError } from './errors';

export const CONTENT_RATING_DIMENSIONS = ['sexualContent', 'violence', 'darkContent'] as const;

export type ContentRatingDimension = (typeof CONTENT_RATING_DIMENSIONS)[number];

export const CONTENT_RATING_LEVELS = {
  sexualContent: ['none', 'suggestive', 'moderate', 'explicit'],
  violence: ['none', 'mild', 'graphic', 'extreme'],
  darkContent: ['none', 'mild', 'heavy'],
} as const satisfies Record<ContentRatingDimension, readonly string[]>;

export type ContentRatingLevel<D extends ContentRatingDimension> = (typeof CONTENT_RATING_LEVELS)[D][number];

export type SexualContentLevel = ContentRatingLevel<'sexualContent'>;

export type ViolenceLevel = ContentRatingLevel<'violence'>;

export type DarkContentLevel = ContentRatingLevel<'darkContent'>;

export const CONTENT_RATING_LEVEL_LABELS: Record<ContentRatingLevel<ContentRatingDimension>, string> = {
  none: 'None',
  mild: 'Mild',
  suggestive: 'Suggestive',
  moderate: 'Moderate',
  explicit: 'Explicit',
  graphic: 'Graphic',
  extreme: 'Extreme',
  heavy: 'Heavy',
};

/**
 * Every dimension is optional and absence means *unrated* — never `'none'`. A source that cannot determine
 * a rating (a scraper, a partial import) must leave the field out rather than assert the absence of content,
 * so the comparison helpers below accept only a concrete level and force callers to narrow first.
 */
export interface ContentRating {
  sexualContent?: SexualContentLevel;
  violence?: ViolenceLevel;
  darkContent?: DarkContentLevel;
}

export function isRatingLevel<D extends ContentRatingDimension>(dimension: D, value: unknown): value is ContentRatingLevel<D> {
  return (CONTENT_RATING_LEVELS[dimension] as readonly string[]).includes(value as string);
}

/**
 * Throws rather than returning `-1`: a level belonging to another dimension still satisfies the signature once
 * `D` widens to the whole union (a loop over `CONTENT_RATING_DIMENSIONS`), and `-1` would sort below `'none'`,
 * silently passing unrecognised content as the safest possible rating. Validate with `isRatingLevel` first.
 */
export function ratingRank<D extends ContentRatingDimension>(dimension: D, level: ContentRatingLevel<D>): number {
  const rank = (CONTENT_RATING_LEVELS[dimension] as readonly string[]).indexOf(level);
  if (rank === -1) throw new UnknownRatingLevelError(dimension, level);
  return rank;
}

export function compareRating<D extends ContentRatingDimension>(dimension: D, a: ContentRatingLevel<D>, b: ContentRatingLevel<D>): number {
  return ratingRank(dimension, a) - ratingRank(dimension, b);
}

export function isRatingAtMost<D extends ContentRatingDimension>(dimension: D, level: ContentRatingLevel<D>, maximum: ContentRatingLevel<D>): boolean {
  return compareRating(dimension, level, maximum) <= 0;
}

export function isRated<D extends ContentRatingDimension>(rating: ContentRating, dimension: D): rating is ContentRating & Record<D, ContentRatingLevel<D>> {
  return rating[dimension] !== undefined;
}
