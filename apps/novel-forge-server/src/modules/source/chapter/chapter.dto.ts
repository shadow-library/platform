/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

/**
 * Importing user defined packages
 */
import { ChapterStatus, SortByTime } from '@server/common';
import { type Chapter } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

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

@Schema()
export class ListChaptersQuery extends PaginationQuery(SortByTime) {
  @Field(() => ChapterStatus, { optional: true })
  status?: Chapter.Status;
}

@Schema()
export class ChapterListResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field(() => Integer)
  number: number;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field({ optional: true, nullable: true })
  url?: string | null;

  @Field(() => Integer, { optional: true, nullable: true })
  wordCount?: number | null;

  @Field(() => ChapterStatus)
  status: Chapter.Status;

  @Field({ optional: true, nullable: true })
  generator?: string | null;

  @Field()
  continuityApplied: boolean;

  @Field(() => String, { optional: true, nullable: true, format: 'date-time' })
  scrapedAt?: Date | null;

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
export class ListChapterResponse extends Paginated(ChapterListResponse) {}
