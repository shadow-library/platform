/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Field, Integer, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/** Every numeric field here lands in an int4 column (including the audit trail) — values beyond this must be rejected, not passed through to the database */
export const INT4_MAX = 2_147_483_647;

@Schema()
export class NovelSlugParams {
  @Field({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 128 })
  slug: string;
}

@Schema()
export class ChapterOrdinalParams extends NovelSlugParams {
  /** Capped at 9 digits so the parsed ordinal always fits int4 */
  @Field({ pattern: '^\\d{1,9}$' })
  ordinal: string;
}

@Schema()
export class NovelUpsertBody {
  @Field({ maxLength: 256 })
  title: string;

  @Field(() => String, { optional: true })
  blurb?: string;

  @Field(() => String, { optional: true, maxLength: 512 })
  coverPath?: string;

  @Field(() => [String], { optional: true })
  genres?: string[];

  @Field(() => String, { enum: ['live', 'retired'], optional: true })
  status?: 'live' | 'retired';

  /** Forge-assigned monotonic revision driving the optimistic-concurrency rules */
  @Field(() => Integer, { minimum: 0, maximum: INT4_MAX })
  revision: number;
}

@Schema()
export class ChapterUpsertBody {
  @Field({ maxLength: 256 })
  title: string;

  @Field()
  content: string;

  @Field(() => String, { optional: true })
  authorNote?: string;

  @Field({ maxLength: 128 })
  contentHash: string;

  /** Forge-assigned monotonic revision driving the optimistic-concurrency rules */
  @Field(() => Integer, { minimum: 0, maximum: INT4_MAX })
  revision: number;

  @Field(() => Integer, { optional: true, minimum: 0, maximum: INT4_MAX })
  wordCount?: number;

  @Field(() => String, { optional: true })
  publishedAt?: string;
}

@Schema()
export class PublishResultResponse {
  @Field()
  slug: string;

  @Field(() => String, { enum: ['applied'] })
  outcome: 'applied';

  @Field(() => Integer)
  revision: number;
}

@Schema()
export class ManifestItem {
  @Field(() => Integer)
  ordinal: number;

  @Field()
  contentHash: string;

  @Field(() => Integer)
  revision: number;
}
