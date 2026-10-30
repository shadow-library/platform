import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { PulseClient } from '@shadow-library/clients/pulse';

import { APP_NAME } from '@server/constants';
import { NotificationOutbox } from '@server/modules/infrastructure/datastore';

export const NOTIFICATION_SEND_TIMEOUT_MS = 10_000;

export interface SendNotification {
  templateKey: string;
  recipients: NotificationOutbox.Recipients;
  payload?: Record<string, unknown> | null;
}

@Injectable()
export class NotificationClient {
  private readonly logger = Logger.getLogger(APP_NAME, NotificationClient.name);

  constructor(private readonly pulse: PulseClient) {}

  async send(notification: SendNotification): Promise<void> {
    this.logger.debug('dispatching notification to pulse-server', { templateKey: notification.templateKey, recipients: notification.recipients });
    const body = { templateKey: notification.templateKey, recipients: notification.recipients, payload: notification.payload ?? undefined, service: APP_NAME };
    const response = await this.pulse.sendNotification(body, { timeoutMs: NOTIFICATION_SEND_TIMEOUT_MS }).catch((error: unknown) => {
      this.logger.error('notification transport error reaching pulse-server', { templateKey: notification.templateKey, error });
      throw error;
    });
    if (!response.ok) {
      this.logger.error('notification dispatch rejected by pulse-server', { templateKey: notification.templateKey, status: response.status, body: response.error });
      throw AppError.internal(`Notification request failed with status ${response.status}`);
    }
    this.logger.debug('notification dispatched to pulse-server', { templateKey: notification.templateKey });
  }
}
