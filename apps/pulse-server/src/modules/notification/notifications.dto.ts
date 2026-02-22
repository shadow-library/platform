/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';
import { ErrorResponseDto, ServerError, Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { ChannelNotificationStatus, NotificationStatus } from '@modules/notification';
import { MessageType, NotificationChannel, SortByCreatedAt } from '@server/common';
import { type Notification, type Template } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema({ minProperties: 1 })
export class NotificationRecipients {
  @Field({ optional: true })
  email?: string;

  @Field({ optional: true })
  phone?: string;

  @Field({ optional: true })
  push?: string;
}

@Schema()
export class CreateNotificationBody {
  @Field()
  templateKey: string;

  @Field()
  recipients: NotificationRecipients;

  @Field({ optional: true })
  payload?: Record<string, any>;

  @Field({ optional: true })
  locale?: string;

  @Field({ optional: true })
  service?: string;
}

@Schema()
export class NotificationChannelResponse {
  @Field(() => NotificationChannel)
  channel: Notification.Channel;

  @Field(() => String, { enum: Object.values(ChannelNotificationStatus) })
  status: ChannelNotificationStatus;

  @Field({ optional: true })
  locale?: string;

  @Field({ optional: true })
  jobId?: string;

  @Field(() => ErrorResponseDto, { optional: true })
  @Transform('server-error:toObject')
  error?: ServerError;
}

@Schema()
export class CreateNotificationResponse {
  @Field(() => String, { enum: Object.values(NotificationStatus) })
  status: NotificationStatus;

  @Field(() => [NotificationChannelResponse])
  channelResults: NotificationChannelResponse[];
}

@Schema()
export class ListNotificationMessagesQuery extends PaginationQuery(SortByCreatedAt) {
  @Field(() => NotificationChannel, { optional: true })
  channel?: Notification.Channel;

  @Field({ optional: true })
  recipient?: string;
}

@Schema()
export class NotificationMessageResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => NotificationChannel)
  channel: Notification.Channel;

  @Field()
  recipient: string;

  @Field()
  locale: string;

  @Field({ optional: true })
  renderedSubject?: string | null;

  @Field()
  renderedBody: string;

  @Field(() => Object, { optional: true, additionalProperties: true })
  payload?: unknown;

  @Field()
  templateKey: string;

  @Field(() => MessageType)
  messageType: Template.MessageType;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;
}

@Schema()
export class ListNotificationMessagesResponse extends Paginated(NotificationMessageResponse) {}
