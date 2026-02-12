/**
 * Importing npm packages
 */
import { Field, OmitType, PartialType, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { type Notification } from '@modules/database';
import { NotificationChannel, SortByTime } from '@server/routes/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class CreateTemplateVariantBody {
  @Field(() => NotificationChannel)
  channel: Notification.Channel;

  @Field()
  locale: string;

  @Field({ optional: true })
  @Transform('strip:null')
  subject?: string | null;

  @Field()
  body: string;

  @Field()
  isActive: boolean;
}

@Schema({ minProperties: 1 })
export class UpdateTemplateVariantBody extends PartialType(OmitType(CreateTemplateVariantBody, ['channel', 'locale'])) {}

@Schema()
export class TemplateVariantResponse extends CreateTemplateVariantBody {
  @Field(() => String)
  id: bigint;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ListTemplateVariantResponse extends Paginated(TemplateVariantResponse) {}

@Schema()
export class ListTemplateVariantQuery extends PaginationQuery(SortByTime) {
  @Field(() => NotificationChannel, { optional: true })
  channel?: Notification.Channel;

  @Field({ optional: true })
  locale?: string;
}

@Schema()
export class TemplateVariantParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  groupId: bigint;

  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  variantId: bigint;
}
