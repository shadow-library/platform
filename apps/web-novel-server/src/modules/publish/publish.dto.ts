import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { type DarkContentLevel, type Genre, type SexualContentLevel, type Tag, type ViolenceLevel } from '@shadow-library/sdk';

import { DarkContentRating, NovelGenre, NovelTag, SexualContentRating, ViolenceRating } from '@server/classes';

/** Every numeric field here lands in an int4 column (including the audit trail) — values beyond this must be rejected, not passed through to the database */
export const INT4_MAX = 2_147_483_647;

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
  @Field(() => String, { pattern: '^\\d{1,9}$', description: 'A positive chapter ordinal of at most 9 digits.' })
  @Transform('int:parse')
  ordinal: number;
}

@Schema()
export class NovelUpsertBody {
  @Field(() => String, {
    optional: true,
    maxLength: 64,
    description:
      "The publisher's own stable identifier. When present it, not the slug, identifies the novel: a push under a new slug renames it rather than publishing a second one.",
  })
  sourceRef?: string;

  @Field({ maxLength: 256 })
  title: string;

  @Field(() => String, { optional: true })
  blurb?: string;

  @Field(() => String, { optional: true, maxLength: 512 })
  coverPath?: string;

  @Field(() => [NovelGenre], { optional: true, uniqueItems: true })
  genres?: Genre[];

  @Field(() => [NovelTag], { optional: true, uniqueItems: true })
  tags?: Tag[];

  @Field(() => SexualContentRating, { optional: true, description: 'Omit when unrated. An absent dimension is stored as unrated and is never inferred to be "none".' })
  sexualContent?: SexualContentLevel;

  @Field(() => ViolenceRating, { optional: true, description: 'Omit when unrated. An absent dimension is stored as unrated and is never inferred to be "none".' })
  violence?: ViolenceLevel;

  @Field(() => DarkContentRating, { optional: true, description: 'Omit when unrated. An absent dimension is stored as unrated and is never inferred to be "none".' })
  darkContent?: DarkContentLevel;

  @Field(() => String, { enum: ['live', 'retired'], optional: true })
  status?: 'live' | 'retired';

  @Field(() => String, {
    enum: [...NOVEL_VISIBILITIES],
    description: 'Required access tier. It has no PUBLIC default so an omitted value cannot accidentally publish private content.',
  })
  visibility: (typeof NOVEL_VISIBILITIES)[number];

  @Field(() => Integer, { minimum: 0, maximum: INT4_MAX, description: 'Forge-assigned monotonic revision used for optimistic concurrency.' })
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

  @Field(() => String, { optional: true, maxLength: 64, description: 'Required only when visibility is ORGANISATION.' })
  organisationId?: string;

  @Field(() => [String], {
    optional: true,
    maxItems: MAX_GRANT_SUBJECTS,
    uniqueItems: true,
    description: 'Resolved identity subject IDs. Email addresses are not accepted.',
  })
  subjectIds?: string[];

  @Field(() => Integer, { minimum: 0, maximum: INT4_MAX })
  revision: number;
}

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

  @Field(() => Integer, { minimum: 0, maximum: INT4_MAX, description: 'Forge-assigned monotonic revision used for optimistic concurrency.' })
  revision: number;

  @Field(() => Integer, { optional: true, minimum: 0, maximum: INT4_MAX })
  wordCount?: number;

  @Field(() => String, { optional: true })
  publishedAt?: string;
}

@Schema()
export class PublishResultResponse {
  @Field({ description: "The reader's own novel id, as a string because it is a 64-bit value. Diagnostics only — no publisher may depend on having persisted it." })
  id: string;

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
