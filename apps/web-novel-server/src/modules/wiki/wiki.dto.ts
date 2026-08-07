import { Field, Integer, Schema } from '@shadow-library/class-schema';

import { WIKI_ENTRY_TYPES, type WikiEntryType } from '@server/modules/publish';

@Schema()
export class WikiListItem {
  @Field()
  entryKey: string;

  @Field(() => String, { enum: [...WIKI_ENTRY_TYPES] })
  type: WikiEntryType;

  @Field()
  name: string;

  @Field(() => String, { optional: true, description: 'Absolute public URL; absent when the entry has no image.' })
  imageUrl?: string;
}

@Schema()
export class WikiListResponse {
  @Field(() => [WikiListItem])
  items: WikiListItem[];

  @Field(() => Integer, { description: "Number of entries hidden beyond the reader's progress gate; hidden entries are never returned." })
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

  @Field(() => Integer, { description: "Number of facets hidden beyond the reader's progress gate; hidden facet content is never returned." })
  hiddenFacetCount: number;
}
