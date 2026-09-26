import { Field, Integer, OmitType, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

import { ChapterStatus, SortByChapter } from '@server/common';
import { type Chapter } from '@server/database';

@Schema()
export class ChapterProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class ChapterParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => Integer)
  @Transform('int:parse')
  n: number;
}

export const CHAPTER_LIST_DEFAULT_LIMIT = 25;

@Schema()
export class ListChaptersQuery extends PaginationQuery(SortByChapter, { sortBy: 'number', sortOrder: 'desc', limit: CHAPTER_LIST_DEFAULT_LIMIT }, { maximumLimit: 500 }) {
  @Field(() => ChapterStatus, { optional: true })
  status?: Chapter.Status;

  @Field({ optional: true, description: 'Only chapters in this volume.' })
  volumeKey?: string;

  @Field({ optional: true, description: "Only chapters whose brief's point of view (any pooled scene) is this entity key." })
  pov?: string;

  @Field({ optional: true, description: 'Only chapters this thread opened, closed, or was last advanced in.' })
  thread?: string;

  @Field(() => Integer, { optional: true, description: 'Ignore limit/offset and return the page containing this chapter number instead.' })
  goto?: number;
}

@Schema()
class ChapterListResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field(() => Integer)
  number: number;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field(() => Integer, { optional: true, nullable: true })
  wordCount?: number | null;

  @Field(() => ChapterStatus)
  status: Chapter.Status;

  @Field({ optional: true, nullable: true })
  generator?: string | null;

  @Field()
  continuityApplied: boolean;

  @Field()
  isolated: boolean;

  @Field({ optional: true, nullable: true })
  volumeKey?: string | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ChapterResponse extends ChapterListResponse {
  @Field({ optional: true, nullable: true })
  content?: string | null;

  @Field({ optional: true, nullable: true })
  summary?: string | null;

  @Field({ optional: true, nullable: true })
  note?: string | null;
}

@Schema({ minProperties: 1 })
export class UpdateChapterBody {
  @Field({ optional: true })
  title?: string;

  @Field({ optional: true })
  content?: string;
}

@Schema()
export class ListChapterResponse extends Paginated(ChapterListResponse) {
  @Field(() => Integer)
  page: number;

  @Field(() => Integer)
  totalPages: number;
}

@Schema()
export class SearchChaptersQuery extends OmitType(ListChaptersQuery, ['status', 'goto', 'sortBy', 'sortOrder'] as const) {
  @Field({ minLength: 1, maxLength: 200, description: 'Text to search for across finalized and drafted prose.' })
  q: string;
}

@Schema()
export class ChapterSearchHit {
  @Field(() => Integer)
  number: number;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field({ description: 'A short excerpt around the first match, ellipsised at either end when truncated.' })
  snippet: string;

  @Field(() => Integer, { description: 'How many times the query occurs in this chapter, case-insensitively.' })
  matchCount: number;
}

@Schema()
export class ChapterSearchResponse extends Paginated(ChapterSearchHit) {
  @Field(() => Integer)
  page: number;

  @Field(() => Integer)
  totalPages: number;
}
