/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

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
const env = new TestEnvironment('registration-flow').init();

const post = (path: string, body: Record<string, unknown>) => env.getRouter().mockRequest().post(`/api/v1/auth/${path}`).body(body);

const otpFor = async (email: string): Promise<string> => {
  const rows = await env.getPostgresClient().select().from(schema.notificationOutbox);
  const row = rows.find(entry => entry.recipients.email === email);
  return String((row?.payload as { code: string }).code);
};

describe('Registration flow', () => {
  it('should register a new user through every step and issue a session', async () => {
    const email = 'newbie@example.com';
    const init = await post('register/init', { email });
    expect(init.statusCode).toBe(200);
    const { flowId } = init.json() as { flowId: string };
    expect(init.json()).toMatchObject({ status: 'AWAITING_EMAIL_OTP' });

    const verified = await post('challenge/verify', { flowId, code: await otpFor(email) });
    expect(verified.statusCode).toBe(200);
    expect(verified.json()).toMatchObject({ status: 'AWAITING_DEMOGRAPHICS' });

    const demo = await post('register/demographics', { flowId, dateOfBirth: '1995-08-15', gender: 'FEMALE' });
    expect(demo.json()).toMatchObject({ status: 'AWAITING_PROFILE' });

    const profile = await post('register/profile', { flowId, firstName: 'Jane', lastName: 'Doe' });
    expect(profile.json()).toMatchObject({ status: 'AWAITING_PASSWORD_SET' });

    const done = await post('register/password', { flowId, password: 'Password@123' });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ status: 'COMPLETED' });
    const setCookie = ([] as string[]).concat(done.headers['set-cookie'] ?? []);
    expect(setCookie.some(cookie => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))).toBe(true);

    const user = await env.getService(UserService).getUser(email);
    expect(user?.status).toBe('ACTIVE');
    const emails = await env.getPostgresClient().select().from(schema.userEmails).where(eq(schema.userEmails.emailId, email));
    expect(emails[0]?.verifiedAt).not.toBeNull();
  });

  it('should reject a wrong OTP and report remaining attempts', async () => {
    const { flowId } = (await post('register/init', { email: 'wrongotp@example.com' })).json() as { flowId: string };
    const response = await post('challenge/verify', { flowId, code: '000000' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ status: 'AWAITING_EMAIL_OTP', attemptsLeft: 2 });
  });

  it('should not advance a step out of order', async () => {
    const { flowId } = (await post('register/init', { email: 'ooo@example.com' })).json() as { flowId: string };
    const response = await post('register/profile', { flowId, firstName: 'Too', lastName: 'Early' });
    expect(response.statusCode).toBe(409);
  });

  it('should stay neutral and issue no OTP for an already-registered email', async () => {
    await env.getService(UserService).createUserWithPassword({ email: 'taken@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });

    const init = await post('register/init', { email: 'taken@example.com' });
    expect(init.statusCode).toBe(200);
    expect(init.json()).toMatchObject({ status: 'AWAITING_EMAIL_OTP' });

    const outbox = await env.getPostgresClient().select().from(schema.notificationOutbox);
    expect(outbox.find(entry => entry.recipients.email === 'taken@example.com')).toBeUndefined();

    const { flowId } = init.json() as { flowId: string };
    const attempt = await post('challenge/verify', { flowId, code: '123456' });
    expect(attempt.statusCode).toBe(401);
  });
});
