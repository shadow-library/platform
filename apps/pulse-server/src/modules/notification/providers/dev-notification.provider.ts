/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';
import { InferInsertModel } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { PrimaryDatabase, schema } from '@modules/database';
import { APP_NAME } from '@server/constants';

import {
  EmailProvider,
  NotificationOpResult,
  PushNotificationProvider,
  SMSProvider,
  SendEmailConfig,
  SendPushNotificationConfig,
  SendSMSConfig,
} from './base-notification.provider';

/**
 * Defining types
 */

type MessageRecord = InferInsertModel<typeof schema.notificationMessages>;

/**
 * Declaring the constants
 */

@Injectable()
export class DevNotificationProvider implements SMSProvider, EmailProvider, PushNotificationProvider {
  private readonly logger = Logger.getLogger(APP_NAME, DevNotificationProvider.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = this.databaseService.getPostgresClient();
  }

  private async insertMessage(record: MessageRecord): Promise<NotificationOpResult> {
    const [message] = await this.db
      .insert(schema.notificationMessages)
      .values(record)
      .returning()
      .catch(err => this.databaseService.translateError(err));
    assert(message, 'Failed to log notification message in dev provider');
    this.logger.info('Sent notification message', { notificationMessageId: message.id, jobId: record.notificationJobId });
    return { success: true };
  }

  sendSMS(config: SendSMSConfig): Promise<NotificationOpResult> {
    return this.insertMessage({ renderedBody: config.message, notificationJobId: config.notificationId });
  }

  sendEmail(config: SendEmailConfig): Promise<NotificationOpResult> {
    return this.insertMessage({ renderedBody: config.body, renderedSubject: config.subject, notificationJobId: config.notificationId });
  }

  sendPushNotification(config: SendPushNotificationConfig): Promise<NotificationOpResult> {
    return this.insertMessage({ renderedBody: config.message, renderedSubject: config.title, notificationJobId: config.notificationId });
  }
}
