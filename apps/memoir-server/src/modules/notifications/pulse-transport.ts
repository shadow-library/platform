import { Injectable } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

export interface PulseNotificationRequest {
  templateKey: string;
  email: string;
  variables: Record<string, unknown>;
}

export type PulseSendOutcome = 'sent' | 'rejected' | 'unavailable';

const PULSE_SERVICE = 'pulse-server';
const PULSE_RESOURCE = 'api://pulse';
const PULSE_SCOPE = 'notifications:send';

/** The seam between the outbox drain loop and pulse. A class token so DI has something to bind and tests can substitute a fake transport that records calls. */
export abstract class PulseTransport {
  abstract send(request: PulseNotificationRequest): Promise<PulseSendOutcome>;
}

@Injectable()
export class HttpPulseTransport extends PulseTransport {
  private readonly logger = Logger.getLogger(APP_NAME, HttpPulseTransport.name);

  constructor(private readonly authClient: AuthClient) {
    super();
  }

  async send(request: PulseNotificationRequest): Promise<PulseSendOutcome> {
    const response = await this.authClient
      .fetchService(
        PULSE_SERVICE,
        '/api/v1/notifications',
        {
          method: 'POST',
          body: JSON.stringify({ templateKey: request.templateKey, recipients: { email: request.email }, payload: request.variables }),
          headers: { 'content-type': 'application/json' },
        },
        { resource: PULSE_RESOURCE, scopes: [PULSE_SCOPE] },
      )
      .catch((error: Error) => (this.logger.error('pulse notification call failed', { templateKey: request.templateKey, error: error.message }), null));
    if (!response) return 'unavailable';
    if (response.statusCode >= 200 && response.statusCode < 300) return 'sent';
    this.logger.warn('pulse refused a notification send', { templateKey: request.templateKey, statusCode: response.statusCode });
    return 'rejected';
  }
}
