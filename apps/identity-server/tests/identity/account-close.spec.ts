import { beforeEach, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';

import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';

import { csrfPair, TestEnvironment } from '../test-environment';

const env = new TestEnvironment('account-close').init();
const EMAIL = 'close-me@example.com';
const PASSWORD = 'Password@123';

describe('MeController /me DELETE — self-service account close', () => {
  let userId: bigint;

  const closeAccount = (cookie: string) => {
    const csrf = csrfPair();
    return env
      .getRouter()
      .mockRequest()
      .delete('/api/v1/me')
      .headers({ 'x-csrf-token': csrf.header })
      .cookies({ [SESSION_COOKIE_NAME]: cookie, 'csrf-token': csrf.cookie });
  };

  beforeEach(async () => {
    const user = await env
      .getService(UserService)
      .createUserWithPassword({ email: EMAIL, password: PASSWORD, status: 'ACTIVE', emailVerified: true, firstName: 'Close', lastName: 'Me' });
    userId = user.id;
  });

  it('should anonymise the account, mark it CLOSED, and revoke every session on an elevated request', async () => {
    const { secret: elevatedSecret } = await env.getService(SessionService).create({ userId, aal: 'AAL2' });
    const { secret: otherSecret } = await env.getService(SessionService).create({ userId });

    const response = await closeAccount(elevatedSecret);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true });

    const [row] = await env.getPostgresClient().select().from(schema.users).where(eq(schema.users.id, userId));
    expect(row).toMatchObject({ status: 'CLOSED', lockMode: 'FULL', username: null });

    const [profile] = await env.getPostgresClient().select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, userId));
    expect(profile).toMatchObject({ firstName: null, lastName: null, displayName: null });

    const emails = await env.getPostgresClient().select().from(schema.userEmails).where(eq(schema.userEmails.userId, userId));
    expect(emails).toHaveLength(0);

    expect(await env.getService(SessionService).validate(elevatedSecret)).toBeNull();
    expect(await env.getService(SessionService).validate(otherSecret)).toBeNull();
  });

  it('should require step-up and refuse a non-elevated session', async () => {
    const { secret } = await env.getService(SessionService).create({ userId, aal: 'AAL1' });
    const response = await closeAccount(secret);
    expect(response.statusCode).toBe(403);
    expect(JSON.stringify(response.json())).toContain('AUTH_006');

    const [row] = await env.getPostgresClient().select().from(schema.users).where(eq(schema.users.id, userId));
    expect(row?.status).toBe('ACTIVE');
  });

  it('should be idempotent when the account is already closed', async () => {
    const { secret: first } = await env.getService(SessionService).create({ userId, aal: 'AAL2' });
    const firstResponse = await closeAccount(first);
    expect(firstResponse.statusCode).toBe(200);

    const { secret: second } = await env.getService(SessionService).create({ userId, aal: 'AAL2' });
    const secondResponse = await closeAccount(second);
    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.json()).toMatchObject({ success: true });

    const [row] = await env.getPostgresClient().select().from(schema.users).where(eq(schema.users.id, userId));
    expect(row?.status).toBe('CLOSED');
  });

  it('should reject the closing session and every other pre-existing session on subsequent requests', async () => {
    const { secret: elevatedSecret } = await env.getService(SessionService).create({ userId, aal: 'AAL2' });
    const { secret: otherSecret } = await env.getService(SessionService).create({ userId });
    await closeAccount(elevatedSecret);

    const closingSessionReuse = await env
      .getRouter()
      .mockRequest()
      .get('/api/v1/me')
      .cookies({ [SESSION_COOKIE_NAME]: elevatedSecret });
    expect(closingSessionReuse.statusCode).toBe(401);

    const otherSessionReuse = await env
      .getRouter()
      .mockRequest()
      .get('/api/v1/me')
      .cookies({ [SESSION_COOKIE_NAME]: otherSecret });
    expect(otherSessionReuse.statusCode).toBe(401);

    expect(await env.getService(SessionService).validate(elevatedSecret)).toBeNull();
    expect(await env.getService(SessionService).validate(otherSecret)).toBeNull();
  });

  it('should require an authenticated session', async () => {
    const response = await closeAccount('not-a-real-session');
    expect(response.statusCode).toBe(401);
  });
});
