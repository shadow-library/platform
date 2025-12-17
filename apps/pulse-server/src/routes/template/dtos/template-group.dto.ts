/**
 * Importing npm packages
 */
import { Field, OmitType, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

/**
 * Importing user defined packages
 */
import { type Notification, schema } from '@modules/datastore';

import { TemplateVariantResponse } from './template-variant.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class TemplateGroupResponse {
  @Field(() => Number)
  id: bigint;

  @Field()
  templateKey: string;

  @Field({ optional: true })
  @Transform('strip:null')
  description?: string | null;

  @Field({ enum: schema.priority.enumValues })
  priority: string;

  @Field()
  isActive: boolean;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class CreateTemplateGroupBody {
  @Field()
  templateKey: string;

  @Field({ optional: true })
  description?: string;

  @Field(() => String, { enum: schema.priority.enumValues, optional: true })
  priority?: Notification.Priority;

  @Field({ optional: true })
  isActive?: boolean;
}

@Schema()
export class UpdateTemplateGroupBody extends OmitType(CreateTemplateGroupBody, ['templateKey']) {}

@Schema()
export class TemplateGroupDetailResponse extends TemplateGroupResponse {
  @Field(() => [TemplateVariantResponse])
  variants: TemplateVariantResponse[];
}

@Schema()
export class ListTemplateGroupsQuery extends PaginationQuery(['createdAt', 'updatedAt'] as const) {
  @Field({ optional: true })
  key?: string;
}

@Schema()
export class TemplateGroupParams {
  @Field(() => Number)
  @Transform('bigint:parse')
  id: bigint;
}

@Schema()
export class ListTemplateGroupResponse extends Paginated(TemplateGroupResponse) {}
