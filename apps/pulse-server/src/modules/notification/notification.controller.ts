import { EnableIf } from '@shadow-library/app';
import { RequireElevation, RequirePermission, RequireScope } from '@shadow-library/auth/module';
import { Config } from '@shadow-library/common';
import { Body, Get, HttpController, Post, Query, RespondFor } from '@shadow-library/fastify';

import { PULSE_PERMISSIONS, PULSE_SCOPES } from '@modules/auth';

import { ConsoleSendService } from './console-send.service';
import { NotificationService } from './notification.service';
import { CreateNotificationBody, CreateNotificationResponse, ListNotificationMessagesQuery, ListNotificationMessagesResponse } from './notifications.dto';

@HttpController('/api/v1/notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly consoleSendService: ConsoleSendService,
  ) {}

  @Post()
  @RequireScope(PULSE_SCOPES.notificationsSend)
  @RespondFor(201, CreateNotificationResponse)
  createNotification(@Body() body: CreateNotificationBody): Promise<CreateNotificationResponse> {
    return this.notificationService.send(body);
  }

  /** Separate from the producer route because the auth guard ANDs its requirements, and a service token names no organisation to check a permission in. */
  @Post('/console')
  @RequirePermission(PULSE_PERMISSIONS.notificationsSend, { highRisk: true })
  @RequireElevation()
  @RespondFor(201, CreateNotificationResponse)
  sendFromConsole(@Body() body: CreateNotificationBody): Promise<CreateNotificationResponse> {
    return this.consoleSendService.send(body);
  }

  @Get('/messages')
  @EnableIf(() => Config.get('app.stage') === 'dev')
  @RequirePermission(PULSE_PERMISSIONS.messagesRead)
  @RespondFor(200, ListNotificationMessagesResponse)
  listMessages(@Query() query: ListNotificationMessagesQuery): Promise<ListNotificationMessagesResponse> {
    return this.notificationService.listMessages(query);
  }
}
