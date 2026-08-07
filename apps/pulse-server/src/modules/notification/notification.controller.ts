import { EnableIf } from '@shadow-library/app';
import { RequirePermission, RequireScope } from '@shadow-library/auth/module';
import { Config } from '@shadow-library/common';
import { Body, Get, HttpController, Post, Query, RespondFor } from '@shadow-library/fastify';

import { PULSE_PERMISSIONS, PULSE_SCOPES } from '@modules/auth';
import { NotificationService } from '@modules/notification';

import { CreateNotificationBody, CreateNotificationResponse, ListNotificationMessagesQuery, ListNotificationMessagesResponse } from './notifications.dto';

@HttpController('/api/v1/notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post()
  @RequireScope(PULSE_SCOPES.notificationsSend)
  @RespondFor(201, CreateNotificationResponse)
  createNotification(@Body() body: CreateNotificationBody): Promise<CreateNotificationResponse> {
    return this.notificationService.send(body);
  }

  @Get('/messages')
  @EnableIf(() => Config.get('app.stage') === 'dev')
  @RequirePermission(PULSE_PERMISSIONS.logsRead)
  @RespondFor(200, ListNotificationMessagesResponse)
  listMessages(@Query() query: ListNotificationMessagesQuery): Promise<ListNotificationMessagesResponse> {
    return this.notificationService.listMessages(query);
  }
}
