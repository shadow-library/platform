import { Field, Schema } from '@shadow-library/class-schema';
import { type AppErrorObject } from '@shadow-library/common';
import { ErrorResponseDto, Sensitive } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules';

import { MessageType, NotificationChannel, SortByCreatedAt } from '@server/common';
import { type Notification, type Template } from '@server/database';

import { ChannelNotificationStatus, NotificationStatus } from './notification.service';

@Schema({ minProperties: 1 })
export class NotificationRecipients {
  @Field({ optional: true })
  @Sensitive('email')
  email?: string;

  @Field({ optional: true })
  @Sensitive('number')
  phone?: string;

  @Field({ optional: true })
  @Sensitive()
  push?: string;
}

@Schema()
export class CreateNotificationBody {
  @Field({ maxLength: 255 })
  templateKey: string;

  @Field()
  recipients: NotificationRecipients;

  @Field({ optional: true })
  @Sensitive()
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
  error?: AppErrorObject;
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
  @Sensitive()
  recipient?: string;
}

@Schema()
class NotificationMessageResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => NotificationChannel)
  channel: Notification.Channel;

  @Field({ description: 'Recipient, masked — the log carries delivery metadata only, never the raw recipient or rendered body/payload (OTP codes, reset links)' })
  recipient: string;

  @Field()
  locale: string;

  @Field()
  templateKey: string;

  @Field(() => MessageType)
  messageType: Template.MessageType;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;
}

@Schema()
export class ListNotificationMessagesResponse extends Paginated(NotificationMessageResponse) {}
