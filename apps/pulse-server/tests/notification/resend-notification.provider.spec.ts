import { describe, expect, it, mock } from 'bun:test';
import type { ErrorResponse, Resend } from 'resend';

import { ResendNotificationProvider, type SendEmailConfig } from '@modules/notification/providers';

const config: SendEmailConfig = {
  notificationId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  from: { name: 'Shadow', email: 'no-reply@shadow.test' },
  to: [{ email: 'reader@example.com' }],
  cc: [{ name: 'Support', email: 'support@shadow.test' }],
  bcc: [{ email: 'audit@shadow.test' }],
  subject: 'Welcome',
  body: '<p>Welcome to Shadow</p>',
};

function providerWith(send: (...args: any[]) => Promise<any>): ResendNotificationProvider {
  return new ResendNotificationProvider({ client: { emails: { send } } as unknown as Resend });
}

function responseError(name: ErrorResponse['name'], statusCode: number): ErrorResponse {
  return { name, statusCode, message: `${name} message` };
}

describe('ResendNotificationProvider', () => {
  it('should send rendered HTML with formatted addresses and an idempotency key', async () => {
    const send = mock(async () => ({ data: { id: 'email_123' }, error: null, headers: {} }));

    const result = await providerWith(send).sendEmail(config);

    expect(result).toStrictEqual({ success: true });
    expect(send).toHaveBeenCalledWith(
      {
        from: 'Shadow <no-reply@shadow.test>',
        to: ['reader@example.com'],
        cc: ['Support <support@shadow.test>'],
        bcc: ['audit@shadow.test'],
        subject: 'Welcome',
        html: '<p>Welcome to Shadow</p>',
      },
      { idempotencyKey: config.notificationId },
    );
  });

  it('should fail permanently when the API key is not configured', async () => {
    const result = await new ResendNotificationProvider({ client: null }).sendEmail(config);

    expect(result).toMatchObject({ success: false, retriable: false, error: { name: 'missing_api_key' } });
  });

  it('should classify request validation errors as permanent', async () => {
    const error = responseError('validation_error', 422);
    const result = await providerWith(mock(async () => ({ data: null, error, headers: {} }))).sendEmail(config);

    expect(result).toMatchObject({ success: false, retriable: false, error: { name: 'validation_error', message: error.message } });
  });

  it('should classify rate limits and server errors as retriable', async () => {
    for (const error of [responseError('rate_limit_exceeded', 429), responseError('internal_server_error', 500)]) {
      const result = await providerWith(mock(async () => ({ data: null, error, headers: {} }))).sendEmail(config);
      expect(result).toMatchObject({ success: false, retriable: true, error: { name: error.name } });
    }
  });

  it('should classify transport exceptions as retriable', async () => {
    const result = await providerWith(
      mock(async () => {
        throw new Error('Connection reset');
      }),
    ).sendEmail(config);

    expect(result).toMatchObject({ success: false, retriable: true, error: { message: 'Connection reset' } });
  });
});
