/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { SESSION_COOKIE_NAME } from '@server/modules/auth/session';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('login-flow').init();

const login = (identifier: string) => env.getRouter().mockRequest().post('/api/v1/auth/login/init').body({ identifier });
const verify = (flowId: string, password: string) => env.getRouter().mockRequest().post('/api/v1/auth/challenge/verify').body({ flowId, password });
const resetPassword = (flowId: string, currentPassword: string, newPassword: string) =>
  env.getRouter().mockRequest().post('/api/v1/auth/login/reset-password').body({ flowId, currentPassword, newPassword });
const changeMethod = (flowId: string, method: string) => env.getRouter().mockRequest().post('/api/v1/auth/challenge/change').body({ flowId, method });
const verifyOtp = (flowId: string, code: string) => env.getRouter().mockRequest().post('/api/v1/auth/challenge/verify').body({ flowId, code });

const lockAccount = async (email: string, lockMode: 'FULL' | 'OTP_ONLY', lockedUntil: Date | null): Promise<void> => {
  const user = await env.getService(UserService).getUser(email);
  if (!user) throw new Error(`account ${email} missing`);
  await env.getPostgresClient().update(schema.users).set({ lockMode, lockedUntil }).where(eq(schema.users.id, user.id));
};

const otpFor = async (email: string): Promise<string> => {
  const rows = await env.getPostgresClient().select().from(schema.notificationOutbox);
  const row = rows.filter(entry => entry.recipients.email === email).pop();
  return String((row?.payload as { code: string }).code);
};

describe('Login flow', () => {
  beforeEach(async () => {
    await env.getService(UserService).createUserWithPassword({ email: 'login@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
  });

  it('should complete a password login and set the session cookie', async () => {
    const init = await login('login@example.com');
    expect(init.statusCode).toBe(200);
    expect(init.json()).toMatchObject({ status: 'AWAITING_PASSWORD', hasAlternativeMethods: true });

    const { flowId } = init.json() as { flowId: string };
    const done = await verify(flowId, 'Password@123');
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ status: 'COMPLETED' });

    const setCookie = ([] as string[]).concat(done.headers['set-cookie'] ?? []);
    expect(setCookie.some(cookie => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))).toBe(true);
    expect(setCookie.some(cookie => cookie.includes('HttpOnly') && cookie.includes(SESSION_COOKIE_NAME))).toBe(true);
  });

  it('should reject a wrong password and report remaining attempts', async () => {
    const { flowId } = (await login('login@example.com')).json() as { flowId: string };
    const response = await verify(flowId, 'WrongPassword@1');
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ status: 'AWAITING_PASSWORD', attemptsLeft: 2 });
  });

  it('should terminate the flow after three failed attempts', async () => {
    const { flowId } = (await login('login@example.com')).json() as { flowId: string };
    await verify(flowId, 'WrongPassword@1');
    await verify(flowId, 'WrongPassword@2');
    const third = await verify(flowId, 'WrongPassword@3');
    expect(third.statusCode).toBe(410);

    const afterTermination = await verify(flowId, 'Password@123');
    expect(afterTermination.statusCode).toBe(410);
  });

  it('should reject a malformed identifier before creating a flow', async () => {
    for (const identifier of ['not-an-email@', 'john@doe', 'a@@b.com', 'has space@example.com', '+0123', '']) {
      const response = await login(identifier);
      expect(response.statusCode).toBe(422);
      expect(response.json()).not.toHaveProperty('flowId');
      /** The message has to read as guidance — a `pattern` without an `errorMessage` answers with the raw regex instead. */
      expect(response.json()).toMatchObject({ fields: [{ field: 'body.identifier', msg: 'must be a valid email address, phone number, or username' }] });
    }
  });

  it('should accept a well-formed phone or username that resolves to an account', async () => {
    await env.getService(UserService).createUserWithPassword({ email: 'shapes@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true, username: 'johndoe' });
    expect((await login('johndoe')).statusCode).toBe(200);
    expect((await login('+14155550123')).statusCode).toBe(404);
  });

  /** D-12 was retired deliberately: the identifier step is now an account-existence oracle, contained by the Tier-2 rate limit. */
  it('should report an unknown identifier at the identifier step', async () => {
    const response = await login('ghost@example.com');
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'AUTH_008' });
    expect(response.json()).not.toHaveProperty('flowId');
  });

  it('should name the account state at the identifier step instead of advancing', async () => {
    const cases = [
      { email: 'blocked@example.com', status: 'BLOCKED' as const, code: 'AUTH_009' },
      { email: 'suspended@example.com', status: 'SUSPENDED' as const, code: 'AUTH_010' },
      { email: 'disabled@example.com', status: 'DISABLED' as const, code: 'AUTH_011' },
    ];
    for (const { email, status, code } of cases) {
      await env.getService(UserService).createUserWithPassword({ email, password: 'Password@123', status, emailVerified: true });
      const response = await login(email);
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code });
      expect(response.json()).not.toHaveProperty('flowId');
    }
  });

  it('should let a lapsed suspension sign in again and clear the hold', async () => {
    const userService = env.getService(UserService);
    const user = await userService.createUserWithPassword({ email: 'lapsed@example.com', password: 'Password@123', status: 'SUSPENDED', emailVerified: true });
    await userService.setStatusHold(user.id, 'SUSPENDED', { reason: 'billing', until: new Date(Date.now() - 60_000) });

    const { flowId } = (await login('lapsed@example.com')).json() as { flowId: string };
    expect((await verify(flowId, 'Password@123')).json()).toMatchObject({ status: 'COMPLETED' });
    expect((await userService.getUser('lapsed@example.com'))?.status).toBe('ACTIVE');
  });

  it('should replace an admin-forced password inline and complete the sign-in', async () => {
    await env
      .getService(UserService)
      .createUserWithPassword({ email: 'reset@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true, passwordResetRequired: true });

    const { flowId } = (await login('reset@example.com')).json() as { flowId: string };
    const gate = await verify(flowId, 'Password@123');
    expect(gate.statusCode).toBe(200);
    expect(gate.json()).toMatchObject({ status: 'AWAITING_PASSWORD_RESET' });

    const reset = await resetPassword(flowId, 'Password@123', 'NewPassword@456');
    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toMatchObject({ status: 'COMPLETED' });
    const setCookie = ([] as string[]).concat(reset.headers['set-cookie'] ?? []);
    expect(setCookie.some(cookie => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))).toBe(true);

    /** The flag is cleared, so the new password signs in cleanly on the next attempt. */
    const { flowId: nextFlow } = (await login('reset@example.com')).json() as { flowId: string };
    const again = await verify(nextFlow, 'NewPassword@456');
    expect(again.json()).toMatchObject({ status: 'COMPLETED' });
  });

  it('should reject a wrong current password at the forced-reset step and report remaining attempts', async () => {
    await env
      .getService(UserService)
      .createUserWithPassword({ email: 'reset2@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true, passwordResetRequired: true });

    const { flowId } = (await login('reset2@example.com')).json() as { flowId: string };
    await verify(flowId, 'Password@123');
    const reset = await resetPassword(flowId, 'WrongPassword@1', 'NewPassword@456');
    expect(reset.statusCode).toBe(401);
    expect(reset.json()).toMatchObject({ status: 'AWAITING_PASSWORD_RESET', attemptsLeft: 2 });
  });

  describe('full lock', () => {
    it('should refuse a password login at the identifier step while fully locked', async () => {
      await lockAccount('login@example.com', 'FULL', new Date(Date.now() + 60_000));

      const response = await login('login@example.com');
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'AUTH_012' });
      expect(response.json()).not.toHaveProperty('flowId');
    });

    /** A lock that lands mid-flow must still deny the session, proving the completion backstop enforces every method. */
    it('should refuse an otp login caught by a lock mid-flow and mint no session', async () => {
      const { flowId } = (await login('login@example.com')).json() as { flowId: string };
      expect((await changeMethod(flowId, 'EMAIL_OTP')).statusCode).toBe(200);
      const code = await otpFor('login@example.com');

      await lockAccount('login@example.com', 'FULL', new Date(Date.now() + 60_000));
      const response = await verifyOtp(flowId, code);
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'AUTH_012' });
      const setCookie = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
      expect(setCookie.some(cookie => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))).toBe(false);
    });

    it('should let a fully locked account sign in once the lock has expired', async () => {
      await lockAccount('login@example.com', 'FULL', new Date(Date.now() - 60_000));

      const init = await login('login@example.com');
      expect(init.statusCode).toBe(200);
      const { flowId } = init.json() as { flowId: string };
      expect((await verify(flowId, 'Password@123')).json()).toMatchObject({ status: 'COMPLETED' });
    });

    it('should leave an otp_only lock unchanged — password refused, otp still completes', async () => {
      await lockAccount('login@example.com', 'OTP_ONLY', new Date(Date.now() + 60_000));

      const init = await login('login@example.com');
      expect(init.statusCode).toBe(200);
      expect(init.json()).not.toMatchObject({ code: 'AUTH_012' });

      const { flowId } = init.json() as { flowId: string };
      expect((await verify(flowId, 'Password@123')).statusCode).toBe(401);

      const { flowId: otpFlow } = (await login('login@example.com')).json() as { flowId: string };
      await changeMethod(otpFlow, 'EMAIL_OTP');
      const done = await verifyOtp(otpFlow, await otpFor('login@example.com'));
      expect(done.statusCode).toBe(200);
      expect(done.json()).toMatchObject({ status: 'COMPLETED' });
    });
  });
});
