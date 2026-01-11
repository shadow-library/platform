/**
 * Importing npm packages
 */
import { Body, HttpController, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { NotificationService } from '@modules/notification';

import { CreateNotificationBody, CreateNotificationResponse } from './dtos';

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
}
