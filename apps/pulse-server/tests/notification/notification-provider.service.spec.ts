import { describe, expect, it, mock } from 'bun:test';

import { NotificationProviderService } from '@modules/notification/notification-provider.service';
import type { DevNotificationProvider, ResendNotificationProvider, SendEmailConfig } from '@modules/notification/providers';
import type { RenderBundle, TemplateEngineService } from '@modules/template';
import type { Configuration, Notification } from '@server/database';

const payload = { name: 'Ada' };

const job = {
  id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  recipient: 'reader@example.com',
  payload,
} as Notification.Job;

const bundle = {
  subject: 'Welcome {{ name }}',
  body: '<p>Welcome {{ name }}</p>',
  layout: null,
  partials: {},
} as RenderBundle;

function createService() {
  const devSend = mock(async () => ({ success: true }) as const);
  const resendSend = mock(async () => ({ success: true }) as const);
  const engine = { render: mock(async () => ({ subject: 'Welcome Ada', body: '<p>Welcome Ada</p>' })) } as unknown as TemplateEngineService;
  const service = new NotificationProviderService(
    { sendEmail: devSend } as unknown as DevNotificationProvider,
    { sendEmail: resendSend } as unknown as ResendNotificationProvider,
    engine,
  );
  return { service, devSend, resendSend };
}

describe('NotificationProviderService', () => {
  it('should dispatch RESEND email endpoints to the Resend provider', async () => {
    const { service, devSend, resendSend } = createService();
    const endpoint = { provider: 'RESEND', identifier: 'Shadow <no-reply@shadow.test>' } as Configuration.SenderEndpoint;

    const result = await service.sendEmail(job, endpoint, bundle);

    expect(result).toStrictEqual({ success: true });
    expect(devSend).not.toHaveBeenCalled();
    expect(resendSend).toHaveBeenCalledWith({
      to: [{ email: 'reader@example.com' }],
      from: { name: 'Shadow', email: 'no-reply@shadow.test' },
      subject: 'Welcome Ada',
      body: '<p>Welcome Ada</p>',
      notificationId: job.id,
      payload,
    } satisfies SendEmailConfig);
  });
});
