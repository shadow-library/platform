import { EnumType, Field, Integer, Schema } from '@shadow-library/class-schema';
import { Paginated, PaginationQuery } from '@shadow-library/modules';
import { type DarkContentLevel, type Genre, type SexualContentLevel, type Tag, type ViolenceLevel } from '@shadow-library/sdk';

import { DarkContentRating, NovelGenre, NovelTag, SexualContentRating, ViolenceRating } from '@server/classes';
import { NOVEL_VISIBILITIES } from '@server/modules/publish';

const NOVEL_SORT_FIELDS = EnumType.create('NovelSortBy', ['updatedAt', 'createdAt', 'title'] as const);

@Schema()
export class NovelCatalogQuery extends PaginationQuery(NOVEL_SORT_FIELDS, { sortBy: 'updatedAt', sortOrder: 'desc' }) {
  @Field(() => String, { optional: true, description: 'Case-insensitive substring match on the title.' })
  search?: string;

  @Field(() => NovelGenre, { optional: true, description: "Exact match against any of the novel's genres." })
  genre?: Genre;

  @Field(() => NovelTag, { optional: true, description: "Exact match against any of the novel's tags." })
  tag?: Tag;

  @Field(() => String, { enum: ['live', 'retired'], optional: true })
  status?: 'live' | 'retired';

  @Field(() => SexualContentRating, {
    optional: true,
    description: 'Highest acceptable sexual-content level, inclusive. Novels with no rating for this dimension are excluded, not treated as satisfying the ceiling.',
  })
  maxSexualContent?: SexualContentLevel;

  @Field(() => ViolenceRating, {
    optional: true,
    description: 'Highest acceptable violence level, inclusive. Novels with no rating for this dimension are excluded, not treated as satisfying the ceiling.',
  })
  maxViolence?: ViolenceLevel;

  @Field(() => DarkContentRating, {
    optional: true,
    description: 'Highest acceptable dark-content level, inclusive. Novels with no rating for this dimension are excluded, not treated as satisfying the ceiling.',
  })
  maxDarkContent?: DarkContentLevel;
}

@Schema()
export class NovelSummary {
  @Field()
  slug: string;

  @Field()
  title: string;

  @Field(() => String, { optional: true })
  blurb?: string;

  @Field(() => String, { optional: true, description: 'Absolute public URL; absent when the novel has no cover.' })
  coverUrl?: string;

  @Field(() => [NovelGenre])
  genres: Genre[];

  @Field(() => [NovelTag])
  tags: Tag[];

  @Field(() => SexualContentRating, { optional: true, description: 'Absent when unrated; never asserts the absence of content.' })
  sexualContent?: SexualContentLevel;

  @Field(() => ViolenceRating, { optional: true, description: 'Absent when unrated; never asserts the absence of content.' })
  violence?: ViolenceLevel;

  @Field(() => DarkContentRating, { optional: true, description: 'Absent when unrated; never asserts the absence of content.' })
  darkContent?: DarkContentLevel;

  @Field(() => String, { enum: ['live', 'retired'] })
  status: 'live' | 'retired';

  @Field(() => String, { enum: [...NOVEL_VISIBILITIES], description: 'The access tier already authorized for the caller.' })
  visibility: (typeof NOVEL_VISIBILITIES)[number];

  @Field(() => Integer)
  chapterCount: number;

  @Field()
  updatedAt: string;
}

@Schema()
export class NovelCatalogResponse extends Paginated(NovelSummary) {}

@Schema()
export class NovelDetailResponse extends NovelSummary {
  @Field()
  createdAt: string;
}

@Schema()
export class ChapterMetaItem {
  @Field(() => Integer)
  ordinal: number;

  @Field()
  title: string;

  @Field(() => Integer, { optional: true })
  wordCount?: number;

  @Field(() => String, { optional: true })
  publishedAt?: string;
}

@Schema()
export class ChapterListResponse {
  @Field(() => [ChapterMetaItem])
  items: ChapterMetaItem[];
}

@Schema()
export class ChapterContentResponse {
  @Field()
  novelSlug: string;

  @Field(() => Integer)
  ordinal: number;

  @Field()
  title: string;

  @Field()
  content: string;

  @Field(() => String, { optional: true })
  authorNote?: string;

  @Field(() => Integer, { optional: true })
  wordCount?: number;

  @Field(() => Integer)
  revision: number;

  @Field(() => String, { optional: true })
  publishedAt?: string;
}
