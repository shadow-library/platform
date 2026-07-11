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

describe('Login flow', () => {
  beforeEach(async () => {
    await env.getService(UserService).createUserWithPassword({ email: 'login@example.com', password: 'Password@123', status: 'ACTIVE' });
  });

  it('should complete a password login and set the session cookie', async () => {
    const init = await login('login@example.com');
    expect(init.statusCode).toBe(200);
    expect(init.json()).toMatchObject({ status: 'AWAITING_PASSWORD', hasAlternativeMethods: false });

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
    await env.getService(UserService).createUserWithPassword({ email: 'suspended@example.com', password: 'Password@123', status: 'SUSPENDED' });
    const { flowId } = (await login('suspended@example.com')).json() as { flowId: string };
    const response = await verify(flowId, 'Password@123');
    expect(response.statusCode).toBe(401);
  });
});
