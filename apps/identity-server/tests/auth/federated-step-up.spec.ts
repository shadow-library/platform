import { afterAll, beforeEach, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';

import { AuthFlowService } from '@server/modules/auth/flow';
import { FederatedIdentityService, IdentityProviderService } from '@server/modules/auth/federation';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';
import { AuthModeService } from '@server/modules/system/auth-mode';

import { csrfPair, TestEnvironment } from '../test-environment';
import { installUpstreamIdP } from './upstream-idp';

const env = new TestEnvironment('federated-step-up').init();
const upstream = installUpstreamIdP({ issuer: 'https://accounts.google.example', clientId: 'google-client-id' });

afterAll(() => upstream.restore());

const configureGoogle = () =>
  env.getService(IdentityProviderService).createGlobal({
    kind: 'GOOGLE',
    name: 'Google',
    issuer: upstream.issuer,
    clientId: upstream.clientId,
    clientSecret: 'google-client-secret',
    allowSignUp: true,
  });

const request = (method: 'get' | 'post', path: string, cookie: string) => {
  const csrf = csrfPair();
  const base = env.getRouter().mockRequest()[method](path);
  return base.headers({ 'x-csrf-token': csrf.header }).cookies({ [SESSION_COOKIE_NAME]: cookie, 'csrf-token': csrf.cookie });
};

const start = (cookie: string) => request('post', '/api/v1/auth/social/step-up/start', cookie).body({});
const callback = (flowId: string) => env.getRouter().mockRequest().get('/api/v1/auth/federated/callback').query({ state: flowId, code: 'upstream-code' });

describe('Federated step-up', () => {
  beforeEach(async () => {
    upstream.setClaims({ sub: upstream.subject, email: upstream.email, email_verified: true });
    await env.getService(AuthModeService).invalidate();
  });

  const createFederatedOnlyUser = async (): Promise<{ userId: bigint; sessionSecret: string; sessionId: bigint }> => {
    const provider = await configureGoogle();
    const user = await env.getService(UserService).createProvisionedUser({ email: upstream.email, emailVerified: true, status: 'ACTIVE' });
    await env.getService(FederatedIdentityService).link(provider.id, user.id, upstream.subject);
    const created = await env.getService(SessionService).create({ userId: user.id });
    return { userId: user.id, sessionSecret: created.secret, sessionId: created.session.id };
  };

  describe('POST /api/v1/auth/social/step-up/start', () => {
    it('should require a session', async () => {
      const response = await env.getRouter().mockRequest().post('/api/v1/auth/social/step-up/start').body({});
      expect(response.statusCode).toBe(401);
    });

    it('should refuse a federated-only session with no linked provider', async () => {
      const user = await env.getService(UserService).createProvisionedUser({ email: 'unlinked@example.com', emailVerified: true, status: 'ACTIVE' });
      const session = await env.getService(SessionService).create({ userId: user.id });

      const response = await start(session.secret);

      expect(response.statusCode).toBe(404);
    });

    it('should refuse to start when the account already has a password', async () => {
      const provider = await configureGoogle();
      const user = await env.getService(UserService).createUserWithPassword({ email: upstream.email, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
      await env.getService(FederatedIdentityService).link(provider.id, user.id, upstream.subject);
      const session = await env.getService(SessionService).create({ userId: user.id });

      const response = await start(session.secret);

      expect(response.statusCode).toBe(409);
    });

    it('should return an authorization url for the account linked provider', async () => {
      const { sessionSecret } = await createFederatedOnlyUser();

      const response = await start(sessionSecret);

      expect(response.statusCode).toBe(200);
      const { flowId, authorizationUrl } = response.json() as { flowId: string; authorizationUrl: string };
      const url = new URL(authorizationUrl);
      expect(url.origin + url.pathname).toBe(`${upstream.issuer}/authorize`);
      expect(url.searchParams.get('state')).toBe(flowId);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    });
  });

  describe('GET /api/v1/auth/federated/callback (STEP_UP flow)', () => {
    it('should elevate the originating session to aal2 on a fresh completion', async () => {
      const { sessionSecret, sessionId } = await createFederatedOnlyUser();

      const started = (await start(sessionSecret)).json() as { flowId: string; authorizationUrl: string };
      upstream.useNonceFrom(started.authorizationUrl);
      const response = await callback(started.flowId);

      expect(response.statusCode).toBe(302);
      expect(response.headers['location']).toContain('status=STEP_UP_COMPLETE');
      expect(response.headers['location']).toContain('aal=AAL2');

      const validated = await env.getService(SessionService).validateById(sessionId);
      expect(validated?.aal).toBe('AAL2');
      expect(validated?.elevatedUntil).not.toBeNull();
    });

    it('should not mint any new session or user for a step-up completion', async () => {
      const { sessionSecret } = await createFederatedOnlyUser();
      const usersBefore = await env.getPostgresClient().select().from(schema.users);
      const sessionsBefore = await env.getPostgresClient().select().from(schema.userSessions);

      const started = (await start(sessionSecret)).json() as { flowId: string; authorizationUrl: string };
      upstream.useNonceFrom(started.authorizationUrl);
      await callback(started.flowId);

      const usersAfter = await env.getPostgresClient().select().from(schema.users);
      const sessionsAfter = await env.getPostgresClient().select().from(schema.userSessions);
      expect(usersAfter.length).toBe(usersBefore.length);
      expect(sessionsAfter.length).toBe(sessionsBefore.length);
    });

    it('should reject a completion once the step-up flow has expired', async () => {
      const { sessionSecret, sessionId } = await createFederatedOnlyUser();

      const started = (await start(sessionSecret)).json() as { flowId: string; authorizationUrl: string };
      upstream.useNonceFrom(started.authorizationUrl);
      await env.getService(AuthFlowService).delete(started.flowId);

      const response = await callback(started.flowId);

      expect(response.headers['location']).toContain('error=federation_failed');
      const validated = await env.getService(SessionService).validateById(sessionId);
      expect(validated?.aal).toBe('AAL1');
    });

    it('should reject a completion whose upstream subject does not match the flow owner', async () => {
      const { sessionSecret, sessionId } = await createFederatedOnlyUser();
      const started = (await start(sessionSecret)).json() as { flowId: string; authorizationUrl: string };
      upstream.useNonceFrom(started.authorizationUrl);
      upstream.setClaims({ sub: 'someone-elses-subject', email: 'someone-else@example.com', email_verified: true });

      const response = await callback(started.flowId);

      expect(response.headers['location']).toContain('error=federation_failed');
      const validated = await env.getService(SessionService).validateById(sessionId);
      expect(validated?.aal).toBe('AAL1');
    });
  });

  describe('GET /api/v1/me/mfa/step-up/methods', () => {
    it('should offer FEDERATED to a federated-only account with a linked provider', async () => {
      const { sessionSecret } = await createFederatedOnlyUser();
      const response = await request('get', '/api/v1/me/mfa/step-up/methods', sessionSecret);
      expect(response.statusCode).toBe(200);
      expect((response.json() as { methods: string[] }).methods).toEqual(['FEDERATED']);
    });
  });

  describe('existing step-up paths for a non-federated account', () => {
    it('should still elevate a password-only account through the password ceremony', async () => {
      const user = await env
        .getService(UserService)
        .createUserWithPassword({ email: 'password-only@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
      const session = await env.getService(SessionService).create({ userId: user.id });

      const stepUp = await request('post', '/api/v1/me/mfa/step-up', session.secret).body({ password: 'Password@123' });

      expect(stepUp.statusCode).toBe(200);
      expect(stepUp.json()).toMatchObject({ aal: 'AAL2' });
      const linked = await env.getPostgresClient().select().from(schema.federatedIdentities).where(eq(schema.federatedIdentities.userId, user.id));
      expect(linked).toHaveLength(0);
    });
  });
});
