/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { and, eq, isNull } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';
import { MaintenanceService } from '@server/modules/worker/maintenance.service';

import { TestEnvironment, csrfPair } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('contact').init();
const EMAIL = 'contact@example.com';

const otpFor = async (target: string, templateKey: string): Promise<string> => {
  const rows = await env.getPostgresClient().select().from(schema.notificationOutbox);
  const row = [...rows].reverse().find(entry => (entry.recipients.email === target || entry.recipients.phone === target) && entry.templateKey === templateKey);
  return String((row?.payload as { code: string }).code);
};

describe('Contact management', () => {
  let userId: bigint;
  let sessionSecret: string;

  const request = (method: 'get' | 'post' | 'delete', path: string, cookie = sessionSecret) => {
    const csrf = csrfPair();
    const chain = env.getRouter().mockRequest()[method](path);
    return chain.headers({ 'x-csrf-token': csrf.header }).cookies({ [SESSION_COOKIE_NAME]: cookie, 'csrf-token': csrf.cookie });
  };

  const addAndVerifyEmail = async (email: string): Promise<void> => {
    const add = await request('post', '/api/v1/me/emails').body({ email });
    expect(add.statusCode).toBe(200);
    const { verificationId } = add.json() as { verificationId: string };
    const code = await otpFor(email, 'user.email.verification');
    const verify = await request('post', '/api/v1/me/emails/verify').body({ verificationId, code });
    expect(verify.statusCode).toBe(200);
  };

  beforeEach(async () => {
    const user = await env.getService(UserService).createUserWithPassword({ email: EMAIL, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    userId = user.id;
    sessionSecret = (await env.getService(SessionService).create({ userId })).secret;
  });

  describe('emails', () => {
    it('should add and verify a second email usable as a login identifier', async () => {
      await addAndVerifyEmail('second@example.com');

      const list = await request('get', '/api/v1/me/emails');
      const items = (list.json() as { items: { value: string; verifiedAt?: string }[] }).items;
      expect(items).toHaveLength(2);
      expect(items.find(item => item.value === 'second@example.com')?.verifiedAt).toBeString();

      const init = await env.getRouter().mockRequest().post('/api/v1/auth/login/init').body({ identifier: 'second@example.com' });
      const { flowId } = init.json() as { flowId: string };
      const done = await env.getRouter().mockRequest().post('/api/v1/auth/challenge/verify').body({ flowId, password: 'Password@123' });
      expect(done.json()).toMatchObject({ status: 'COMPLETED' });
    });

    it('should stay neutral when the email is verified by another account', async () => {
      await env.getService(UserService).createUserWithPassword({ email: 'taken@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });

      const add = await request('post', '/api/v1/me/emails').body({ email: 'taken@example.com' });
      expect(add.statusCode).toBe(200);
      const { verificationId } = add.json() as { verificationId: string };
      expect(verificationId).toStartWith('contact_email_');

      const outbox = await env.getPostgresClient().select().from(schema.notificationOutbox);
      expect(outbox.find(entry => entry.templateKey === 'user.email.verification')).toBeUndefined();

      const verify = await request('post', '/api/v1/me/emails/verify').body({ verificationId, code: '123456' });
      expect(verify.statusCode).toBe(401);
    });

    it('should not remove the primary email but allow removing a secondary', async () => {
      await addAndVerifyEmail('second@example.com');

      const denied = await request('delete', '/api/v1/me/emails').body({ email: EMAIL });
      expect(denied.statusCode).toBe(409);

      const allowed = await request('delete', '/api/v1/me/emails').body({ email: 'second@example.com' });
      expect(allowed.statusCode).toBe(200);
      const list = await request('get', '/api/v1/me/emails');
      expect((list.json() as { items: unknown[] }).items).toHaveLength(1);
    });

    it('should switch primary only to a verified email', async () => {
      const add = await request('post', '/api/v1/me/emails').body({ email: 'unverified@example.com' });
      expect(add.statusCode).toBe(200);
      const denied = await request('post', '/api/v1/me/emails/primary').body({ email: 'unverified@example.com' });
      expect(denied.statusCode).toBe(409);

      await addAndVerifyEmail('second@example.com');
      const allowed = await request('post', '/api/v1/me/emails/primary').body({ email: 'second@example.com' });
      expect(allowed.statusCode).toBe(200);

      const list = await request('get', '/api/v1/me/emails');
      const items = (list.json() as { items: { value: string; isPrimary: boolean }[] }).items;
      expect(items.find(item => item.isPrimary)?.value).toBe('second@example.com');
    });

    it('should require authentication', async () => {
      const response = await env.getRouter().mockRequest().get('/api/v1/me/emails');
      expect(response.statusCode).toBe(401);
    });
  });

  describe('phones', () => {
    it('should add, verify, and promote a phone number', async () => {
      const add = await request('post', '/api/v1/me/phones').body({ phone: '+14155550123' });
      expect(add.statusCode).toBe(200);
      const { verificationId } = add.json() as { verificationId: string };
      const code = await otpFor('+14155550123', 'user.phone.verification');
      const verify = await request('post', '/api/v1/me/phones/verify').body({ verificationId, code });
      expect(verify.statusCode).toBe(200);

      const promote = await request('post', '/api/v1/me/phones/primary').body({ phone: '+14155550123' });
      expect(promote.statusCode).toBe(200);

      const list = await request('get', '/api/v1/me/phones');
      const items = (list.json() as { items: { value: string; isPrimary: boolean; verifiedAt?: string }[] }).items;
      expect(items).toEqual([expect.objectContaining({ value: '+14155550123', isPrimary: true })]);
    });

    it('should reject a malformed phone number', async () => {
      const add = await request('post', '/api/v1/me/phones').body({ phone: 'not-a-phone' });
      expect(add.statusCode).toBe(422);
    });
  });

  describe('maintenance', () => {
    it('should purge unverified claims older than seven days', async () => {
      await request('post', '/api/v1/me/emails').body({ email: 'stale@example.com' });
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await env
        .getPostgresClient()
        .update(schema.userEmails)
        .set({ createdAt: eightDaysAgo })
        .where(and(eq(schema.userEmails.emailId, 'stale@example.com'), isNull(schema.userEmails.verifiedAt)));

      const purged = await new MaintenanceService(env.getDatabaseService()).purgeStaleContactClaims();
      expect(purged).toBeGreaterThanOrEqual(1);

      const remaining = await env.getPostgresClient().select().from(schema.userEmails).where(eq(schema.userEmails.emailId, 'stale@example.com'));
      expect(remaining).toHaveLength(0);
    });
  });
});
