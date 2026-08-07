import { beforeEach, describe, expect, it } from 'bun:test';

import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';

import { csrfPair, TestEnvironment } from '../test-environment';

const env = new TestEnvironment('me-password').init();
const EMAIL = 'change-password@example.com';
const PASSWORD = 'Password@123';
const NEW_PASSWORD = 'NewPassword@456';

describe('MeController /me/password', () => {
  let userId: bigint;
  let sessionSecret: string;

  const changePassword = (currentPassword: string, newPassword: string, cookie = sessionSecret) => {
    const csrf = csrfPair();
    return env
      .getRouter()
      .mockRequest()
      .post('/api/v1/me/password')
      .headers({ 'x-csrf-token': csrf.header })
      .cookies({ [SESSION_COOKIE_NAME]: cookie, 'csrf-token': csrf.cookie })
      .body({ currentPassword, newPassword });
  };

  const signInWith = async (password: string): Promise<number> => {
    const init = await env.getRouter().mockRequest().post('/api/v1/auth/login/init').body({ identifier: EMAIL });
    const { flowId } = init.json() as { flowId: string };
    const verify = await env.getRouter().mockRequest().post('/api/v1/auth/challenge/verify').body({ flowId, password });
    return verify.statusCode;
  };

  const getMe = (cookie: string) =>
    env
      .getRouter()
      .mockRequest()
      .get('/api/v1/me')
      .cookies({ [SESSION_COOKIE_NAME]: cookie });

  beforeEach(async () => {
    const user = await env.getService(UserService).createUserWithPassword({ email: EMAIL, password: PASSWORD, status: 'ACTIVE', emailVerified: true });
    userId = user.id;
    sessionSecret = (await env.getService(SessionService).create({ userId })).secret;
  });

  it('should rotate the credential so the new password signs in and the old one no longer does', async () => {
    const response = await changePassword(PASSWORD, NEW_PASSWORD);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true });

    expect(await signInWith(NEW_PASSWORD)).toBe(200);
    expect(await signInWith(PASSWORD)).toBe(401);
  });

  it('should reject a wrong current password and leave the credential untouched', async () => {
    const response = await changePassword('WrongPassword@1', NEW_PASSWORD);
    expect(response.statusCode).toBe(401);
    expect(await signInWith(PASSWORD)).toBe(200);
  });

  it('should reject reusing the current password', async () => {
    const response = await changePassword(PASSWORD, PASSWORD);
    expect(response.statusCode).toBe(422);
    expect(await signInWith(PASSWORD)).toBe(200);
  });

  it('should reject a weak new password', async () => {
    const response = await changePassword(PASSWORD, 'weak');
    expect(response.statusCode).toBe(422);
    expect(await signInWith(PASSWORD)).toBe(200);
  });

  it('should sign out every other session while keeping the caller signed in', async () => {
    const otherSecret = (await env.getService(SessionService).create({ userId })).secret;
    expect((await getMe(otherSecret)).statusCode).toBe(200);

    const response = await changePassword(PASSWORD, NEW_PASSWORD);
    expect(response.statusCode).toBe(200);

    expect((await getMe(sessionSecret)).statusCode).toBe(200);
    expect((await getMe(otherSecret)).statusCode).toBe(401);
  });

  it('should notify the account owner that their password changed', async () => {
    await changePassword(PASSWORD, NEW_PASSWORD);
    const rows = await env.getPostgresClient().select().from(schema.notificationOutbox);
    expect(rows.find(row => row.templateKey === 'auth.password.changed' && row.recipients.email === EMAIL)).toBeDefined();
  });

  it('should require a valid session', async () => {
    const response = await changePassword(PASSWORD, NEW_PASSWORD, 'not-a-real-session');
    expect(response.statusCode).toBe(401);
  });
});
