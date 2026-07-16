/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { APIRequest, Config, InternalError, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { NotificationOutbox } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

export interface SendNotification {
  templateKey: string;
  recipients: NotificationOutbox.Recipients;
  payload?: Record<string, unknown> | null;
}

/**
 * Declaring the constants
 */

/**
 * Thin client for the pulse-server notification API. The identity service owns no transport for
 * email/SMS/push; it delegates delivery to pulse-server, which resolves templates and providers.
 */
@Injectable()
export class NotificationClient {
  private readonly logger = Logger.getLogger(APP_NAME, NotificationClient.name);
  private readonly baseUrl = Config.get('notification.base-url').replace(/\/$/, '');
  private readonly serviceName = Config.get('notification.service-name');

  async send(notification: SendNotification): Promise<void> {
    /** Recipients carry the target email/phone, so this trace is debug-only (dev/local, never prod). */
    this.logger.debug('dispatching notification to pulse-server', { templateKey: notification.templateKey, recipients: notification.recipients });
    const response = await APIRequest.post(`${this.baseUrl}/notifications`)
      .body({ ...notification, service: this.serviceName })
      .suppressErrors()
      .execute()
      .catch((error: unknown) => {
        this.logger.error('notification transport error reaching pulse-server', { templateKey: notification.templateKey, baseUrl: this.baseUrl, error });
        throw error;
      });
    if (response.statusCode >= 400) {
      this.logger.error('notification dispatch rejected by pulse-server', { templateKey: notification.templateKey, status: response.statusCode, body: response.data });
      throw new InternalError(`Notification request failed with status ${response.statusCode}`);
    }
    this.logger.debug('notification dispatched to pulse-server', { templateKey: notification.templateKey });
  }
}
