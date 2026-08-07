import { Field, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { NotificationChannel, VersionStatus } from '@server/common';
import { type Notification, type Template } from '@server/database';

import { TemplateParams } from './template.dto';

@Schema()
export class ContentResponse {
  @Field(() => NotificationChannel)
  channel: Notification.Channel;

  @Field()
  locale: string;

  @Field({ optional: true })
  @Transform({ output: 'strip:null' })
  subject?: string | null;

  @Field()
  body: string;

  @Field({ optional: true })
  @Transform({ output: 'strip:null' })
  layoutKey?: string | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class VersionResponse {
  @Field()
  version: number;

  @Field(() => VersionStatus)
  status: Template.VersionStatus;

  @Field({ optional: true })
  @Transform({ output: 'strip:null' })
  notes?: string | null;

  @Field({ optional: true })
  @Transform({ output: 'strip:null' })
  editedBy?: string | null;

  @Field(() => String, { format: 'date-time', optional: true })
  @Transform({ output: 'strip:null' })
  publishedAt?: Date | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class VersionDetailResponse extends VersionResponse {
  @Field(() => [ContentResponse])
  contents: ContentResponse[];
}

@Schema()
export class VersionListResponse {
  @Field(() => [VersionResponse])
  items: VersionResponse[];
}

@Schema()
export class UpsertContentBody {
  @Field(() => NotificationChannel)
  channel: Notification.Channel;

  @Field({ optional: true })
  locale?: string;

  @Field({ optional: true })
  @Transform({ output: 'strip:null' })
  subject?: string | null;

  @Field()
  body: string;

  @Field({ optional: true })
  @Transform({ output: 'strip:null' })
  layoutKey?: string | null;
}

@Schema()
export class PublishVersionBody {
  @Field({ optional: true })
  notes?: string;
}

@Schema()
export class PreviewBody {
  @Field(() => NotificationChannel)
  channel: Notification.Channel;

  @Field({ optional: true })
  locale?: string;

  @Field(() => Object, { optional: true, additionalProperties: true })
  data?: Record<string, unknown>;
}

@Schema()
export class PreviewResponse {
  @Field({ optional: true })
  @Transform({ output: 'strip:null' })
  subject?: string | null;

  @Field()
  body: string;
}

@Schema()
export class VersionParams extends TemplateParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('int:parse')
  version: number;
}

@Schema()
export class ContentParams extends TemplateParams {
  @Field(() => NotificationChannel)
  channel: Notification.Channel;

  @Field()
  locale: string;
}
