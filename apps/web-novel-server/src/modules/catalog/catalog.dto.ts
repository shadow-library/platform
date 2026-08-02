/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { EnumType, Field, Integer, Schema } from '@shadow-library/class-schema';
import { Paginated, PaginationQuery } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { NOVEL_VISIBILITIES } from '@server/modules/publish';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const NOVEL_SORT_FIELDS = EnumType.create('NovelSortBy', ['updatedAt', 'createdAt', 'title'] as const);

@Schema()
export class NovelCatalogQuery extends PaginationQuery(NOVEL_SORT_FIELDS, { sortBy: 'updatedAt', sortOrder: 'desc' }) {
  /** Case-insensitive substring match on the title */
  @Field(() => String, { optional: true })
  search?: string;

  /** Exact match against any of the novel's genre strings */
  @Field(() => String, { optional: true })
  genre?: string;

  @Field(() => String, { enum: ['live', 'retired'], optional: true })
  status?: 'live' | 'retired';
}

@Schema()
export class NovelSummary {
  @Field()
  slug: string;

  @Field()
  title: string;

  @Field(() => String, { optional: true })
  blurb?: string;

  /** Absolute public URL, resolved server-side from the storage origin; absent when the novel has no cover. */
  @Field(() => String, { optional: true })
  coverUrl?: string;

  @Field(() => [String])
  genres: string[];

  @Field(() => String, { enum: ['live', 'retired'] })
  status: 'live' | 'retired';

  /** Safe to surface: only a caller already cleared to see the novel ever receives this. */
  @Field(() => String, { enum: [...NOVEL_VISIBILITIES] })
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
