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
import { WIKI_ENTRY_TYPES, type WikiEntryType } from '@server/modules/publish';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class WikiListItem {
  @Field()
  entryKey: string;

  @Field(() => String, { enum: [...WIKI_ENTRY_TYPES] })
  type: WikiEntryType;

  @Field()
  name: string;

  /** Absolute public URL, resolved server-side from the storage origin; absent when the entry has no image. */
  @Field(() => String, { optional: true })
  imageUrl?: string;
}

@Schema()
export class WikiListResponse {
  @Field(() => [WikiListItem])
  items: WikiListItem[];

  /** How many entries exist but lie beyond the reader's gate. A count only — never the entries themselves. */
  @Field(() => Integer)
  lockedCount: number;
}

@Schema()
export class WikiFacetItem {
  @Field()
  facetKey: string;

  @Field()
  content: string;

  @Field(() => Integer)
  sortOrder: number;
}

@Schema()
export class WikiImageItem {
  @Field()
  imageUrl: string;

  @Field(() => String, { optional: true })
  caption?: string;

  @Field(() => Integer)
  sortOrder: number;
}

@Schema()
export class WikiEntryDetailResponse {
  @Field()
  entryKey: string;

  @Field(() => String, { enum: [...WIKI_ENTRY_TYPES] })
  type: WikiEntryType;

  @Field()
  name: string;

  @Field(() => String, { optional: true })
  imageUrl?: string;

  @Field(() => [WikiFacetItem])
  facets: WikiFacetItem[];

  @Field(() => [WikiImageItem])
  images: WikiImageItem[];

  /** How many facets exist but lie beyond the reader's gate. A count only — never the facet content. */
  @Field(() => Integer)
  hiddenFacetCount: number;
}
