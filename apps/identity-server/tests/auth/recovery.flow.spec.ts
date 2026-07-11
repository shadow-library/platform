/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('recovery-flow').init();
const EMAIL = 'recover@example.com';

const post = (path: string, body: Record<string, unknown>) => env.getRouter().mockRequest().post(`/api/v1/auth/${path}`).body(body);

const otpFor = async (email: string): Promise<string> => {
  const rows = await env.getPostgresClient().select().from(schema.notificationOutbox);
  const row = rows.find(entry => entry.recipients.email === email && entry.templateKey === 'auth.recovery.otp');
  return String((row?.payload as { code: string }).code);
};

describe('Recovery flow', () => {
  let userId: bigint;

  beforeEach(async () => {
    const user = await env.getService(UserService).createUserWithPassword({ email: EMAIL, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    userId = user.id;
  });

  it('should reset the password, revoke old sessions, and issue a new one', async () => {
    const existing = await env.getService(SessionService).create({ userId });

    const { flowId } = (await post('recover/init', { identifier: EMAIL })).json() as { flowId: string };
    const verified = await post('challenge/verify', { flowId, code: await otpFor(EMAIL) });
    expect(verified.json()).toMatchObject({ status: 'AWAITING_NEW_PASSWORD' });

    const done = await post('recover/reset', { flowId, newPassword: 'NewPassword@456' });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ status: 'COMPLETED' });
    const setCookie = ([] as string[]).concat(done.headers['set-cookie'] ?? []);
    expect(setCookie.some(cookie => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))).toBe(true);

    expect(await env.getService(SessionService).validate(existing.secret)).toBeNull();

    const newLogin = (await post('login/init', { identifier: EMAIL })).json() as { flowId: string };
    expect((await post('challenge/verify', { flowId: newLogin.flowId, password: 'NewPassword@456' })).statusCode).toBe(200);

    const oldLogin = (await post('login/init', { identifier: EMAIL })).json() as { flowId: string };
    expect((await post('challenge/verify', { flowId: oldLogin.flowId, password: 'Password@123' })).statusCode).toBe(401);
  });

  it('should reject reusing a recent password', async () => {
    const { flowId } = (await post('recover/init', { identifier: EMAIL })).json() as { flowId: string };
    await post('challenge/verify', { flowId, code: await otpFor(EMAIL) });
    const response = await post('recover/reset', { flowId, newPassword: 'Password@123' });
    expect(response.statusCode).toBe(422);
  });

  it('should stay neutral and issue no OTP for an unknown identifier', async () => {
    const init = await post('recover/init', { identifier: 'ghost@example.com' });
    expect(init.statusCode).toBe(200);
    expect(init.json()).toMatchObject({ status: 'AWAITING_EMAIL_OTP' });

    const outbox = await env.getPostgresClient().select().from(schema.notificationOutbox);
    expect(outbox.find(entry => entry.recipients.email === 'ghost@example.com')).toBeUndefined();

    const { flowId } = init.json() as { flowId: string };
    expect((await post('challenge/verify', { flowId, code: '123456' })).statusCode).toBe(401);
  });
});
