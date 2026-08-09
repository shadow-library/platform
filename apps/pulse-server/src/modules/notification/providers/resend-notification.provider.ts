import type { ErrorResponse, Resend } from 'resend';
import { Inject, Injectable, InjectionToken } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

import { EmailAddress, EmailProvider, NotificationOpResult, SendEmailConfig } from './base-notification.provider';

export interface ResendClientConfig {
  client: Resend | null;
}

export const RESEND_CLIENT = new InjectionToken<ResendClientConfig>('RESEND_CLIENT');

const RETRIABLE_ERROR_NAMES: ReadonlySet<ErrorResponse['name']> = new Set(['application_error', 'concurrent_idempotent_requests', 'internal_server_error', 'rate_limit_exceeded']);

@Injectable()
export class ResendNotificationProvider implements EmailProvider {
  private readonly logger = Logger.getLogger(APP_NAME, ResendNotificationProvider.name);

  constructor(@Inject(RESEND_CLIENT) private readonly clientConfig: ResendClientConfig) {}

  async sendEmail(config: SendEmailConfig): Promise<NotificationOpResult> {
    if (!this.clientConfig.client) return this.failure('missing_api_key', 'Resend is not configured; set RESEND_API_KEY', false);

    try {
      const { data, error } = await this.clientConfig.client.emails.send(
        {
          from: this.formatAddress(config.from),
          to: config.to.map(address => this.formatAddress(address)),
          cc: config.cc?.map(address => this.formatAddress(address)),
          bcc: config.bcc?.map(address => this.formatAddress(address)),
          subject: config.subject,
          html: config.body,
        },
        { idempotencyKey: config.notificationId },
      );

      if (error) return this.failure(error.name, error.message, this.isRetriable(error));

      this.logger.info('Resend accepted notification email', { notificationJobId: config.notificationId, providerMessageId: data.id });
      return { success: true };
    } catch (error) {
      const providerError = new Error(error instanceof Error ? error.message : 'Unknown Resend transport error');
      providerError.name = 'RESEND_TRANSPORT_ERROR';
      return { success: false, retriable: true, error: providerError };
    }
  }

  private failure(name: string, message: string, retriable: boolean): NotificationOpResult {
    const error = new Error(message);
    error.name = name;
    return { success: false, retriable, error };
  }

  private formatAddress(address: EmailAddress): string {
    return address.name ? `${address.name} <${address.email}>` : address.email;
  }

  private isRetriable(error: ErrorResponse): boolean {
    return error.statusCode === 429 || (error.statusCode !== null && error.statusCode >= 500) || RETRIABLE_ERROR_NAMES.has(error.name);
  }
}
