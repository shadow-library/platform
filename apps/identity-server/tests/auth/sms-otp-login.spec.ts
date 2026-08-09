import { beforeEach, describe, expect, it } from 'bun:test';

import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';
import { AuthModeService } from '@server/modules/system/auth-mode';

import { TestEnvironment } from '../test-environment';

const env = new TestEnvironment('sms-otp-login').init();

const EMAIL = 'mobile@example.com';
const PHONE = '+14155550123';
const ACTOR = 1n;

const login = (identifier: string) => env.getRouter().mockRequest().post('/api/v1/auth/login/init').body({ identifier });
const verifyOtp = (flowId: string, code: string) => env.getRouter().mockRequest().post('/api/v1/auth/challenge/verify').body({ flowId, code });
const listMethods = (flowId: string) => env.getRouter().mockRequest().get('/api/v1/auth/challenge/methods').query({ flowId });
const changeMethod = (flowId: string, method: string) => env.getRouter().mockRequest().post('/api/v1/auth/challenge/change').body({ flowId, method });

const smsCodeFor = async (phone: string): Promise<string> => {
  const rows = await env.getPostgresClient().select().from(schema.notificationOutbox);
  const row = rows.filter(entry => entry.recipients.phone === phone).pop();
  return String((row?.payload as { code: string }).code);
};

describe('Mobile number sign-in', () => {
  beforeEach(async () => {
    /** The harness recreates Postgres per test but not Redis, so the cached mode map has to be dropped alongside it. */
    await env.getService(AuthModeService).invalidate();
    const user = await env.getService(UserService).createUserWithPassword({ email: EMAIL, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    await env.getPostgresClient().insert(schema.userPhones).values({ userId: user.id, phoneNumber: PHONE, isPrimary: true, verifiedAt: new Date() });
  });

  describe('POST /api/v1/auth/login/init', () => {
    it('should keep asking for a password when the mobile mode is off', async () => {
      const response = await login(PHONE);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: 'AWAITING_PASSWORD' });
      expect(await env.getPostgresClient().select().from(schema.verificationChallenges)).toHaveLength(0);
    });

    it('should challenge a phone identifier with a texted code once the mobile mode is on', async () => {
      await env.getService(AuthModeService).setEnabled('SMS_OTP', true, ACTOR);

      const response = await login(PHONE);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: 'AWAITING_SMS_OTP' });
      const challenges = await env.getPostgresClient().select().from(schema.verificationChallenges);
      expect(challenges).toHaveLength(1);
      expect(challenges[0]).toMatchObject({ type: 'SMS_OTP', target: PHONE });
    });

    it('should complete a sign-in with the texted code', async () => {
      await env.getService(AuthModeService).setEnabled('SMS_OTP', true, ACTOR);
      const { flowId } = (await login(PHONE)).json() as { flowId: string };

      const response = await verifyOtp(flowId, await smsCodeFor(PHONE));

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: 'COMPLETED' });
    });

    it('should leave an email identifier on the password step', async () => {
      await env.getService(AuthModeService).setEnabled('SMS_OTP', true, ACTOR);

      const response = await login(EMAIL);

      expect(response.json()).toMatchObject({ status: 'AWAITING_PASSWORD' });
    });
  });

  describe('challenge methods', () => {
    it('should hide the texted-code method while the mobile mode is off', async () => {
      const { flowId } = (await login(PHONE)).json() as { flowId: string };

      const response = await listMethods(flowId);

      expect(response.json().methods.map((method: { name: string }) => method.name)).toStrictEqual(['PASSWORD', 'WEBAUTHN']);
    });

    it('should offer the texted-code method once the mobile mode is on', async () => {
      await env.getService(AuthModeService).setEnabled('SMS_OTP', true, ACTOR);
      const { flowId } = (await login(EMAIL)).json() as { flowId: string };
      await changeMethod(flowId, 'PASSWORD');

      const phoneFlow = (await login(PHONE)).json() as { flowId: string };
      const response = await listMethods(phoneFlow.flowId);

      expect(response.json().methods.map((method: { name: string }) => method.name)).toContain('SMS_OTP');
    });

    it('should refuse a switch to the texted-code method while the mobile mode is off', async () => {
      const { flowId } = (await login(PHONE)).json() as { flowId: string };

      const response = await changeMethod(flowId, 'SMS_OTP');

      expect(response.statusCode).toBe(409);
    });
  });
});
