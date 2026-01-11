/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import mustache from 'mustache';

/**
 * Importing user defined packages
 */
import { Configuration, Notification, Template } from '@modules/datastore';
import { APP_NAME } from '@server/constants';

import { DevNotificationProvider, EmailAddress, NotificationOpResult, SendEmailConfig, SendPushNotificationConfig, SendSMSConfig } from './providers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class NotificationProviderService {
  private readonly logger = Logger.getLogger(APP_NAME, NotificationProviderService.name);

  constructor(private readonly devProvider: DevNotificationProvider) {}

  private parseEmailAddress(email: string): EmailAddress {
    const emailRegex = /^(.*?)(?:\s*<(.+?)>)?$/;
    const match = email.match(emailRegex);
    if (match && match.length === 3) {
      const name = match[1]?.trim();
      const email = match[2]?.trim();
      return { name, email: email as string };
    }

    return { email };
  }

  async sendEmail(notificationJob: Notification.Job, senderEndpoint: Configuration.SenderEndpoint, templateVariant: Template.Variant): Promise<NotificationOpResult> {
    const toEmail = this.parseEmailAddress(notificationJob.recipient);
    const fromEmail = this.parseEmailAddress(senderEndpoint.identifier);
    const payload: Record<string, any> = notificationJob.payload ?? {};
    const subject = mustache.render(templateVariant.subject ?? 'NA', payload);
    const content = mustache.render(templateVariant.body, payload);
    const config: SendEmailConfig = { to: [toEmail], from: fromEmail, subject, body: content, notificationId: notificationJob.id, payload: payload };

    if (senderEndpoint.provider === 'DEV') return this.devProvider.sendEmail(config);
    else return { success: false, retriable: false, error: new Error('Not implemented') };
  }

  async sendSMS(notificationJob: Notification.Job, senderEndpoint: Configuration.SenderEndpoint, templateVariant: Template.Variant): Promise<NotificationOpResult> {
    const payload: Record<string, any> = notificationJob.payload ?? {};
    const message = mustache.render(templateVariant.body, payload);
    const config: SendSMSConfig = { from: senderEndpoint.identifier, to: notificationJob.recipient, message, notificationId: notificationJob.id, payload: payload };

    if (senderEndpoint.provider === 'DEV') return this.devProvider.sendSMS(config);
    else return { success: false, retriable: false, error: new Error('Not implemented') };
  }

  async sendPushNotification(notificationJob: Notification.Job, senderEndpoint: Configuration.SenderEndpoint, templateVariant: Template.Variant): Promise<NotificationOpResult> {
    const payload: Record<string, any> = notificationJob.payload ?? {};
    const title = mustache.render(templateVariant.subject ?? 'NA', payload);
    const message = mustache.render(templateVariant.body, payload);
    const config: SendPushNotificationConfig = { deviceToken: notificationJob.recipient, title, message, notificationId: notificationJob.id, payload: payload };

    if (senderEndpoint.provider === 'DEV') return this.devProvider.sendPushNotification(config);
    else return { success: false, retriable: false, error: new Error('Not implemented') };
  }
}
