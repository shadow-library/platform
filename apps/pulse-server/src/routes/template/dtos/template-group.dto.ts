/**
 * Importing npm packages
 */
import { Field, OmitType, Schema } from '@shadow-library/class-schema';

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

  @Field({ nullable: true })
  description: string | null;

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
export class ListTemplateGroupsQuery {
  @Field({ optional: true })
  key?: string;

  @Field({ optional: true })
  offset?: number;

  @Field({ optional: true })
  limit?: number;

  @Field({ optional: true, enum: ['createdAt', 'updatedAt'] })
  sortBy?: 'createdAt' | 'updatedAt';

  @Field({ optional: true, enum: ['asc', 'desc'] })
  sortOrder?: 'asc' | 'desc';
}

@Schema()
export class TemplateGroupParams {
  @Field(() => Number)
  id: bigint;
}
