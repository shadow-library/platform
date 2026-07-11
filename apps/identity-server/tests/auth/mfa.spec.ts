/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { base32Decode, base32Encode, hotp } from '@server/modules/auth/mfa';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';

import { TestEnvironment, csrfPair } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('mfa').init();

const currentStep = () => Math.floor(Date.now() / 1000 / 30);
const codeAt = (secretBase32: string, step: number) => hotp(base32Decode(secretBase32), step);

const login = (identifier: string) => env.getRouter().mockRequest().post('/api/v1/auth/login/init').body({ identifier });
const verify = (flowId: string, body: Record<string, string>) =>
  env
    .getRouter()
    .mockRequest()
    .post('/api/v1/auth/challenge/verify')
    .body({ flowId, ...body });

describe('MFA', () => {
  let userId: bigint;
  let sessionSecret: string;

  const request = (method: 'get' | 'post' | 'delete', path: string, cookie = sessionSecret) => {
    const csrf = csrfPair();
    const chain = env.getRouter().mockRequest()[method](path);
    return chain.headers({ 'x-csrf-token': csrf.header }).cookies({ [SESSION_COOKIE_NAME]: cookie, 'csrf-token': csrf.cookie });
  };

  /** Enrolls and activates TOTP over HTTP, returning the base32 seed. */
  const setupTotp = async (): Promise<string> => {
    const enroll = await request('post', '/api/v1/me/mfa/totp/enroll');
    expect(enroll.statusCode).toBe(200);
    const { secret } = enroll.json() as { secret: string };
    const activate = await request('post', '/api/v1/me/mfa/totp/activate').body({ code: codeAt(secret, currentStep()) });
    expect(activate.statusCode).toBe(200);
    return secret;
  };

  beforeEach(async () => {
    const user = await env.getService(UserService).createUserWithPassword({ email: 'mfa@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    userId = user.id;
    sessionSecret = (await env.getService(SessionService).create({ userId })).secret;
  });

  describe('totp primitives', () => {
    it('should produce the rfc 4226 reference codes', () => {
      const secret = Buffer.from('12345678901234567890', 'ascii');
      expect(hotp(secret, 0)).toBe('755224');
      expect(hotp(secret, 1)).toBe('287082');
      expect(hotp(secret, 9)).toBe('520489');
    });

    it('should round-trip base32', () => {
      const buffer = Buffer.from('shadow identity totp seed!', 'utf8');
      expect(base32Decode(base32Encode(buffer)).equals(buffer)).toBe(true);
    });
  });

  describe('enrollment', () => {
    it('should enroll and activate totp with a valid code', async () => {
      const secret = await setupTotp();
      expect(secret.length).toBeGreaterThanOrEqual(32);

      const list = await request('get', '/api/v1/me/mfa');
      expect(list.statusCode).toBe(200);
      expect(list.json()).toMatchObject({ enrollments: [{ type: 'TOTP', label: 'default' }] });
    });

    it('should reject activation with a wrong code', async () => {
      await request('post', '/api/v1/me/mfa/totp/enroll');
      const activate = await request('post', '/api/v1/me/mfa/totp/activate').body({ code: '000000' });
      expect(activate.statusCode).toBe(401);
    });

    it('should require authentication for mfa management', async () => {
      const response = await env.getRouter().mockRequest().get('/api/v1/me/mfa');
      expect(response.statusCode).toBe(401);
    });

    it('should not store the totp seed in plaintext', async () => {
      const secret = await setupTotp();
      const [enrollment] = await env.getPostgresClient().select().from(schema.mfaEnrollments).where(eq(schema.mfaEnrollments.userId, userId));
      expect(enrollment?.secretCiphertext).toBeString();
      expect(enrollment?.secretCiphertext).not.toContain(secret);
      expect(enrollment?.kekVersion).toBe(1);
    });
  });

  describe('login flow with mfa', () => {
    it('should require a totp code after the password and issue an aal2 session', async () => {
      const secret = await setupTotp();

      const { flowId } = (await login('mfa@example.com')).json() as { flowId: string };
      const password = await verify(flowId, { password: 'Password@123' });
      expect(password.statusCode).toBe(200);
      expect(password.json()).toMatchObject({ status: 'AWAITING_TOTP' });

      const done = await verify(flowId, { code: codeAt(secret, currentStep() + 1) });
      expect(done.statusCode).toBe(200);
      expect(done.json()).toMatchObject({ status: 'COMPLETED' });
      const setCookie = ([] as string[]).concat(done.headers['set-cookie'] ?? []);
      expect(setCookie.some(cookie => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))).toBe(true);

      const sessions = await env.getPostgresClient().select().from(schema.userSessions).where(eq(schema.userSessions.userId, userId));
      const mfaSession = sessions.find(session => session.aal === 'AAL2');
      expect(mfaSession).toBeDefined();
      expect(mfaSession?.elevatedUntil).not.toBeNull();
    });

    it('should reject a wrong mfa code and count the failure', async () => {
      await setupTotp();
      const { flowId } = (await login('mfa@example.com')).json() as { flowId: string };
      await verify(flowId, { password: 'Password@123' });

      const wrong = await verify(flowId, { code: '000000' });
      expect(wrong.statusCode).toBe(401);
      expect(wrong.json()).toMatchObject({ status: 'AWAITING_TOTP', attemptsLeft: 2 });

      const events = await env.getPostgresClient().select().from(schema.userSignInEvents).where(eq(schema.userSignInEvents.status, 'MFA_FAILED'));
      expect(events.length).toBe(1);
    });

    it('should reject a replayed totp code', async () => {
      const secret = await setupTotp();
      const code = codeAt(secret, currentStep() + 1);

      const first = (await login('mfa@example.com')).json() as { flowId: string };
      await verify(first.flowId, { password: 'Password@123' });
      const completed = await verify(first.flowId, { code });
      expect(completed.json()).toMatchObject({ status: 'COMPLETED' });

      const second = (await login('mfa@example.com')).json() as { flowId: string };
      await verify(second.flowId, { password: 'Password@123' });
      const replayed = await verify(second.flowId, { code });
      expect(replayed.statusCode).toBe(401);
    });

    it('should not require mfa for accounts without enrollments', async () => {
      const { flowId } = (await login('mfa@example.com')).json() as { flowId: string };
      const done = await verify(flowId, { password: 'Password@123' });
      expect(done.json()).toMatchObject({ status: 'COMPLETED' });
    });
  });

  describe('step-up and disable', () => {
    it('should elevate an aal1 session with a valid totp code', async () => {
      const secret = await setupTotp();
      const aal1 = (await env.getService(SessionService).create({ userId })).secret;

      const stepUp = await request('post', '/api/v1/me/mfa/step-up', aal1).body({ code: codeAt(secret, currentStep() + 1) });
      expect(stepUp.statusCode).toBe(200);
      expect(stepUp.json()).toMatchObject({ aal: 'AAL2' });
    });

    it('should reject step-up with an invalid code', async () => {
      await setupTotp();
      const aal1 = (await env.getService(SessionService).create({ userId })).secret;
      const stepUp = await request('post', '/api/v1/me/mfa/step-up', aal1).body({ code: '000000' });
      expect(stepUp.statusCode).toBe(401);
    });

    it('should allow disabling totp only from an elevated session', async () => {
      await setupTotp();

      const aal1 = (await env.getService(SessionService).create({ userId })).secret;
      const denied = await request('delete', '/api/v1/me/mfa/totp', aal1);
      expect(denied.statusCode).toBe(403);

      const allowed = await request('delete', '/api/v1/me/mfa/totp');
      expect(allowed.statusCode).toBe(200);

      const list = await request('get', '/api/v1/me/mfa');
      expect((list.json() as { enrollments: unknown[] }).enrollments).toHaveLength(0);
    });
  });
});
