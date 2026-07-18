/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Field, Integer, OmitType, PartialType, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

/**
 * Importing user defined packages
 */
import { EntityOrigin, EntitySignificance, EntityType, SortByTime } from '@server/common';
import { entitySignificance, type Knowledge } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class EntityProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class EntityKeyParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field()
  entityKey: string;
}

@Schema()
export class EntityImageParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field()
  entityKey: string;

  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  imageId: bigint;
}

@Schema()
export class CreateEntityBody {
  @Field()
  entityKey: string;

  @Field(() => EntityType)
  type: Knowledge.EntityType;

  @Field()
  name: string;

  @Field(() => EntitySignificance, { optional: true })
  significance?: Knowledge.EntitySignificance;

  @Field({ optional: true })
  status?: string;

  @Field(() => EntityOrigin, { optional: true })
  origin?: Knowledge.EntityOrigin;

  @Field({ optional: true })
  notes?: string;

  @Field({ optional: true })
  motivation?: string;

  @Field({ optional: true })
  body?: string;

  @Field(() => [String], { optional: true })
  aliases?: string[];
}

@Schema()
export class EntityImageResponse {
  @Field(() => String)
  id: bigint;

  @Field()
  imagePath: string;

  @Field({ optional: true, nullable: true })
  caption?: string | null;

  @Field(() => Integer)
  sortOrder: number;
}

@Schema()
export class EntityResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field()
  entityKey: string;

  @Field(() => EntityType)
  type: Knowledge.EntityType;

  @Field()
  name: string;

  @Field(() => String, { optional: true, enum: entitySignificance.enumValues })
  significance?: Knowledge.EntitySignificance | null;

  @Field({ optional: true, nullable: true })
  status?: string | null;

  @Field(() => String, { optional: true, nullable: true })
  origin?: Knowledge.EntityOrigin | null;

  @Field(() => Integer, { optional: true, nullable: true })
  firstSeenChapter?: number | null;

  @Field({ optional: true, nullable: true })
  notes?: string | null;

  @Field({ optional: true, nullable: true })
  motivation?: string | null;

  @Field({ optional: true, nullable: true })
  body?: string | null;

  @Field({ optional: true, nullable: true })
  imagePath?: string | null;

  // The entity's gallery of additional reference images, populated on the single-entity `get` route.
  @Field(() => [EntityImageResponse], { optional: true })
  images?: EntityImageResponse[];

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class UploadImageBody {
  @Field(() => String, { enum: ['image/png', 'image/jpeg', 'image/webp'] })
  mime: 'image/png' | 'image/jpeg' | 'image/webp';

  // Base64-encoded image bytes, without the `data:` URL prefix.
  @Field()
  image: string;
}

@Schema()
export class AddEntityImageBody extends UploadImageBody {
  @Field({ optional: true })
  caption?: string;
}

@Schema({ minProperties: 1 })
export class UpdateEntityBody extends PartialType(OmitType(CreateEntityBody, ['entityKey', 'type'] as const)) {}

@Schema()
export class ListEntitiesQuery extends PaginationQuery(SortByTime) {
  @Field(() => EntityType, { optional: true })
  type?: Knowledge.EntityType;

  @Field(() => EntityOrigin, { optional: true })
  origin?: Knowledge.EntityOrigin;
}

@Schema()
export class ListEntityResponse extends Paginated(EntityResponse) {}
