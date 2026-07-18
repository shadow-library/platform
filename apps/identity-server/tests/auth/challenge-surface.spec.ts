/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AuthFlowService } from '@server/modules/auth/flow';
import { base32Decode, hotp, MfaService } from '@server/modules/auth/mfa';
import { SESSION_COOKIE_NAME } from '@server/modules/auth/session';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';

import { csrfPair, TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

interface FlowResponse {
  flowId: string;
  status: string;
  resendsLeft?: number;
  metadata?: { maskedEmail?: string };
}

/**
 * Declaring the constants
 */
const env = new TestEnvironment('challenge_surface').init();
const EMAIL = 'surface@example.com';
const PASSWORD = 'Password@123';

const post = (path: string, body: Record<string, unknown>) => env.getRouter().mockRequest().post(`/api/v1/auth/${path}`).body(body);

const otpFor = async (email: string): Promise<string> => {
  const rows = await env.getPostgresClient().select().from(schema.notificationOutbox);
  const row = rows.filter(entry => entry.recipients.email === email).pop();
  return String((row?.payload as { code: string }).code);
};

const outboxCountFor = async (email: string): Promise<number> => {
  const rows = await env.getPostgresClient().select().from(schema.notificationOutbox);
  return rows.filter(entry => entry.recipients.email === email).length;
};

/** Rewinds the flow's cooldown clock so resends are immediately permitted. */
const expireCooldown = async (flowId: string): Promise<void> => {
  const flowService = env.getService(AuthFlowService);
  const flow = await flowService.get(flowId);
  if (flow) await flowService.update(flow, { lastOtpSentAt: Date.now() - 61_000 });
};

describe('Challenge surface', () => {
  let userId: bigint;

  beforeEach(async () => {
    const user = await env.getService(UserService).createUserWithPassword({ email: EMAIL, password: PASSWORD, status: 'ACTIVE', emailVerified: true });
    userId = user.id;
  });

  const initLogin = async (identifier: string): Promise<string> => {
    const response = await post('login/init', { identifier });
    expect(response.statusCode).toBe(200);
    return (response.json() as FlowResponse).flowId;
  };

  describe('methods', () => {
    it('should advertise identical methods for known and unknown identifiers', async () => {
      const knownFlow = await initLogin(EMAIL);
      const unknownFlow = await initLogin('ghost@example.com');

      const known = await env.getRouter().mockRequest().get(`/api/v1/auth/challenge/methods?flowId=${knownFlow}`);
      const unknown = await env.getRouter().mockRequest().get(`/api/v1/auth/challenge/methods?flowId=${unknownFlow}`);
      expect(known.statusCode).toBe(200);

      const knownMethods = (known.json() as { methods: { name: string }[] }).methods.map(method => method.name);
      const unknownMethods = (unknown.json() as { methods: { name: string }[] }).methods.map(method => method.name);
      expect(knownMethods).toEqual(['PASSWORD', 'WEBAUTHN', 'EMAIL_OTP']);
      expect(unknownMethods).toEqual(knownMethods);
    });
  });

  describe('change + otp login', () => {
    it('should switch to email otp and complete the login', async () => {
      const flowId = await initLogin(EMAIL);
      const change = await post('challenge/change', { flowId, method: 'EMAIL_OTP' });
      expect(change.statusCode).toBe(200);
      expect(change.json()).toMatchObject({ status: 'AWAITING_EMAIL_OTP', resendsLeft: 3, metadata: { maskedEmail: expect.stringContaining('@') } });

      const verified = await post('challenge/verify', { flowId, code: await otpFor(EMAIL) });
      expect(verified.statusCode).toBe(200);
      expect(verified.json()).toMatchObject({ status: 'COMPLETED' });
      const setCookie = ([] as string[]).concat(verified.headers['set-cookie'] ?? []);
      expect(setCookie.some(cookie => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))).toBe(true);
    });

    it('should respond identically for unknown identifiers without delivering a code', async () => {
      const flowId = await initLogin('ghost@example.com');
      const change = await post('challenge/change', { flowId, method: 'EMAIL_OTP' });
      expect(change.statusCode).toBe(200);
      expect(change.json()).toMatchObject({ status: 'AWAITING_EMAIL_OTP', resendsLeft: 3 });
      expect(await outboxCountFor('ghost@example.com')).toBe(0);

      const attempt = await post('challenge/verify', { flowId, code: '123456' });
      expect(attempt.statusCode).toBe(401);
    });

    it('should still demand the second factor after an otp first factor', async () => {
      const enrollment = await env.getService(MfaService).enrollTotp(userId);
      const step = Math.floor(Date.now() / 30_000);
      await env.getService(MfaService).activateTotp(userId, hotp(base32Decode(enrollment.secret), step));

      const flowId = await initLogin(EMAIL);
      await post('challenge/change', { flowId, method: 'EMAIL_OTP' });
      const verified = await post('challenge/verify', { flowId, code: await otpFor(EMAIL) });
      expect(verified.statusCode).toBe(200);
      expect(verified.json()).toMatchObject({ status: 'AWAITING_TOTP' });
    });
  });

  describe('resend', () => {
    it('should resend within budget and enforce the cooldown', async () => {
      const flowId = await initLogin(EMAIL);
      await post('challenge/change', { flowId, method: 'EMAIL_OTP' });
      expect(await outboxCountFor(EMAIL)).toBe(1);

      await expireCooldown(flowId);
      const resent = await post('challenge/resend', { flowId, method: 'EMAIL_OTP' });
      expect(resent.statusCode).toBe(200);
      expect(resent.json()).toMatchObject({ status: 'SENT', resendsLeft: 2 });
      expect(await outboxCountFor(EMAIL)).toBe(2);

      const tooSoon = await post('challenge/resend', { flowId, method: 'EMAIL_OTP' });
      expect(tooSoon.statusCode).toBe(429);
      expect(tooSoon.json()).toMatchObject({ status: 'LIMITED' });
      expect(Number(tooSoon.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('should refuse once the per-flow budget is exhausted', async () => {
      const flowId = await initLogin(EMAIL);
      await post('challenge/change', { flowId, method: 'EMAIL_OTP' });

      const flowService = env.getService(AuthFlowService);
      const flow = await flowService.get(flowId);
      if (!flow) throw new Error('flow missing');
      await flowService.update(flow, { resendsLeft: 0, lastOtpSentAt: Date.now() - 61_000 });

      const refused = await post('challenge/resend', { flowId, method: 'EMAIL_OTP' });
      expect(refused.statusCode).toBe(429);
      expect(refused.json()).toMatchObject({ status: 'LIMITED' });
    });

    it('should support registration flows', async () => {
      const init = await post('register/init', { email: 'newcomer@example.com' });
      expect(init.json()).toMatchObject({ status: 'AWAITING_EMAIL_OTP', resendsLeft: 3, metadata: { maskedEmail: expect.stringContaining('@') } });

      const { flowId } = init.json() as FlowResponse;
      await expireCooldown(flowId);
      const resent = await post('challenge/resend', { flowId, method: 'EMAIL_OTP' });
      expect(resent.statusCode).toBe(200);
      expect(await outboxCountFor('newcomer@example.com')).toBe(2);
    });
  });

  describe('session termination', () => {
    const login = async (): Promise<string> => {
      const flowId = await initLogin(EMAIL);
      const done = await post('challenge/verify', { flowId, password: PASSWORD });
      const setCookie = ([] as string[]).concat(done.headers['set-cookie'] ?? []);
      const sessionCookie = setCookie.find(cookie => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
      if (!sessionCookie) throw new Error('session cookie missing');
      return decodeURIComponent(sessionCookie.split(';')[0]?.split('=').slice(1).join('=') ?? '');
    };

    it('should sign out, clear cookies, and invalidate the session', async () => {
      const secret = await login();
      const csrf = csrfPair();
      const signout = await env
        .getRouter()
        .mockRequest()
        .post('/api/v1/auth/signout')
        .headers({ 'x-csrf-token': csrf.header })
        .cookies({ [SESSION_COOKIE_NAME]: secret, 'csrf-token': csrf.cookie });
      expect(signout.statusCode).toBe(204);

      const setCookie = ([] as string[]).concat(signout.headers['set-cookie'] ?? []);
      const cleared = setCookie.find(cookie => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
      expect(cleared).toContain('Max-Age=0');

      const followUp = await env
        .getRouter()
        .mockRequest()
        .get('/api/v1/me/mfa')
        .cookies({ [SESSION_COOKIE_NAME]: secret });
      expect(followUp.statusCode).toBe(401);
    });

    it('should cancel a flow so later steps report it gone', async () => {
      const flowId = await initLogin(EMAIL);
      const cancel = await post('cancel', { flowId });
      expect(cancel.statusCode).toBe(204);

      const attempt = await post('challenge/verify', { flowId, password: PASSWORD });
      expect(attempt.statusCode).toBe(410);
    });
  });

  describe('tier-4 lock', () => {
    it('should refuse passwords but allow otp login while locked to otp-only', async () => {
      await env
        .getPostgresClient()
        .update(schema.users)
        .set({ lockMode: 'OTP_ONLY', lockedUntil: new Date(Date.now() + 60_000) })
        .where(eq(schema.users.id, userId));

      const passwordFlow = await initLogin(EMAIL);
      const refused = await post('challenge/verify', { flowId: passwordFlow, password: PASSWORD });
      expect(refused.statusCode).toBe(401);

      const otpFlow = await initLogin(EMAIL);
      await post('challenge/change', { flowId: otpFlow, method: 'EMAIL_OTP' });
      const verified = await post('challenge/verify', { flowId: otpFlow, code: await otpFor(EMAIL) });
      expect(verified.statusCode).toBe(200);
      expect(verified.json()).toMatchObject({ status: 'COMPLETED' });
    });
  });
});
