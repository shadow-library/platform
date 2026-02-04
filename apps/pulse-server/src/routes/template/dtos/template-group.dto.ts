/**
 * Importing npm packages
 */
import { Field, OmitType, PartialType, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

/**
 * Importing user defined packages
 */
import { type Notification, type Template } from '@modules/datastore';
import { MessageType, Priority, SortByTime } from '@server/routes/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class CreateTemplateGroupBody {
  @Field()
  templateKey: string;

  @Field(() => MessageType)
  messageType: Template.MessageType;

  @Field({ optional: true })
  @Transform({ output: 'strip:null' })
  description?: string | null;

  @Field(() => Priority, { optional: true })
  priority?: Notification.Priority;

  @Field({ optional: true })
  isActive?: boolean;
}

@Schema()
export class TemplateGroupResponse extends CreateTemplateGroupBody {
  @Field(() => String)
  id: bigint;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema({ minProperties: 1 })
export class UpdateTemplateGroupBody extends PartialType(OmitType(CreateTemplateGroupBody, ['templateKey'])) {}

@Schema()
export class ListTemplateGroupsQuery extends PaginationQuery(SortByTime) {
  @Field({ optional: true })
  key?: string;
}

@Schema()
export class TemplateGroupParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  groupId: bigint;
}

@Schema()
export class ListTemplateGroupResponse extends Paginated(TemplateGroupResponse) {}
