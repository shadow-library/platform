import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import { verify as cryptoVerify, generateKeyPairSync } from 'node:crypto';

import { IdentityProviderService } from '@server/modules/auth/federation';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';
import { AuthModeService } from '@server/modules/system/auth-mode';

import { TestEnvironment } from '../test-environment';
import { installUpstreamIdP } from './upstream-idp';

const env = new TestEnvironment('apple-login').init();
const upstream = installUpstreamIdP({ issuer: 'https://appleid.apple.example', clientId: 'apple-services-id' });

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const applePrivateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const applePublicKey = publicKey;

afterAll(() => upstream.restore());

const configureApple = (overrides: Partial<{ appleTeamId: string; appleKeyId: string; allowSignUp: boolean }> = {}) =>
  env.getService(IdentityProviderService).createGlobal({
    kind: 'APPLE',
    name: 'Apple',
    issuer: upstream.issuer,
    clientId: upstream.clientId,
    clientSecret: applePrivateKeyPem,
    appleTeamId: overrides.appleTeamId ?? 'TEAM12345X',
    appleKeyId: overrides.appleKeyId ?? 'KEY98765Y',
    allowSignUp: overrides.allowSignUp,
  });

const FORM = 'application/x-www-form-urlencoded';
const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();

const start = () => env.getRouter().mockRequest().post('/api/v1/auth/social/APPLE/start').body({});
const callback = (fields: Record<string, string>) => env.getRouter().mockRequest().post('/api/v1/auth/federated/callback').headers({ 'content-type': FORM }).body(form(fields));

const roundTrip = async (extra: Record<string, string> = {}): Promise<{ flowId: string; response: Awaited<ReturnType<typeof callback>> }> => {
  const started = (await start()).json() as { flowId: string; authorizationUrl: string };
  upstream.useNonceFrom(started.authorizationUrl);
  const response = await callback({ state: started.flowId, code: 'upstream-code', ...extra });
  return { flowId: started.flowId, response };
};

describe('Apple sign-in', () => {
  beforeEach(async () => {
    upstream.setClaims({ sub: upstream.subject, email: upstream.email, email_verified: true });
    await env.getService(AuthModeService).invalidate();
  });

  describe('IdentityProviderService.createGlobal', () => {
    it('should refuse to configure apple without a team id and key id', async () => {
      const create = env.getService(IdentityProviderService).createGlobal({
        kind: 'APPLE',
        name: 'Apple',
        issuer: upstream.issuer,
        clientId: upstream.clientId,
        clientSecret: applePrivateKeyPem,
      });

      await expect(create).rejects.toThrow();
    });
  });

  describe('POST /api/v1/auth/social/APPLE/start', () => {
    it('should require response_mode=form_post and omit the select_account prompt', async () => {
      await configureApple();

      const response = await start();

      expect(response.statusCode).toBe(200);
      const { authorizationUrl } = response.json() as { authorizationUrl: string };
      const url = new URL(authorizationUrl);
      expect(url.searchParams.get('response_mode')).toBe('form_post');
      expect(url.searchParams.get('prompt')).toBeNull();
    });
  });

  describe('POST /api/v1/auth/federated/callback (form_post)', () => {
    it('should mint an ES256 client-secret JWT from the configured .p8 key for the token exchange', async () => {
      await configureApple({ appleTeamId: 'TEAMABCDEF', appleKeyId: 'KEYZYXWVU' });

      await roundTrip();

      const body = upstream.getLastTokenRequestBody();
      const clientSecret = body?.['client_secret'] ?? '';
      const [headerSegment, payloadSegment, signatureSegment] = clientSecret.split('.');
      expect(headerSegment && payloadSegment && signatureSegment).toBeTruthy();
      const header = JSON.parse(Buffer.from(headerSegment ?? '', 'base64url').toString('utf-8')) as { alg: string; kid: string };
      const payload = JSON.parse(Buffer.from(payloadSegment ?? '', 'base64url').toString('utf-8')) as { iss: string; sub: string; aud: string };
      expect(header.alg).toBe('ES256');
      expect(header.kid).toBe('KEYZYXWVU');
      expect(payload.iss).toBe('TEAMABCDEF');
      expect(payload.sub).toBe(upstream.clientId);
      expect(payload.aud).toBe('https://appleid.apple.com');
      const valid = cryptoVerify(
        'sha256',
        Buffer.from(`${headerSegment}.${payloadSegment}`),
        { key: applePublicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signatureSegment ?? '', 'base64url'),
      );
      expect(valid).toBe(true);
    });

    it('should provision a new account and capture the name sent on the first authorization only', async () => {
      await configureApple();

      const { response } = await roundTrip({ user: JSON.stringify({ name: { firstName: 'Ada', lastName: 'Lovelace' } }) });

      expect(response.statusCode).toBe(302);
      expect(response.headers['location']).toBe('/account');
      const user = await env.getService(UserService).getUser(upstream.email);
      expect(user).not.toBeNull();
      const claims = await env.getService(UserService).getProfileClaims(user!.id);
      expect(claims.given_name).toBe('Ada');
      expect(claims.family_name).toBe('Lovelace');
    });

    it('should not require a name on a subsequent authorization and should leave the captured name untouched', async () => {
      await configureApple();
      await roundTrip({ user: JSON.stringify({ name: { firstName: 'Ada', lastName: 'Lovelace' } }) });

      const { response } = await roundTrip();

      expect(response.statusCode).toBe(302);
      expect(response.headers['location']).toBe('/account');
      const user = await env.getService(UserService).getUser(upstream.email);
      const claims = await env.getService(UserService).getProfileClaims(user!.id);
      expect(claims.given_name).toBe('Ada');
      expect(claims.family_name).toBe('Lovelace');
      const links = await env.getPostgresClient().select().from(schema.federatedIdentities);
      expect(links).toHaveLength(1);
    });

    it("should treat a stringified true as verified, matching Apple's legacy email_verified claim shape", async () => {
      await configureApple();
      upstream.setClaims({ sub: upstream.subject, email: upstream.email, email_verified: 'true' });

      const { response } = await roundTrip();

      expect(response.statusCode).toBe(302);
      expect(response.headers['location']).toBe('/account');
      expect(await env.getService(UserService).getUser(upstream.email)).not.toBeNull();
    });

    it('should refuse a malformed email_verified claim', async () => {
      await configureApple();
      upstream.setClaims({ sub: upstream.subject, email: upstream.email, email_verified: 'yes' });

      const { response } = await roundTrip();

      expect(response.headers['location']).toContain('error=federation_failed');
      expect(await env.getService(UserService).getUser(upstream.email)).toBeNull();
    });

    it('should refuse an expired id token', async () => {
      await configureApple();
      const now = Math.floor(Date.now() / 1000);
      upstream.setClaims({ sub: upstream.subject, email: upstream.email, email_verified: true, exp: now - 3600 });

      const { response } = await roundTrip();

      expect(response.headers['location']).toContain('error=federation_failed');
    });

    it('should refuse a token minted for the wrong audience', async () => {
      await configureApple();
      upstream.setClaims({ sub: upstream.subject, email: upstream.email, email_verified: true, aud: 'not-the-configured-client' });

      const { response } = await roundTrip();

      expect(response.headers['location']).toContain('error=federation_failed');
    });

    it('should refuse to provision an account when the provider is link-only', async () => {
      await configureApple({ allowSignUp: false });

      const { response } = await roundTrip();

      expect(response.headers['location']).toContain('error=federation_failed');
      expect(await env.getService(UserService).getUser(upstream.email)).toBeNull();
    });
  });

  describe('GET /api/v1/auth/methods', () => {
    it('should list apple once its provider is configured and active', async () => {
      await configureApple();

      const response = await env.getRouter().mockRequest().get('/api/v1/auth/methods');

      expect(response.json().social).toStrictEqual([{ provider: 'APPLE', label: 'Apple' }]);
    });
  });
});
