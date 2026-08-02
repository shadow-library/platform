/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

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

/** Mirrors the `novel_visibility` pg enum; the reader never invents a value, it only stores what the forge decided. */
export const NOVEL_VISIBILITIES = ['PUBLIC', 'ORGANISATION', 'RESTRICTED'] as const;

/**
 * A share list is a handful of people, not an audience. The cap is a guard against a malformed push
 * rather than a product limit — an author who needs more than this wants `ORGANISATION`.
 */
export const MAX_GRANT_SUBJECTS = 500;

@Schema()
export class NovelSlugParams {
  @Field({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 128 })
  slug: string;
}

@Schema()
export class ChapterOrdinalParams extends NovelSlugParams {
  /** Capped at 9 digits so the parsed ordinal always fits int4 */
  @Field(() => String, { pattern: '^\\d{1,9}$' })
  @Transform('int:parse')
  ordinal: number;
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

  /**
   * Required, not optional-defaulting-to-`PUBLIC`. A default here would mean one forge bug — a
   * dropped field, a stale client — silently publishes a private manuscript to the open catalog.
   * Demanding it makes the same bug a 400 that publishes nothing, which is the direction to fail in.
   */
  @Field(() => String, { enum: [...NOVEL_VISIBILITIES] })
  visibility: (typeof NOVEL_VISIBILITIES)[number];

  /** Forge-assigned monotonic revision driving the optimistic-concurrency rules */
  @Field(() => Integer, { minimum: 0, maximum: INT4_MAX })
  revision: number;
}

/**
 * The share list, replaced wholesale. Carried on its own sub-resource with its own revision so that
 * adding a viewer does not churn the metadata row (and vice versa), and so each resource gets its
 * own stale-push rejection.
 *
 * `visibility` is deliberately repeated from the metadata push rather than owned solely here: a
 * novel must be created already restricted, so the tier has to arrive with the very first metadata
 * push, before any grant exists. This body is the authority when both are in flight.
 */
@Schema()
export class NovelAccessBody {
  @Field(() => String, { enum: [...NOVEL_VISIBILITIES] })
  visibility: (typeof NOVEL_VISIBILITIES)[number];

  /** Required for `ORGANISATION`, rejected otherwise — enforced in the service, where the tier is known. */
  @Field(() => String, { optional: true, maxLength: 64 })
  organisationId?: string;

  /** Resolved identity subjects only; the forge does the email lookup, so no address ever reaches this service. */
  @Field(() => [String], { optional: true, maxItems: MAX_GRANT_SUBJECTS, uniqueItems: true })
  subjectIds?: string[];

  @Field(() => Integer, { minimum: 0, maximum: INT4_MAX })
  revision: number;
}

/** The reconciliation primitive for access, mirroring `ManifestItem` for chapters. */
@Schema()
export class NovelAccessResponse {
  @Field(() => String, { enum: [...NOVEL_VISIBILITIES] })
  visibility: (typeof NOVEL_VISIBILITIES)[number];

  @Field(() => String, { optional: true })
  organisationId?: string;

  @Field(() => [String])
  subjectIds: string[];

  @Field(() => Integer)
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
