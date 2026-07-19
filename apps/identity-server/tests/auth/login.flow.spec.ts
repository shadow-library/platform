/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { SESSION_COOKIE_NAME } from '@server/modules/auth/session';
import { UserService } from '@server/modules/identity/user';

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

  it('should be indistinguishable for an unknown identifier', async () => {
    const known = await login('login@example.com');
    const unknown = await login('ghost@example.com');
    expect(unknown.statusCode).toBe(known.statusCode);
    expect(Object.keys(unknown.json() as object).sort()).toEqual(Object.keys(known.json() as object).sort());

    const { flowId } = unknown.json() as { flowId: string };
    const attempt = await verify(flowId, 'Password@123');
    expect(attempt.statusCode).toBe(401);
  });

  it('should not issue a session for a non-active account', async () => {
    await env.getService(UserService).createUserWithPassword({ email: 'suspended@example.com', password: 'Password@123', status: 'SUSPENDED', emailVerified: true });
    const { flowId } = (await login('suspended@example.com')).json() as { flowId: string };
    const response = await verify(flowId, 'Password@123');
    expect(response.statusCode).toBe(401);
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
});
