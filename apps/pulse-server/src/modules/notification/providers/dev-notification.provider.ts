import assert from 'node:assert';

import { InferInsertModel } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { PrimaryDatabase, schema } from '@server/database';

import {
  EmailProvider,
  NotificationOpResult,
  PushNotificationProvider,
  SendEmailConfig,
  SendPushNotificationConfig,
  SendSMSConfig,
  SMSProvider,
} from './base-notification.provider';

type MessageRecord = InferInsertModel<typeof schema.notificationMessages>;

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
