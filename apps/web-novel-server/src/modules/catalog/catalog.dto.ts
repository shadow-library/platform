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

  @Field(() => String, { optional: true })
  coverPath?: string;

  @Field(() => [String])
  genres: string[];

  @Field(() => String, { enum: ['live', 'retired'] })
  status: 'live' | 'retired';

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
