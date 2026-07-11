/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { base32Decode, hotp } from '@server/modules/auth/mfa';
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
const env = new TestEnvironment('recovery-codes').init();
const EMAIL = 'codes@example.com';

const currentStep = () => Math.floor(Date.now() / 1000 / 30);
const codeAt = (secretBase32: string, step: number) => hotp(base32Decode(secretBase32), step);

const post = (path: string, body: Record<string, unknown>) => env.getRouter().mockRequest().post(`/api/v1/auth/${path}`).body(body);

const otpFor = async (email: string): Promise<string> => {
  const rows = await env.getPostgresClient().select().from(schema.notificationOutbox);
  const row = [...rows].reverse().find(entry => entry.recipients.email === email && entry.templateKey === 'auth.recovery.otp');
  return String((row?.payload as { code: string }).code);
};

describe('Recovery codes', () => {
  let userId: bigint;
  let sessionSecret: string;
  let totpSecret: string;
  let recoveryCodes: string[];

  const request = (method: 'get' | 'post' | 'delete', path: string, cookie = sessionSecret) => {
    const csrf = csrfPair();
    const chain = env.getRouter().mockRequest()[method](path);
    return chain.headers({ 'x-csrf-token': csrf.header }).cookies({ [SESSION_COOKIE_NAME]: cookie, 'csrf-token': csrf.cookie });
  };

  beforeEach(async () => {
    const user = await env.getService(UserService).createUserWithPassword({ email: EMAIL, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    userId = user.id;
    sessionSecret = (await env.getService(SessionService).create({ userId })).secret;

    const enroll = await request('post', '/api/v1/me/mfa/totp/enroll');
    totpSecret = (enroll.json() as { secret: string }).secret;
    const activate = await request('post', '/api/v1/me/mfa/totp/activate').body({ code: codeAt(totpSecret, currentStep()) });
    recoveryCodes = (activate.json() as { recoveryCodes: string[] }).recoveryCodes;
  });

  it('should issue a single-use recovery code batch on first activation', async () => {
    expect(recoveryCodes).toHaveLength(10);
    for (const code of recoveryCodes) expect(code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/);

    const stored = await env.getPostgresClient().select().from(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, userId));
    expect(stored).toHaveLength(10);
    for (const row of stored) {
      expect(row.codeHash).toStartWith('$argon2id$');
      expect(recoveryCodes).not.toContain(row.codeHash);
    }
  });

  it('should accept a recovery code at the login mfa step exactly once', async () => {
    const code = recoveryCodes[0] as string;

    const first = (await post('login/init', { identifier: EMAIL })).json() as { flowId: string };
    await post('challenge/verify', { flowId: first.flowId, password: 'Password@123' });
    const done = await post('challenge/verify', { flowId: first.flowId, recoveryCode: code });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ status: 'COMPLETED' });

    const events = await env.getPostgresClient().select().from(schema.userSignInEvents).where(eq(schema.userSignInEvents.status, 'SUCCESS'));
    expect(events.find(event => event.mfaModeUsed === 'RECOVERY_CODE')).toBeDefined();

    const outbox = await env.getPostgresClient().select().from(schema.notificationOutbox);
    expect(outbox.find(entry => entry.templateKey === 'auth.mfa.recovery-code-used')).toBeDefined();

    const second = (await post('login/init', { identifier: EMAIL })).json() as { flowId: string };
    await post('challenge/verify', { flowId: second.flowId, password: 'Password@123' });
    const replayed = await post('challenge/verify', { flowId: second.flowId, recoveryCode: code });
    expect(replayed.statusCode).toBe(401);
  });

  it('should invalidate the previous batch on regeneration', async () => {
    const regenerated = await request('post', '/api/v1/me/mfa/recovery-codes');
    expect(regenerated.statusCode).toBe(200);
    const fresh = (regenerated.json() as { recoveryCodes: string[] }).recoveryCodes;
    expect(fresh).toHaveLength(10);

    const { flowId } = (await post('login/init', { identifier: EMAIL })).json() as { flowId: string };
    await post('challenge/verify', { flowId, password: 'Password@123' });
    const stale = await post('challenge/verify', { flowId, recoveryCode: recoveryCodes[0] as string });
    expect(stale.statusCode).toBe(401);
    const done = await post('challenge/verify', { flowId, recoveryCode: fresh[0] as string });
    expect(done.json()).toMatchObject({ status: 'COMPLETED' });
  });

  it('should require elevation to regenerate codes', async () => {
    const aal1 = (await env.getService(SessionService).create({ userId })).secret;
    const denied = await request('post', '/api/v1/me/mfa/recovery-codes', aal1);
    expect(denied.statusCode).toBe(403);
  });

  describe('mfa-aware recovery', () => {
    it('should demand a second factor before password reset and honor a totp code', async () => {
      const { flowId } = (await post('recover/init', { identifier: EMAIL })).json() as { flowId: string };
      const otp = await post('challenge/verify', { flowId, code: await otpFor(EMAIL) });
      expect(otp.json()).toMatchObject({ status: 'AWAITING_TOTP' });

      const premature = await post('recover/reset', { flowId, newPassword: 'NewPassword@456' });
      expect(premature.statusCode).toBe(409);

      const mfa = await post('challenge/verify', { flowId, code: codeAt(totpSecret, currentStep() + 1) });
      expect(mfa.json()).toMatchObject({ status: 'AWAITING_NEW_PASSWORD' });

      const done = await post('recover/reset', { flowId, newPassword: 'NewPassword@456' });
      expect(done.json()).toMatchObject({ status: 'COMPLETED' });
    });

    it('should honor a recovery code as the second factor', async () => {
      const { flowId } = (await post('recover/init', { identifier: EMAIL })).json() as { flowId: string };
      await post('challenge/verify', { flowId, code: await otpFor(EMAIL) });

      const mfa = await post('challenge/verify', { flowId, recoveryCode: recoveryCodes[1] as string });
      expect(mfa.json()).toMatchObject({ status: 'AWAITING_NEW_PASSWORD' });

      const done = await post('recover/reset', { flowId, newPassword: 'NewPassword@789' });
      expect(done.json()).toMatchObject({ status: 'COMPLETED' });
    });

    it('should reject an invalid second factor during recovery', async () => {
      const { flowId } = (await post('recover/init', { identifier: EMAIL })).json() as { flowId: string };
      await post('challenge/verify', { flowId, code: await otpFor(EMAIL) });

      const wrong = await post('challenge/verify', { flowId, recoveryCode: 'AAAAA-AAAAA' });
      expect(wrong.statusCode).toBe(401);
      expect(wrong.json()).toMatchObject({ status: 'AWAITING_TOTP', attemptsLeft: 2 });
    });
  });
});
