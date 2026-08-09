import { afterAll, beforeEach, describe, expect, it } from 'bun:test';

import { IdentityProviderService } from '@server/modules/auth/federation';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';
import { AuthModeService } from '@server/modules/system/auth-mode';

import { TestEnvironment } from '../test-environment';
import { installUpstreamIdP } from './upstream-idp';

const env = new TestEnvironment('social-login').init();
const upstream = installUpstreamIdP({ issuer: 'https://accounts.google.example', clientId: 'google-client-id' });

afterAll(() => upstream.restore());

const configureGoogle = (allowSignUp = true) =>
  env.getService(IdentityProviderService).createGlobal({
    kind: 'GOOGLE',
    name: 'Google',
    issuer: upstream.issuer,
    clientId: upstream.clientId,
    clientSecret: 'google-client-secret',
    allowSignUp,
  });

const start = () => env.getRouter().mockRequest().post('/api/v1/auth/social/GOOGLE/start').body({});
const callback = (flowId: string) => env.getRouter().mockRequest().get('/api/v1/auth/federated/callback').query({ state: flowId, code: 'upstream-code' });

/** Drives start → upstream → callback, wiring the flow's nonce into the stub the way a real browser round trip would. */
const roundTrip = async (): Promise<{ flowId: string; response: Awaited<ReturnType<typeof callback>> }> => {
  const started = (await start()).json() as { flowId: string; authorizationUrl: string };
  upstream.useNonceFrom(started.authorizationUrl);
  return { flowId: started.flowId, response: await callback(started.flowId) };
};

describe('Social login', () => {
  beforeEach(async () => {
    upstream.setClaims({ sub: upstream.subject, email: upstream.email, email_verified: true });
    /** The harness recreates Postgres per test but not Redis, so the cached mode map has to be dropped alongside it. */
    await env.getService(AuthModeService).invalidate();
  });

  describe('POST /api/v1/auth/social/:provider/start', () => {
    it('should refuse to start when the provider is not configured', async () => {
      const response = await start();

      expect(response.statusCode).toBe(404);
    });

    it('should refuse to start when the provider is configured but disabled', async () => {
      const provider = await configureGoogle();
      await env.getService(IdentityProviderService).updateGlobal(provider.id, { isActive: false });

      const response = await start();

      expect(response.statusCode).toBe(404);
    });

    it('should return an authorization url carrying pkce, state and an account prompt', async () => {
      await configureGoogle();

      const response = await start();

      expect(response.statusCode).toBe(200);
      const { flowId, authorizationUrl } = response.json() as { flowId: string; authorizationUrl: string };
      const url = new URL(authorizationUrl);
      expect(url.origin + url.pathname).toBe(`${upstream.issuer}/authorize`);
      expect(url.searchParams.get('state')).toBe(flowId);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('code_challenge')).toBeTruthy();
      expect(url.searchParams.get('prompt')).toBe('select_account');
    });
  });

  describe('GET /api/v1/auth/federated/callback', () => {
    it('should provision a new account and sign it in when the upstream subject is unknown', async () => {
      await configureGoogle();

      const { response } = await roundTrip();

      expect(response.statusCode).toBe(302);
      expect(response.headers['location']).toBe('/account');
      const user = await env.getService(UserService).getUser(upstream.email);
      expect(user).not.toBeNull();
      const links = await env.getPostgresClient().select().from(schema.federatedIdentities);
      expect(links).toHaveLength(1);
      expect(links[0]?.subject).toBe(upstream.subject);
    });

    it('should sign a returning account in by matching the upstream subject', async () => {
      await configureGoogle();
      await roundTrip();

      const { response } = await roundTrip();

      expect(response.statusCode).toBe(302);
      expect(response.headers['location']).toBe('/account');
      const links = await env.getPostgresClient().select().from(schema.federatedIdentities);
      expect(links).toHaveLength(1);
    });

    it('should demand an emailed code before linking an upstream account to an existing local one', async () => {
      await configureGoogle();
      await env.getService(UserService).createUserWithPassword({ email: upstream.email, password: 'Password@123', status: 'ACTIVE', emailVerified: true });

      const { flowId, response } = await roundTrip();

      expect(response.statusCode).toBe(302);
      expect(response.headers['location']).toContain(`flow_id=${encodeURIComponent(flowId)}`);
      expect(response.headers['location']).toContain('status=AWAITING_LINK_OTP');
      const links = await env.getPostgresClient().select().from(schema.federatedIdentities);
      expect(links).toHaveLength(0);
    });

    it('should refuse to provision an account when the provider is link-only', async () => {
      await configureGoogle(false);

      const { response } = await roundTrip();

      expect(response.statusCode).toBe(302);
      expect(response.headers['location']).toContain('error=federation_failed');
      expect(await env.getService(UserService).getUser(upstream.email)).toBeNull();
    });

    it('should refuse an upstream email that is not verified', async () => {
      await configureGoogle();
      upstream.setClaims({ sub: upstream.subject, email: upstream.email, email_verified: false });

      const { response } = await roundTrip();

      expect(response.headers['location']).toContain('error=federation_failed');
      expect(await env.getService(UserService).getUser(upstream.email)).toBeNull();
    });

    it('should refuse a token whose nonce does not match the flow', async () => {
      await configureGoogle();
      const started = (await start()).json() as { flowId: string };
      upstream.useNonceFrom('https://example.com/?nonce=not-the-flow-nonce');

      const response = await callback(started.flowId);

      expect(response.headers['location']).toContain('error=federation_failed');
    });
  });

  describe('GET /api/v1/auth/flow/:flowId', () => {
    it('should let the login page pick a flow back up after the upstream redirect', async () => {
      await configureGoogle();
      await env.getService(UserService).createUserWithPassword({ email: upstream.email, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
      const { flowId } = await roundTrip();

      const response = await env.getRouter().mockRequest().get(`/api/v1/auth/flow/${flowId}`);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ flowId, status: 'AWAITING_LINK_OTP' });
    });

    it('should report an unknown flow as gone', async () => {
      const response = await env.getRouter().mockRequest().get('/api/v1/auth/flow/flow_auth_missing');

      expect(response.statusCode).toBe(410);
    });
  });

  describe('GET /api/v1/auth/methods', () => {
    it('should omit a social provider until it is configured and enabled', async () => {
      const before = await env.getRouter().mockRequest().get('/api/v1/auth/methods');
      expect(before.json()).toMatchObject({ password: true, passkey: true, emailOtp: true, smsOtp: false, social: [] });

      await configureGoogle();

      const after = await env.getRouter().mockRequest().get('/api/v1/auth/methods');
      expect(after.json().social).toStrictEqual([{ provider: 'GOOGLE', label: 'Google' }]);
    });
  });
});
