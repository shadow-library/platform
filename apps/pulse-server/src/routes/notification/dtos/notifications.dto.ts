/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';
import { ErrorResponseDto, ServerError, Transform } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { type Notification, schema } from '@modules/datastore';
import { ChannelNotificationStatus, NotificationStatus } from '@modules/notification';

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
  @Field(() => String, { enum: schema.notificationChannel.enumValues })
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
