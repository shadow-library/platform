/**
 * Importing npm packages
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { KeyService } from '@server/modules/auth/keys';
import { OAuthClientService } from '@server/modules/auth/oauth';
import { ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * A mock "cluster" issuer runs on the fixed port `tests/env.ts` pointed `AUTH_WORKLOAD_ISSUER` at.
 * SA tokens are signed RS256 with an in-memory key, exactly like the kubelet's projected tokens.
 */
const env = new TestEnvironment('workload-identity').init();
const WORKLOAD_ISSUER = 'http://127.0.0.1:45123';
const SUBJECT = 'system:serviceaccount:prod:pulse';
const ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

const base64url = (input: Uint8Array | string): string => Buffer.from(input).toString('base64url');

describe('workload identity client authentication', () => {
  let keyPair: CryptoKeyPair;
  let jwksServer: ReturnType<typeof Bun.serve>;
  let clientId: string;

  const signSaToken = async (claims: Record<string, unknown>, kid = 'k8s-1'): Promise<string> => {
    const header = base64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
    const body = base64url(JSON.stringify(claims));
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, Buffer.from(`${header}.${body}`));
    return `${header}.${body}.${base64url(new Uint8Array(signature))}`;
  };

  const saClaims = (overrides: Record<string, unknown> = {}): Record<string, unknown> => {
    const now = Math.floor(Date.now() / 1000);
    return { iss: WORKLOAD_ISSUER, sub: SUBJECT, aud: Config.get('oauth.issuer'), iat: now, exp: now + 600, ...overrides };
  };

  const requestToken = (assertion: string, extra: Record<string, unknown> = {}) =>
    env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .body({ grant_type: 'client_credentials', client_assertion_type: ASSERTION_TYPE, client_assertion: assertion, ...extra });

  beforeAll(async () => {
    keyPair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    jwksServer = Bun.serve({ port: 45123, fetch: () => Response.json({ keys: [{ ...publicJwk, kid: 'k8s-1', alg: 'RS256', use: 'sig' }] }) });
  });

  beforeEach(async () => {
    const applicationId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
    const registered = await env
      .getService(OAuthClientService)
      .register({ applicationId, name: 'Pulse Workload', kind: 'SERVICE', grantTypes: ['client_credentials'], workloadSubject: SUBJECT });
    clientId = registered.clientId;
  });
  afterAll(() => jwksServer.stop(true));

  it('should mint a service token for a valid projected sa token without any client secret', async () => {
    const response = await requestToken(await signSaToken(saClaims()));
    expect(response.statusCode).toBe(200);

    const claims = env.getService(KeyService).verify((response.json() as { access_token: string }).access_token);
    expect(claims).toMatchObject({ sub: clientId, client_id: clientId, token_type: 'service' });
  });

  it('should honour an explicit client_id only when it matches the bound client', async () => {
    expect((await requestToken(await signSaToken(saClaims()), { client_id: clientId })).statusCode).toBe(200);
    expect((await requestToken(await signSaToken(saClaims()), { client_id: crypto.randomUUID() })).statusCode).toBe(401);
  });

  it('should reject an assertion whose subject is not bound to any client', async () => {
    const response = await requestToken(await signSaToken(saClaims({ sub: 'system:serviceaccount:prod:unknown' })));
    expect(response.statusCode).toBe(401);
  });

  it('should reject expired, wrong-audience, and wrong-issuer assertions', async () => {
    expect((await requestToken(await signSaToken(saClaims({ exp: Math.floor(Date.now() / 1000) - 300 })))).statusCode).toBe(401);
    expect((await requestToken(await signSaToken(saClaims({ aud: 'https://kubernetes.default.svc' })))).statusCode).toBe(401);
    expect((await requestToken(await signSaToken(saClaims({ iss: 'https://evil.example.com' })))).statusCode).toBe(401);
  });

  it('should reject a forged signature and an unknown assertion type', async () => {
    const [head = '', body = ''] = (await signSaToken(saClaims())).split('.');
    const forged = `${head}.${body}.${base64url('not-a-signature')}`;
    expect((await requestToken(forged)).statusCode).toBe(401);

    const assertion = await signSaToken(saClaims());
    const wrongType = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .body({ grant_type: 'client_credentials', client_assertion_type: 'urn:something:else', client_assertion: assertion });
    expect(wrongType.statusCode).toBe(401);
  });
});
