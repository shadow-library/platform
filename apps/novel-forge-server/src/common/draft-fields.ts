import { CONTENT_RATING_DIMENSIONS, type ContentRating, type ContentRatingDimension, isRatingLevel } from '@shadow-library/sdk';

export interface DraftFieldsInput {
  contentRating?: Partial<Record<ContentRatingDimension, unknown>>;
  state?: Record<string, unknown>;
  isolated?: boolean;
}

export interface DeclaredDraftFields {
  contentRating?: ContentRating | null;
  state?: Record<string, unknown>;
  isolated?: boolean;
}

/** Drops any dimension the SDK does not recognise; a rating with no recognised dimension is unrated, which is null and never `'none'`. */
export function toContentRating(input: Partial<Record<ContentRatingDimension, unknown>>): ContentRating | null {
  const rating: ContentRating = {};
  for (const dimension of CONTENT_RATING_DIMENSIONS) {
    const level = input[dimension];
    if (isRatingLevel(dimension, level)) rating[dimension] = level as never;
  }
  return Object.keys(rating).length > 0 ? rating : null;
}

/**
 * Only explicitly supplied fields are returned, so spreading the result into an `onConflictDoUpdate` set
 * clause leaves an omitted field's stored value untouched. `isolated` is the field this exists for: resetting
 * an omitted one to the column default would silently de-firewall vetted content, so `undefined` (preserve)
 * and `false` (de-isolate on the author's say-so) must stay distinguishable all the way to the write.
 */
export function declaredDraftFields(input: DraftFieldsInput): DeclaredDraftFields {
  return {
    ...(input.contentRating !== undefined && { contentRating: toContentRating(input.contentRating) }),
    ...(input.state !== undefined && { state: input.state }),
    ...(input.isolated !== undefined && { isolated: input.isolated }),
  };
}
