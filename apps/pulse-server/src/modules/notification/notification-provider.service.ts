import { Injectable } from '@shadow-library/app';

import { buildRenderGlobals, type RenderBundle, TemplateEngineService } from '@modules/template';
import { Configuration, Notification } from '@server/database';

import { DevNotificationProvider, EmailAddress, NotificationOpResult, ResendNotificationProvider, SendEmailConfig, SendPushNotificationConfig, SendSMSConfig } from './providers';

@Injectable()
export class NotificationProviderService {
  constructor(
    private readonly devProvider: DevNotificationProvider,
    private readonly resendProvider: ResendNotificationProvider,
    private readonly engine: TemplateEngineService,
  ) {}

  private parseEmailAddress(email: string): EmailAddress {
    const emailRegex = /^(.*?)(?:\s*<(.+?)>)?$/;
    const match = email.match(emailRegex);
    if (match?.[2]) {
      const name = match[1]?.trim();
      return { name, email: match[2].trim() };
    }

    return { email };
  }

  private buildData(notificationJob: Notification.Job): Record<string, unknown> {
    return { ...buildRenderGlobals(), ...((notificationJob.payload as Record<string, unknown> | null) ?? {}) };
  }

  async sendEmail(notificationJob: Notification.Job, senderEndpoint: Configuration.SenderEndpoint, bundle: RenderBundle): Promise<NotificationOpResult> {
    const { subject, body } = await this.engine.render({
      channel: 'EMAIL',
      subject: bundle.subject,
      body: bundle.body,
      layout: bundle.layout,
      partials: bundle.partials,
      data: this.buildData(notificationJob),
    });
    const toEmail = this.parseEmailAddress(notificationJob.recipient);
    const fromEmail = this.parseEmailAddress(senderEndpoint.identifier);
    const config: SendEmailConfig = { to: [toEmail], from: fromEmail, subject: subject ?? '', body, notificationId: notificationJob.id, payload: this.rawPayload(notificationJob) };

    if (senderEndpoint.provider === 'DEV') return this.devProvider.sendEmail(config);
    else if (senderEndpoint.provider === 'RESEND') return this.resendProvider.sendEmail(config);
    else return { success: false, retriable: false, error: new Error('Not implemented') };
  }

  async sendSMS(notificationJob: Notification.Job, senderEndpoint: Configuration.SenderEndpoint, bundle: RenderBundle): Promise<NotificationOpResult> {
    const { body } = await this.engine.render({ channel: 'SMS', subject: null, body: bundle.body, data: this.buildData(notificationJob) });
    const config: SendSMSConfig = {
      from: senderEndpoint.identifier,
      to: notificationJob.recipient,
      message: body,
      notificationId: notificationJob.id,
      payload: this.rawPayload(notificationJob),
    };

    if (senderEndpoint.provider === 'DEV') return this.devProvider.sendSMS(config);
    else return { success: false, retriable: false, error: new Error('Not implemented') };
  }

  async sendPushNotification(notificationJob: Notification.Job, senderEndpoint: Configuration.SenderEndpoint, bundle: RenderBundle): Promise<NotificationOpResult> {
    const { subject, body } = await this.engine.render({ channel: 'PUSH', subject: bundle.subject, body: bundle.body, data: this.buildData(notificationJob) });
    const config: SendPushNotificationConfig = {
      deviceToken: notificationJob.recipient,
      title: subject ?? '',
      message: body,
      notificationId: notificationJob.id,
      payload: this.rawPayload(notificationJob),
    };

    if (senderEndpoint.provider === 'DEV') return this.devProvider.sendPushNotification(config);
    else return { success: false, retriable: false, error: new Error('Not implemented') };
  }

  private rawPayload(notificationJob: Notification.Job): Record<string, any> | undefined {
    return (notificationJob.payload as Record<string, any> | null) ?? undefined;
  }
}
