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
      .register({ applicationId, name: 'Pulse Workload', kind: 'SERVICE', grantTypes: ['client_credentials'], workloadSubjects: [SUBJECT] });
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

  /** An unsigned/HMAC token would bypass the cluster's asymmetric keys — the alg gate must reject it before verification. */
  it('should reject algorithm-confusion assertions (none / HS256)', async () => {
    const forgeHeader = (alg: string): string => {
      const header = base64url(JSON.stringify({ alg, kid: 'k8s-1', typ: 'JWT' }));
      const body = base64url(JSON.stringify(saClaims()));
      /** A non-empty signature segment isolates the alg check from the malformed-token guard. */
      return `${header}.${body}.${base64url('sig')}`;
    };
    expect((await requestToken(forgeHeader('none'))).statusCode).toBe(401);
    expect((await requestToken(forgeHeader('HS256'))).statusCode).toBe(401);
  });

  /** A deactivated workload client must not authenticate even with a cryptographically valid SA token. */
  it('should reject a valid assertion once its bound client is deactivated', async () => {
    await env.getService(OAuthClientService).updateClient(clientId, { isActive: false });
    expect((await requestToken(await signSaToken(saClaims()))).statusCode).toBe(401);
  });

  /** One workload must never be able to obtain another workload's client, even with a valid SA token. */
  it('should not let one workload impersonate another (per-subject binding)', async () => {
    const applicationId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
    const otherSubject = 'system:serviceaccount:prod:novel-forge-server';
    const other = await env.getService(OAuthClientService).register({ applicationId, name: 'Forge Workload', kind: 'SERVICE', grantTypes: ['client_credentials'], workloadSubjects: [otherSubject] });

    /** pulse's SA token resolves to pulse's client only... */
    const asPulse = await requestToken(await signSaToken(saClaims()));
    expect(asPulse.statusCode).toBe(200);
    expect((env.getService(KeyService).verify((asPulse.json() as { access_token: string }).access_token) as { client_id: string }).client_id).toBe(clientId);

    /** ...and cannot be redirected onto novel-forge's client by naming its id. */
    expect((await requestToken(await signSaToken(saClaims()), { client_id: other.clientId })).statusCode).toBe(401);

    /** novel-forge's SA token resolves to novel-forge's client, never pulse's. */
    const asForge = await requestToken(await signSaToken(saClaims({ sub: otherSubject })));
    expect(asForge.statusCode).toBe(200);
    expect((env.getService(KeyService).verify((asForge.json() as { access_token: string }).access_token) as { client_id: string }).client_id).toBe(other.clientId);
  });

  /** The `-web` and `-server` variants of one product share a single client, listing both SA subjects. */
  it('should mint under one shared client for either exact subject bound to it', async () => {
    const applicationId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
    const web = 'system:serviceaccount:nf:nf-web';
    const server = 'system:serviceaccount:nf:nf-server';
    const shared = await env
      .getService(OAuthClientService)
      .register({ id: 'novel-forge', applicationId, name: 'Novel Forge', kind: 'SERVICE', grantTypes: ['client_credentials'], workloadSubjects: [web, server] });

    for (const sub of [web, server]) {
      const response = await requestToken(await signSaToken(saClaims({ sub })));
      expect(response.statusCode).toBe(200);
      expect((env.getService(KeyService).verify((response.json() as { access_token: string }).access_token) as { client_id: string }).client_id).toBe(shared.clientId);
    }
    expect(shared.clientId).toBe('novel-forge');
  });

  /** A namespace pattern matches only with an explicit client_id; subject-only resolution stays exact. */
  it('should honour a namespace pattern with an explicit client_id but not by subject alone', async () => {
    const applicationId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
    const pattern = await env
      .getService(OAuthClientService)
      .register({ id: 'staging-fleet', applicationId, name: 'Staging Fleet', kind: 'SERVICE', grantTypes: ['client_credentials'], workloadSubjects: ['system:serviceaccount:staging:*'] });
    const token = await signSaToken(saClaims({ sub: 'system:serviceaccount:staging:api' }));

    /** Named client + covered subject → minted. */
    expect((await requestToken(token, { client_id: pattern.clientId })).statusCode).toBe(200);
    /** Same subject with no client_id → a pattern is never reachable on the exact-resolution path. */
    expect((await requestToken(token)).statusCode).toBe(401);
  });

  /** A caller cannot fabricate a service identity by naming a workload client without presenting its SA token. */
  it('should refuse a secretless client_credentials call for a workload client (no header-forged identity)', async () => {
    const spoofed = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .headers({ 'x-service-account': SUBJECT })
      .body({ grant_type: 'client_credentials', client_id: clientId, scope: 'authz:check' });
    expect(spoofed.statusCode).toBe(401);
  });
});
