/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Importing user defined packages
 */
import { KeyService } from '@server/modules/auth/keys';
import { OAuthClientService } from '@server/modules/auth/oauth';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';
import { ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('oauth-flow').init();
const REDIRECT_URI = 'https://app.example.com/callback';

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
};

const basic = (clientId: string, secret: string) => `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`;

describe('OAuth authorization-code flow', () => {
  let clientId: string;
  let secret: string;
  let userId: bigint;
  let sessionSecret: string;

  beforeEach(async () => {
    const applicationId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
    const client = await env.getService(OAuthClientService).register({
      applicationId,
      name: 'Test App',
      kind: 'WEB_CONFIDENTIAL',
      isFirstParty: true,
      grantTypes: ['authorization_code', 'refresh_token'],
      redirectUris: [REDIRECT_URI],
    });
    clientId = client.clientId;
    secret = client.secret ?? '';

    const user = await env.getService(UserService).createUserWithPassword({ email: 'oauth@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    userId = user.id;
    sessionSecret = (await env.getService(SessionService).create({ userId })).secret;
  });

  const authorize = (challenge: string, cookie = true) => {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid',
      state: 'xyz',
      nonce: 'n1',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    const chain = env.getRouter().mockRequest().get(`/oauth2/authorize?${params.toString()}`);
    return cookie ? chain.cookies({ [SESSION_COOKIE_NAME]: sessionSecret }) : chain;
  };

  it('should publish discovery metadata', async () => {
    const response = await env.getRouter().mockRequest().get('/.well-known/openid-configuration');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ code_challenge_methods_supported: ['S256'], id_token_signing_alg_values_supported: ['EdDSA'] });
  });

  it('should complete the code flow and issue verifiable tokens', async () => {
    const { verifier, challenge } = pkce();
    const redirect = await authorize(challenge);
    expect(redirect.statusCode).toBe(302);

    const location = new URL(redirect.headers.location ?? '');
    expect(location.searchParams.get('state')).toBe('xyz');
    const code = location.searchParams.get('code') ?? '';

    const token = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .headers({ authorization: basic(clientId, secret) })
      .body({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier });
    expect(token.statusCode).toBe(200);
    const body = token.json() as { access_token: string; id_token: string; refresh_token: string; token_type: string };
    expect(body.token_type).toBe('Bearer');

    const claims = env.getService(KeyService).verify(body.access_token);
    expect(claims?.sub).toBe(userId.toString());
    expect(claims?.client_id).toBe(clientId);

    const idClaims = env.getService(KeyService).verify(body.id_token);
    expect(idClaims?.aud).toBe(clientId);
    expect(idClaims?.nonce).toBe('n1');

    const userinfo = await env
      .getRouter()
      .mockRequest()
      .get('/oauth2/userinfo')
      .headers({ authorization: `Bearer ${body.access_token}` });
    expect(userinfo.json()).toMatchObject({ sub: userId.toString(), email: 'oauth@example.com' });
  });

  it('should reject a reused authorization code', async () => {
    const { verifier, challenge } = pkce();
    const code = new URL((await authorize(challenge)).headers.location ?? '').searchParams.get('code') ?? '';
    const exchange = () =>
      env
        .getRouter()
        .mockRequest()
        .post('/oauth2/token')
        .headers({ authorization: basic(clientId, secret) })
        .body({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier });

    expect((await exchange()).statusCode).toBe(200);
    expect((await exchange()).statusCode).toBe(400);
  });

  it('should reject a wrong PKCE verifier and a wrong client secret', async () => {
    const { challenge } = pkce();
    const code = new URL((await authorize(challenge)).headers.location ?? '').searchParams.get('code') ?? '';

    const badVerifier = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .headers({ authorization: basic(clientId, secret) })
      .body({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: 'wrong-verifier' });
    expect(badVerifier.statusCode).toBe(400);

    const { verifier, challenge: c2 } = pkce();
    const code2 = new URL((await authorize(c2)).headers.location ?? '').searchParams.get('code') ?? '';
    const badSecret = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .headers({ authorization: basic(clientId, 'wrong-secret') })
      .body({ grant_type: 'authorization_code', code: code2, redirect_uri: REDIRECT_URI, code_verifier: verifier });
    expect(badSecret.statusCode).toBe(401);
  });

  it('should redirect to login when there is no session', async () => {
    const { challenge } = pkce();
    const response = await authorize(challenge, false);
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('/login');
  });

  it('should rotate refresh tokens and detect reuse', async () => {
    const { verifier, challenge } = pkce();
    const code = new URL((await authorize(challenge)).headers.location ?? '').searchParams.get('code') ?? '';
    const first = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .headers({ authorization: basic(clientId, secret) })
      .body({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier });
    const refreshToken = (first.json() as { refresh_token: string }).refresh_token;

    const refreshed = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .headers({ authorization: basic(clientId, secret) })
      .body({ grant_type: 'refresh_token', refresh_token: refreshToken });
    expect(refreshed.statusCode).toBe(200);

    const reuse = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .headers({ authorization: basic(clientId, secret) })
      .body({ grant_type: 'refresh_token', refresh_token: refreshToken });
    expect(reuse.statusCode).toBe(400);
  });

  it('should issue a client-credentials token scoped to granted scopes', async () => {
    const applicationId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
    const db = env.getPostgresClient();
    const [resource] = await db.insert(schema.apiResources).values({ applicationId, identifier: 'api://reports' }).returning();
    if (!resource) throw new Error('resource not created');
    const [scope] = await db.insert(schema.scopes).values({ apiResourceId: resource.id, name: 'reports:read' }).returning();
    if (!scope) throw new Error('scope not created');
    const service = await env.getService(OAuthClientService).register({ applicationId, name: 'Worker', kind: 'SERVICE', grantTypes: ['client_credentials'], scopeIds: [scope.id] });

    const granted = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .headers({ authorization: basic(service.clientId, service.secret ?? '') })
      .body({ grant_type: 'client_credentials', scope: 'reports:read', resource: 'api://reports' });
    expect(granted.statusCode).toBe(200);
    const claims = env.getService(KeyService).verify((granted.json() as { access_token: string }).access_token);
    expect(claims?.aud).toBe('api://reports');
    expect(claims?.scope).toBe('reports:read');

    const ungranted = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .headers({ authorization: basic(service.clientId, service.secret ?? '') })
      .body({ grant_type: 'client_credentials', scope: 'reports:admin', resource: 'api://reports' });
    expect(ungranted.statusCode).toBe(400);
  });
});
