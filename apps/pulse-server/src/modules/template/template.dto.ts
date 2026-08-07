import { Field, OmitType, PartialType, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

import { MessageType, NotificationChannel, Priority, SortByTime } from '@server/common';
import { type Notification, type Template } from '@server/database';

@Schema()
export class CreateTemplateBody {
  @Field()
  templateKey: string;

  @Field()
  name: string;

  @Field(() => MessageType)
  messageType: Template.MessageType;

  @Field(() => Priority, { optional: true })
  priority?: Notification.Priority;

  @Field({ optional: true })
  @Transform({ output: 'strip:null' })
  description?: string | null;

  @Field({ optional: true })
  @Transform({ output: 'strip:null' })
  category?: string | null;

  @Field(() => Object, {
    optional: true,
    additionalProperties: true,
    description: 'Producer-to-template variable contract. Trusted operators author this object and it is stored without structural coercion.',
  })
  variableSchema?: Template.VariableSchema;

  @Field({ optional: true })
  isActive?: boolean;
}

@Schema()
export class TemplateResponse extends OmitType(CreateTemplateBody, ['priority', 'variableSchema', 'isActive'] as const) {
  @Field(() => String)
  id: bigint;

  @Field(() => Priority)
  priority: Notification.Priority;

  @Field(() => Object, { additionalProperties: true })
  variableSchema: Template.VariableSchema;

  @Field()
  isActive: boolean;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ChannelSettingResponse {
  @Field(() => String)
  templateId: bigint;

  @Field(() => NotificationChannel)
  channel: Notification.Channel;

  @Field()
  isEnabled: boolean;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class TemplateDetailResponse extends TemplateResponse {
  @Field(() => [ChannelSettingResponse])
  channels: ChannelSettingResponse[];
}

@Schema({ minProperties: 1 })
export class UpdateTemplateBody extends PartialType(OmitType(CreateTemplateBody, ['templateKey'])) {}

@Schema()
export class SetChannelSettingBody {
  @Field()
  isEnabled: boolean;
}

@Schema()
export class ListTemplatesQuery extends PaginationQuery(SortByTime) {
  @Field({ optional: true })
  key?: string;

  @Field(() => MessageType, { optional: true })
  messageType?: Template.MessageType;
}

@Schema()
export class TemplateParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  templateId: bigint;
}

@Schema()
export class ChannelParams extends TemplateParams {
  @Field(() => NotificationChannel)
  channel: Notification.Channel;
}

@Schema()
export class ListTemplateResponse extends Paginated(TemplateResponse) {}
