import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { PulseClient } from '@shadow-library/internal-api/pulse';

import { APP_NAME } from '@server/constants';

export interface PulseNotificationRequest {
  templateKey: string;
  email: string;
  variables: Record<string, unknown>;
}

export type PulseSendOutcome = 'sent' | 'rejected' | 'unavailable';

/** The seam between the outbox drain loop and pulse. A class token so DI has something to bind and tests can substitute a fake transport that records calls. */
export abstract class PulseTransport {
  abstract send(request: PulseNotificationRequest): Promise<PulseSendOutcome>;
}

@Injectable()
export class HttpPulseTransport extends PulseTransport {
  private readonly logger = Logger.getLogger(APP_NAME, HttpPulseTransport.name);

  constructor(private readonly pulse: PulseClient) {
    super();
  }

  async send(request: PulseNotificationRequest): Promise<PulseSendOutcome> {
    const response = await this.pulse
      .sendNotification({ templateKey: request.templateKey, recipients: { email: request.email }, payload: request.variables })
      .catch((error: Error) => (this.logger.error('pulse notification call failed', { templateKey: request.templateKey, error: error.message }), null));
    if (!response) return 'unavailable';
    if (response.ok) return 'sent';
    this.logger.warn('pulse refused a notification send', { templateKey: request.templateKey, statusCode: response.status });
    return 'rejected';
  }
}
