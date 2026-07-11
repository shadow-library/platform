/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';

import { TestEnvironment, csrfPair } from '../test-environment';
import { WebauthnEmulator } from './webauthn-emulator';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('webauthn').init();
const EMAIL = 'passkey@example.com';
const RP_ID = 'localhost';
const ORIGIN = 'http://localhost:8080';

const post = (path: string, body: Record<string, unknown>) => env.getRouter().mockRequest().post(`/api/v1/auth/${path}`).body(body);

describe('WebAuthn passkeys', () => {
  let userId: bigint;
  let sessionSecret: string;
  let emulator: WebauthnEmulator;

  const request = (method: 'get' | 'post' | 'delete', path: string, cookie = sessionSecret) => {
    const csrf = csrfPair();
    const chain = env.getRouter().mockRequest()[method](path);
    return chain.headers({ 'x-csrf-token': csrf.header }).cookies({ [SESSION_COOKIE_NAME]: cookie, 'csrf-token': csrf.cookie });
  };

  /** Runs the full registration ceremony over HTTP and returns the verify response body. */
  const registerPasskey = async (cookie = sessionSecret, authenticator = emulator): Promise<Record<string, unknown>> => {
    const options = await request('post', '/api/v1/me/webauthn/register/options', cookie);
    expect(options.statusCode).toBe(200);
    const { challenge } = options.json() as { challenge: string };
    const attestation = await authenticator.register({ challenge });
    const verify = await request('post', '/api/v1/me/webauthn/register/verify', cookie).body({ ...attestation, label: 'test key' });
    expect(verify.statusCode).toBe(200);
    return verify.json() as Record<string, unknown>;
  };

  const loginToMfaStep = async (): Promise<string> => {
    const { flowId } = (await post('login/init', { identifier: EMAIL })).json() as { flowId: string };
    const password = await post('challenge/verify', { flowId, password: 'Password@123' });
    expect(password.json()).toMatchObject({ status: 'AWAITING_MFA_WEBAUTHN' });
    return flowId;
  };

  beforeEach(async () => {
    const user = await env.getService(UserService).createUserWithPassword({ email: EMAIL, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    userId = user.id;
    sessionSecret = (await env.getService(SessionService).create({ userId })).secret;
    emulator = await new WebauthnEmulator(RP_ID, ORIGIN).init();
  });

  describe('registration', () => {
    it('should register a passkey and issue first-factor recovery codes', async () => {
      const result = await registerPasskey();
      expect(result.success).toBe(true);
      expect(result.recoveryCodes).toHaveLength(10);

      const [credential] = await env.getPostgresClient().select().from(schema.webauthnCredentials).where(eq(schema.webauthnCredentials.userId, userId));
      expect(credential).toMatchObject({ credentialId: emulator.credentialIdB64, label: 'test key', backupEligible: false });

      const list = await request('get', '/api/v1/me/mfa');
      expect((list.json() as { enrollments: { type: string }[] }).enrollments).toContainEqual(expect.objectContaining({ type: 'WEBAUTHN', label: 'test key' }));
    });

    it('should reject a registration response with a tampered challenge', async () => {
      await request('post', '/api/v1/me/webauthn/register/options');
      const attestation = await emulator.register({ challenge: 'forged-challenge' });
      const verify = await request('post', '/api/v1/me/webauthn/register/verify').body({ ...attestation });
      expect(verify.statusCode).toBe(401);
    });
  });

  describe('login as second factor', () => {
    it('should demand and verify a passkey assertion after the password', async () => {
      await registerPasskey();
      const flowId = await loginToMfaStep();

      const options = await post('webauthn/options', { flowId });
      expect(options.statusCode).toBe(200);
      const challenge = (options.json() as { options: { challenge: string } }).options.challenge;

      const assertion = await emulator.authenticate({ challenge });
      const done = await post('challenge/verify', { flowId, webauthn: assertion });
      expect(done.statusCode).toBe(200);
      expect(done.json()).toMatchObject({ status: 'COMPLETED' });

      const sessions = await env.getPostgresClient().select().from(schema.userSessions).where(eq(schema.userSessions.userId, userId));
      expect(sessions.find(session => session.aal === 'AAL2')).toBeDefined();

      const events = await env.getPostgresClient().select().from(schema.userSignInEvents).where(eq(schema.userSignInEvents.status, 'SUCCESS'));
      expect(events.find(event => event.mfaModeUsed === 'WEBAUTHN')).toBeDefined();
    });

    it("should reject another user's passkey at the mfa step", async () => {
      await registerPasskey();

      const other = await env.getService(UserService).createUserWithPassword({ email: 'other@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
      const otherSession = (await env.getService(SessionService).create({ userId: other.id })).secret;
      const otherEmulator = await new WebauthnEmulator(RP_ID, ORIGIN).init();
      await registerPasskey(otherSession, otherEmulator);

      const flowId = await loginToMfaStep();
      const challenge = ((await post('webauthn/options', { flowId })).json() as { options: { challenge: string } }).options.challenge;
      const assertion = await otherEmulator.authenticate({ challenge });
      const rejected = await post('challenge/verify', { flowId, webauthn: assertion });
      expect(rejected.statusCode).toBe(401);
    });

    it('should detect a signature counter regression and audit it', async () => {
      await registerPasskey();
      const first = await loginToMfaStep();
      const firstChallenge = ((await post('webauthn/options', { flowId: first })).json() as { options: { challenge: string } }).options.challenge;
      await post('challenge/verify', { flowId: first, webauthn: await emulator.authenticate({ challenge: firstChallenge }, { counter: 10 }) });

      const second = await loginToMfaStep();
      const secondChallenge = ((await post('webauthn/options', { flowId: second })).json() as { options: { challenge: string } }).options.challenge;
      const regressed = await post('challenge/verify', { flowId: second, webauthn: await emulator.authenticate({ challenge: secondChallenge }, { counter: 3 }) });
      expect(regressed.statusCode).toBe(401);

      const audits = await env.getPostgresClient().select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'security.webauthn.counter_regression'));
      expect(audits.length).toBe(1);
    });
  });

  describe('usernameless first factor', () => {
    it('should complete a discoverable-credential login at aal2', async () => {
      await registerPasskey();

      const options = await post('webauthn/options', {});
      expect(options.statusCode).toBe(200);
      const { flowId, options: publicKey } = options.json() as { flowId: string; options: { challenge: string; allowCredentials?: unknown[] } };
      expect(publicKey.allowCredentials ?? []).toHaveLength(0);

      const assertion = await emulator.authenticate({ challenge: publicKey.challenge }, { userHandle: Buffer.from(userId.toString()).toString('base64url') });
      const done = await post('challenge/verify', { flowId, webauthn: assertion });
      expect(done.statusCode).toBe(200);
      expect(done.json()).toMatchObject({ status: 'COMPLETED' });

      const events = await env.getPostgresClient().select().from(schema.userSignInEvents).where(eq(schema.userSignInEvents.status, 'SUCCESS'));
      expect(events.find(event => event.authModeUsed === 'WEBAUTHN')).toBeDefined();
    });
  });

  describe('management', () => {
    it('should require elevation to remove a passkey', async () => {
      await registerPasskey();
      const aal1 = (await env.getService(SessionService).create({ userId })).secret;
      const denied = await request('delete', `/api/v1/me/webauthn/${emulator.credentialIdB64}`, aal1);
      expect(denied.statusCode).toBe(403);

      const allowed = await request('delete', `/api/v1/me/webauthn/${emulator.credentialIdB64}`);
      expect(allowed.statusCode).toBe(200);
      const remaining = await env.getPostgresClient().select().from(schema.webauthnCredentials).where(eq(schema.webauthnCredentials.userId, userId));
      expect(remaining).toHaveLength(0);
    });
  });
});
