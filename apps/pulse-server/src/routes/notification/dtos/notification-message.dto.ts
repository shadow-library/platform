/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

/**
 * Importing user defined packages
 */
import { type Notification, type Template } from '@modules/database';
import { MessageType, NotificationChannel, SortByCreatedAt } from '@server/routes/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

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
