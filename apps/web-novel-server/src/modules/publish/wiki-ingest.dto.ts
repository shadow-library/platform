import { Field, Integer, Schema } from '@shadow-library/class-schema';

import { INT4_MAX, NovelSlugParams } from './publish.dto';

export const WIKI_ENTRY_TYPES = ['character', 'faction', 'location', 'item', 'concept', 'power_rule'] as const;

export type WikiEntryType = (typeof WIKI_ENTRY_TYPES)[number];

@Schema()
export class WikiEntryKeyParams extends NovelSlugParams {
  @Field({ pattern: '^[A-Za-z0-9._-]{1,128}$', maxLength: 128, description: 'Forge-assigned stable wiki entry key.' })
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

  @Field(() => Integer, { minimum: 0, maximum: INT4_MAX, description: 'First reader ordinal at which this facet becomes visible.' })
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

  @Field(() => String, { optional: true, maxLength: 512, description: 'Content-addressed storage reference, such as <sha256>.webp.' })
  imageRef?: string;

  @Field(() => Integer, { minimum: 0, maximum: INT4_MAX, description: 'First reader ordinal at which this entry appears; 0 exposes it before reading.' })
  firstVisibleOrdinal: number;

  @Field({ maxLength: 128 })
  contentHash: string;

  @Field(() => Integer, { minimum: 0, maximum: INT4_MAX, description: 'Forge-assigned monotonic revision used for optimistic concurrency.' })
  revision: number;

  @Field(() => [WikiFacetInput])
  facets: WikiFacetInput[];

  @Field(() => [WikiImageInput])
  images: WikiImageInput[];
}

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
