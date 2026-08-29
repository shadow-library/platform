import { compareRating, CONTENT_RATING_DIMENSIONS, type ContentRating, type ContentRatingDimension, isRatingLevel } from '@shadow-library/sdk';

export interface RatingViolation {
  dimension: ContentRatingDimension;
  /** The publication's level, or `undefined` when the novel is unrated on this dimension — which is itself the violation once a chapter is rated. */
  novel?: string;
  /** The highest level a published chapter asserts on this dimension, or the unrecognised level that could not be ranked. */
  chapter: string;
}

/**
 * The novel-level rating must be at least the maximum over its published chapters, per dimension
 * (interstitial-chapter design §11), so a reader filtering on the novel never opens a chapter that
 * exceeds what the catalog promised.
 *
 * Unrated is not `'none'` in either direction: an unrated *chapter* dimension contributes nothing to
 * the maximum, while an unrated *novel* dimension satisfies nothing — it is a violation as soon as any
 * chapter asserts a level there. A level that belongs to no dimension is reported rather than ranked;
 * `ratingRank` would throw on it and `-1` would silently pass it as the safest possible rating.
 */
export function findRatingViolations(novel: ContentRating | null | undefined, chapters: readonly (ContentRating | null | undefined)[]): RatingViolation[] {
  const violations: RatingViolation[] = [];

  for (const dimension of CONTENT_RATING_DIMENSIONS) {
    const novelLevel = novel?.[dimension];
    const asserted = chapters.map(rating => rating?.[dimension]).filter(level => level !== undefined);

    const unrecognised = asserted.find(level => !isRatingLevel(dimension, level));
    if (unrecognised !== undefined) {
      violations.push({ dimension, novel: novelLevel, chapter: unrecognised });
      continue;
    }

    const peak = asserted.reduce<(typeof asserted)[number] | undefined>(
      (highest, level) => (!highest || compareRating(dimension, level, highest) > 0 ? level : highest),
      undefined,
    );
    if (peak === undefined) continue;
    if (novelLevel === undefined || !isRatingLevel(dimension, novelLevel) || compareRating(dimension, peak, novelLevel) > 0)
      violations.push({ dimension, novel: novelLevel, chapter: peak });
  }

  return violations;
}

export function describeRatingViolations(violations: readonly RatingViolation[]): string {
  return violations
    .map(violation => `${violation.dimension}: chapters are ‘${violation.chapter}’ but the novel is ${violation.novel ? `‘${violation.novel}’` : 'unrated'}`)
    .join('; ');
}
