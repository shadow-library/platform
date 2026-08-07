import { Injectable } from '@shadow-library/app';
import { APIRequest, AppError, Logger } from '@shadow-library/common';

import { APP_NAME, PULSE_NOTIFICATION_URL } from '@server/constants';
import { NotificationOutbox } from '@server/modules/infrastructure/datastore';

import { NotificationTokenService } from './notification-token.service';

export interface SendNotification {
  templateKey: string;
  recipients: NotificationOutbox.Recipients;
  payload?: Record<string, unknown> | null;
}

@Injectable()
export class NotificationClient {
  private readonly logger = Logger.getLogger(APP_NAME, NotificationClient.name);

  constructor(private readonly tokenService: NotificationTokenService) {}

  async send(notification: SendNotification): Promise<void> {
    this.logger.debug('dispatching notification to pulse-server', { templateKey: notification.templateKey, recipients: notification.recipients });
    const token = await this.tokenService.getToken();
    const response = await APIRequest.post(PULSE_NOTIFICATION_URL)
      .header('authorization', `Bearer ${token}`)
      .body({ ...notification, service: APP_NAME })
      .suppressErrors()
      .execute()
      .catch((error: unknown) => {
        this.logger.error('notification transport error reaching pulse-server', { templateKey: notification.templateKey, error });
        throw error;
      });
    if (response.statusCode >= 400) {
      if (response.statusCode === 401 || response.statusCode === 403) this.tokenService.invalidate();
      this.logger.error('notification dispatch rejected by pulse-server', { templateKey: notification.templateKey, status: response.statusCode, body: response.data });
      throw AppError.internal(`Notification request failed with status ${response.statusCode}`);
    }
    this.logger.debug('notification dispatched to pulse-server', { templateKey: notification.templateKey });
  }
}
