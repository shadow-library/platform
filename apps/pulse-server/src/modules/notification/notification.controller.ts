/**
 * Importing npm packages
 */
import { EnableIf } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { Body, Get, HttpController, Post, Query, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { NotificationService } from '@modules/notification';

import { CreateNotificationBody, CreateNotificationResponse, ListNotificationMessagesQuery, ListNotificationMessagesResponse } from './notifications.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post()
  @RespondFor(201, CreateNotificationResponse)
  createNotification(@Body() body: CreateNotificationBody): Promise<CreateNotificationResponse> {
    return this.notificationService.send(body);
  }

  @Get('/messages')
  @EnableIf(() => Config.get('app.stage') === 'dev')
  @RespondFor(200, ListNotificationMessagesResponse)
  listMessages(@Query() query: ListNotificationMessagesQuery): Promise<ListNotificationMessagesResponse> {
    return this.notificationService.listMessages(query);
  }
}
