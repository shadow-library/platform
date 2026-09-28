import { afterEach, describe, expect, it, mock, setSystemTime, spyOn } from 'bun:test';

import { type AuthPrincipal } from '@shadow-library/auth';
import { AppError } from '@shadow-library/common';
import { type ContextService } from '@shadow-library/fastify';

import { ConsoleSendLimiter } from '@modules/notification/console-send-limiter.service';
import { ConsoleSendService } from '@modules/notification/console-send.service';
import { ChannelNotificationStatus, type NotificationService, NotificationStatus } from '@modules/notification/notification.service';
import { type ResolvedTemplate, type TemplateResolverService } from '@modules/template';
import { AppErrorCode } from '@server/classes';
import { type Notification, type Template } from '@server/database';
import { BASELINE_TEMPLATES } from '@server/database/seed/baseline.data';

const ADMIN: AuthPrincipal = { kind: 'user', sub: 'admin-sub', org: '7', scopes: [], claims: {} };
const EMAIL = 'jane.doe@example.com';
const PHONE = '+14155550123';

interface TemplateShape {
  messageType?: Template.MessageType;
  category?: string | null;
  variables?: Template.VariableSchema['variables'];
  channels?: Notification.Channel[];
}

const TEMPLATES: Record<string, TemplateShape> = {
  'sign-up': { messageType: 'TRANSACTIONAL', category: 'onboarding', variables: { name: { type: 'string', required: false } }, channels: ['EMAIL', 'SMS'] },
  'auth.password.changed': { messageType: 'TRANSACTIONAL', category: 'security' },
  'auth.login.otp': { messageType: 'OTP', category: 'auth' },
  'security.new-signin': { messageType: 'TRANSACTIONAL', category: 'security' },
  'user.contact.changed': { messageType: 'TRANSACTIONAL', category: null },
  'password-reset': { messageType: 'TRANSACTIONAL', category: 'account' },
  'acme.login-code': { messageType: 'OTP', category: 'onboarding' },
  'acme.alert': { messageType: 'TRANSACTIONAL', category: 'security' },
  'organisation-invitation': { messageType: 'TRANSACTIONAL', category: 'organisation' },
  'organisation-role-changed': { messageType: 'TRANSACTIONAL', category: 'organisation' },
  'bot.key.expiring': { messageType: 'TRANSACTIONAL', category: 'organisation' },
  '  Auth.Welcome ': { messageType: 'TRANSACTIONAL', category: 'onboarding' },
  'acme.notice': { messageType: 'TRANSACTIONAL', category: ' Security ' },
  'organisation-newsletter': { messageType: 'PROMOTIONAL', category: 'organisation' },
  'year-in-review': { messageType: 'PROMOTIONAL', category: 'marketing', variables: { year: { type: 'number', required: true } }, channels: ['EMAIL'] },
};

function resolvedFor(templateKey: string): ResolvedTemplate {
  const shape = TEMPLATES[templateKey] ?? {};
  const template = {
    id: 1n,
    templateKey,
    messageType: shape.messageType ?? 'TRANSACTIONAL',
    category: shape.category ?? null,
    variableSchema: { variables: shape.variables ?? {} },
  } as Template.Template;
  return { template, publishedVersion: { id: 2n } as Template.Version, enabledChannels: shape.channels ?? ['EMAIL'] };
}

function setup(principal: AuthPrincipal = ADMIN) {
  const header = mock<(name: string, value: string) => void>(() => undefined);
  const context = { getAuthPrincipal: () => principal, getResponse: () => ({ header }) } as unknown as ContextService;
  const resolver = { resolveForSend: (templateKey: string) => Promise.resolve(resolvedFor(templateKey)) } as unknown as TemplateResolverService;
  const sendResolved = mock<NotificationService['sendResolved']>(resolved =>
    Promise.resolve({
      status: NotificationStatus.ACCEPTED,
      channelResults: resolved.enabledChannels.map((channel, index) => ({ channel, status: ChannelNotificationStatus.QUEUED, jobId: String(11 + index) })),
    }),
  );
  const notifications = { sendResolved } as unknown as NotificationService;
  const service = new ConsoleSendService(notifications, resolver, new ConsoleSendLimiter(), context);
  return { service, sendResolved, header };
}

async function refusal(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof AppError)) throw new Error(`expected an AppError, got ${String(error)}`);
  return error;
}

describe('ConsoleSendService', () => {
  afterEach(() => setSystemTime());

  describe('template refusal', () => {
    it.each(['auth.password.changed', 'auth.login.otp', 'security.new-signin', 'user.contact.changed', 'password-reset'])(
      'should refuse the security-sensitive template %s without sending',
      async templateKey => {
        const { service, sendResolved } = setup();

        const error = await refusal(service.send({ templateKey, recipients: { email: EMAIL } }));

        expect(error.code).toBe('NTF_005');
        expect(error.status).toBe(403);
        expect(sendResolved).not.toHaveBeenCalled();
      },
    );

    it('should refuse any OTP template, including one an operator created outside the security families', async () => {
      const { service } = setup();
      expect((await refusal(service.send({ templateKey: 'acme.login-code', recipients: { email: EMAIL } }))).code).toBe('NTF_005');
    });

    it('should refuse a template filed under the auth or security category', async () => {
      const { service } = setup();
      expect((await refusal(service.send({ templateKey: 'acme.alert', recipients: { email: EMAIL } }))).code).toBe('NTF_005');
    });

    it.each(['organisation-invitation', 'organisation-role-changed', 'bot.key.expiring'])('should refuse %s, which identity sends', async templateKey => {
      const { service } = setup();
      expect((await refusal(service.send({ templateKey, recipients: { email: EMAIL } }))).code).toBe('NTF_005');
    });

    it('should keep an operator-created template sendable even when it shares a prefix with an identity template', async () => {
      const { service, sendResolved } = setup();

      await service.send({ templateKey: 'organisation-newsletter', recipients: { email: EMAIL } });

      expect(sendResolved).toHaveBeenCalledTimes(1);
    });

    it('should refuse a key or category that only differs from a refused one in case or surrounding space', async () => {
      const { service } = setup();

      expect((await refusal(service.send({ templateKey: '  Auth.Welcome ', recipients: { email: EMAIL } }))).code).toBe('NTF_005');
      expect((await refusal(service.send({ templateKey: 'acme.notice', recipients: { email: EMAIL } }))).code).toBe('NTF_005');
    });

    it('should send an ordinary template', async () => {
      const { service, sendResolved } = setup();

      const result = await service.send({ templateKey: 'sign-up', recipients: { email: EMAIL } });

      expect(result.status).toBe(NotificationStatus.ACCEPTED);
      expect(sendResolved).toHaveBeenCalledTimes(1);
    });
  });

  describe('baseline producers', () => {
    it("should name identity as the producer of every baseline template in identity's families, and memoir of memoir's", () => {
      const producerOf = (prefixes: string[]): (string | undefined)[] => [
        ...new Set(BASELINE_TEMPLATES.filter(fixture => prefixes.some(prefix => fixture.templateKey.startsWith(prefix))).map(fixture => fixture.producer)),
      ];

      expect(producerOf(['auth.', 'security.', 'user.', 'organisation-', 'bot.'])).toEqual(['identity']);
      expect(producerOf(['memoir-'])).toEqual(['memoir']);
    });
  });

  describe('render globals', () => {
    it('should strip payload keys that would override a render global', async () => {
      const { service, sendResolved } = setup();
      const payload = { name: 'Ada', brand: { name: 'Evil' }, year: 1999, supportEmail: 'help@evil.test', productUrl: 'https://evil.test', content: '<b>x</b>' };

      await service.send({ templateKey: 'sign-up', recipients: { email: EMAIL }, payload });

      expect(sendResolved.mock.calls[0]?.[1].payload).toEqual({ name: 'Ada' });
    });

    it('should keep a global-named key the template declares as its own variable', async () => {
      const { service, sendResolved } = setup();

      await service.send({ templateKey: 'year-in-review', recipients: { email: EMAIL }, payload: { year: 2025, brand: 'Evil' } });

      expect(sendResolved.mock.calls[0]?.[1].payload).toEqual({ year: 2025 });
    });
  });

  describe('audit', () => {
    it('should log one info line naming the actor, template, routing service, locale, channels, masked recipients and job ids', async () => {
      const { service } = setup();
      const info = spyOn(service['logger'], 'info');

      await service.send({
        templateKey: 'sign-up',
        recipients: { email: EMAIL, phone: PHONE },
        payload: { name: 'Ada Lovelace', brand: 'Evil' },
        service: 'identity',
        locale: 'en-GB',
      });

      expect(info).toHaveBeenCalledTimes(1);
      const [message, metadata] = info.mock.calls[0] ?? [];
      expect(message).toBe('Console notification sent');
      expect(metadata).toEqual({
        actor: ADMIN.sub,
        organisation: '7',
        templateKey: 'sign-up',
        service: 'identity',
        locale: 'en-GB',
        channels: ['EMAIL', 'SMS'],
        recipients: { email: 'j***@e***.com', phone: '***23' },
        jobIds: ['11', '12'],
        status: NotificationStatus.ACCEPTED,
        strippedPayloadKeys: ['brand'],
      });
      const line = JSON.stringify(info.mock.calls);
      expect(line).not.toContain(EMAIL);
      expect(line).not.toContain('jane');
      expect(line).not.toContain('5550123');
      expect(line).not.toContain('Ada Lovelace');
    });

    it('should still audit a send that fails after resolving, with the error code and no job ids', async () => {
      const { service, sendResolved } = setup();
      sendResolved.mockImplementationOnce(() => Promise.reject(AppErrorCode.UNKNOWN.create()));
      const info = spyOn(service['logger'], 'info');

      await refusal(service.send({ templateKey: 'sign-up', recipients: { email: EMAIL } }));

      expect(info).toHaveBeenCalledTimes(1);
      expect(info.mock.calls[0]?.[0]).toBe('Console notification send failed');
      expect(info.mock.calls[0]?.[1]).toMatchObject({ templateKey: 'sign-up', channels: ['EMAIL', 'SMS'], status: 'ERROR', errorCode: 'UNKNOWN', jobIds: [] });
    });

    it('should mask a push token down to its last two characters', async () => {
      const { service } = setup();
      const info = spyOn(service['logger'], 'info');

      await service.send({ templateKey: 'sign-up', recipients: { push: 'fcm:device-token-xy' } });

      expect(info.mock.calls[0]?.[1]).toMatchObject({ recipients: { push: '***xy' } });
    });
  });

  describe('rate limit', () => {
    it('should refuse the 21st send in ten minutes with a 429 and a Retry-After, then admit the actor once the window has passed', async () => {
      setSystemTime(new Date('2026-09-28T10:00:00Z'));
      const { service, header, sendResolved } = setup();
      for (let sent = 0; sent < 20; sent++) await service.send({ templateKey: 'sign-up', recipients: { email: EMAIL } });

      setSystemTime(new Date('2026-09-28T10:04:00Z'));
      const error = await refusal(service.send({ templateKey: 'sign-up', recipients: { email: EMAIL } }));

      expect(error.code).toBe('NTF_006');
      expect(error.status).toBe(429);
      expect(header).toHaveBeenCalledWith('retry-after', '360');
      expect(sendResolved).toHaveBeenCalledTimes(20);

      setSystemTime(new Date('2026-09-28T10:10:01Z'));
      await service.send({ templateKey: 'sign-up', recipients: { email: EMAIL } });
      expect(sendResolved).toHaveBeenCalledTimes(21);
    });

    it('should count refused templates against the limit so probing is bounded too', async () => {
      const { service } = setup();
      for (let sent = 0; sent < 20; sent++) await refusal(service.send({ templateKey: 'auth.login.otp', recipients: { email: EMAIL } }));

      expect((await refusal(service.send({ templateKey: 'sign-up', recipients: { email: EMAIL } }))).code).toBe('NTF_006');
    });

    it('should keep one actor under the limit while another is refused', async () => {
      const limiter = new ConsoleSendLimiter();
      for (let sent = 0; sent < 20; sent++) limiter.admit('a');

      expect(limiter.admit('a').admitted).toBe(false);
      expect(limiter.admit('b').admitted).toBe(true);
    });
  });
});
