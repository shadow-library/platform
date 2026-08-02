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
import { INT4_MAX, NovelSlugParams } from './publish.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/** The kinds of wiki entry the forge may push; the reader stores what the forge decided, never inventing a value. */
export const WIKI_ENTRY_TYPES = ['character', 'faction', 'location', 'item', 'concept', 'power_rule'] as const;

export type WikiEntryType = (typeof WIKI_ENTRY_TYPES)[number];

@Schema()
export class WikiEntryKeyParams extends NovelSlugParams {
  /** Forge-assigned stable key; mirrors the `entry_key` column width. */
  @Field({ pattern: '^[A-Za-z0-9._-]{1,128}$', maxLength: 128 })
  entryKey: string;
}

@Schema()
export class WikiFacetInput {
  @Field({ maxLength: 128 })
  facetKey: string;

  @Field()
  content: string;

  @Field(() => Integer, { minimum: 0, maximum: INT4_MAX })
  sortOrder: number;

  /** Reader ordinal from which this facet is shown; a facet gated ahead of the reader is never loaded. */
  @Field(() => Integer, { minimum: 0, maximum: INT4_MAX })
  visibleFromOrdinal: number;
}

@Schema()
export class WikiImageInput {
  @Field({ maxLength: 512 })
  imageRef: string;

  @Field(() => String, { optional: true, maxLength: 256 })
  caption?: string;

  @Field(() => Integer, { minimum: 0, maximum: INT4_MAX })
  sortOrder: number;

  @Field(() => Integer, { minimum: 0, maximum: INT4_MAX })
  visibleFromOrdinal: number;
}

/**
 * A wiki entry pushed whole. Like the chapter push, absent optional fields compare as their defaults, and the
 * facets and images are a full replacement — the reader diffs nothing, it drops the lot and rewrites it.
 */
@Schema()
export class WikiEntryUpsertBody {
  @Field(() => String, { enum: [...WIKI_ENTRY_TYPES] })
  type: WikiEntryType;

  @Field({ maxLength: 256 })
  name: string;

  /** Content-addressed storage ref (e.g. `<sha256>.webp`); resolved to a public URL only at read time. */
  @Field(() => String, { optional: true, maxLength: 512 })
  imageRef?: string;

  /** Reader ordinal at which the entry first appears; 0 means pre-reading public info. */
  @Field(() => Integer, { minimum: 0, maximum: INT4_MAX })
  firstVisibleOrdinal: number;

  @Field({ maxLength: 128 })
  contentHash: string;

  /** Forge-assigned monotonic revision driving the optimistic-concurrency rules */
  @Field(() => Integer, { minimum: 0, maximum: INT4_MAX })
  revision: number;

  @Field(() => [WikiFacetInput])
  facets: WikiFacetInput[];

  @Field(() => [WikiImageInput])
  images: WikiImageInput[];
}

/** The reconciliation primitive for the wiki, mirroring `ManifestItem` for chapters. */
@Schema()
export class WikiManifestItem {
  @Field()
  entryKey: string;

  @Field(() => Integer)
  revision: number;

  @Field()
  contentHash: string;
}

@Schema()
export class WikiPublishResultResponse {
  @Field()
  slug: string;

  @Field()
  entryKey: string;

  @Field(() => String, { enum: ['applied'] })
  outcome: 'applied';

  @Field(() => Integer)
  revision: number;
}
