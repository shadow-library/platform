/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import { createHash, randomBytes } from 'node:crypto';

import { eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { KeyService } from '@server/modules/auth/keys';
import { ConsentService, OAuthClientService } from '@server/modules/auth/oauth';
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

/** The token, revocation and introspection endpoints accept only `application/x-www-form-urlencoded` (RFC 6749 §2.3.1, C-3). */
const FORM = 'application/x-www-form-urlencoded';
const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();

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
      .headers({ authorization: basic(clientId, secret), 'content-type': FORM })
      .body(form({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier }));
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
        .headers({ authorization: basic(clientId, secret), 'content-type': FORM })
        .body(form({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier }));

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
      .headers({ authorization: basic(clientId, secret), 'content-type': FORM })
      .body(form({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: 'wrong-verifier' }));
    expect(badVerifier.statusCode).toBe(400);

    const { verifier, challenge: c2 } = pkce();
    const code2 = new URL((await authorize(c2)).headers.location ?? '').searchParams.get('code') ?? '';
    const badSecret = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .headers({ authorization: basic(clientId, 'wrong-secret'), 'content-type': FORM })
      .body(form({ grant_type: 'authorization_code', code: code2, redirect_uri: REDIRECT_URI, code_verifier: verifier }));
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
      .headers({ authorization: basic(clientId, secret), 'content-type': FORM })
      .body(form({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier }));
    const refreshToken = (first.json() as { refresh_token: string }).refresh_token;

    const refreshed = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .headers({ authorization: basic(clientId, secret), 'content-type': FORM })
      .body(form({ grant_type: 'refresh_token', refresh_token: refreshToken }));
    expect(refreshed.statusCode).toBe(200);

    const reuse = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .headers({ authorization: basic(clientId, secret), 'content-type': FORM })
      .body(form({ grant_type: 'refresh_token', refresh_token: refreshToken }));
    expect(reuse.statusCode).toBe(400);
  });

  const codeFlow = async () => {
    const { verifier, challenge } = pkce();
    const code = new URL((await authorize(challenge)).headers.location ?? '').searchParams.get('code') ?? '';
    const token = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .headers({ authorization: basic(clientId, secret), 'content-type': FORM })
      .body(form({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier }));
    return token.json() as { access_token: string; refresh_token: string };
  };

  it('should introspect active tokens and report inactive after revocation', async () => {
    const { access_token, refresh_token } = await codeFlow();

    const introspect = (token: string) =>
      env
        .getRouter()
        .mockRequest()
        .post('/oauth2/introspect')
        .headers({ authorization: basic(clientId, secret), 'content-type': FORM })
        .body(form({ token }));

    expect((await introspect(access_token)).json()).toMatchObject({ active: true, token_type: 'access_token', sub: userId.toString() });
    expect((await introspect(refresh_token)).json()).toMatchObject({ active: true, token_type: 'refresh_token' });

    const revoked = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/revoke')
      .headers({ authorization: basic(clientId, secret), 'content-type': FORM })
      .body(form({ token: refresh_token }));
    expect(revoked.statusCode).toBe(200);

    expect((await introspect(refresh_token)).json()).toMatchObject({ active: false });
  });

  it('should report inactive for a garbage token', async () => {
    const response = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/introspect')
      .headers({ authorization: basic(clientId, secret), 'content-type': FORM })
      .body(form({ token: 'garbage' }));
    expect(response.json()).toMatchObject({ active: false });
  });

  it('should record first-party consent and revoke tokens on withdrawal', async () => {
    const { refresh_token } = await codeFlow();

    const consents = await env.getService(ConsentService).listForUser(userId);
    const consent = consents.find(entry => entry.clientId === clientId);
    expect(consent?.source).toBe('FIRST_PARTY_POLICY');
    expect(consent?.scopeNames).toContain('openid');

    await env.getService(ConsentService).withdraw(userId, clientId);

    const introspect = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/introspect')
      .headers({ authorization: basic(clientId, secret), 'content-type': FORM })
      .body(form({ token: refresh_token }));
    expect(introspect.json()).toMatchObject({ active: false });
    expect(await env.getService(ConsentService).getActive(userId, clientId)).toBeNull();
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
      .headers({ authorization: basic(service.clientId, service.secret ?? ''), 'content-type': FORM })
      .body(form({ grant_type: 'client_credentials', scope: 'reports:read', resource: 'api://reports' }));
    expect(granted.statusCode).toBe(200);
    const claims = env.getService(KeyService).verify((granted.json() as { access_token: string }).access_token);
    expect(claims?.aud).toBe('api://reports');
    expect(claims?.scope).toBe('reports:read');

    const ungranted = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .headers({ authorization: basic(service.clientId, service.secret ?? ''), 'content-type': FORM })
      .body(form({ grant_type: 'client_credentials', scope: 'reports:admin', resource: 'api://reports' }));
    expect(ungranted.statusCode).toBe(400);
  });

  describe('typed scopes (user vs m2m)', () => {
    it('should keep BOTH scopes, drop the wrong-principal ones, and pass unknown protocol scopes through', async () => {
      const applicationId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
      const db = env.getPostgresClient();
      const [resource] = await db.insert(schema.apiResources).values({ applicationId, identifier: 'api://typed' }).returning();
      await db.insert(schema.scopes).values([
        { apiResourceId: resource?.id ?? '', name: 'reports:read', principalType: 'BOTH' },
        { apiResourceId: resource?.id ?? '', name: 'reports:ingest', principalType: 'SERVICE' },
        { apiResourceId: resource?.id ?? '', name: 'reports:me', principalType: 'USER' },
      ]);
      const clients = env.getService(OAuthClientService);
      const requested = ['openid', 'reports:read', 'reports:ingest', 'reports:me'];

      expect(await clients.filterScopesForPrincipal(requested, 'user')).toEqual(['openid', 'reports:read', 'reports:me']);
      expect(await clients.filterScopesForPrincipal(requested, 'service')).toEqual(['openid', 'reports:read', 'reports:ingest']);
    });

    it('should never mint a user-only scope into a service (client-credentials) token', async () => {
      const applicationId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
      const db = env.getPostgresClient();
      const [resource] = await db.insert(schema.apiResources).values({ applicationId, identifier: 'api://svc' }).returning();
      const [shared] = await db
        .insert(schema.scopes)
        .values({ apiResourceId: resource?.id ?? '', name: 'jobs:run', principalType: 'BOTH' })
        .returning();
      const [userOnly] = await db
        .insert(schema.scopes)
        .values({ apiResourceId: resource?.id ?? '', name: 'jobs:profile', principalType: 'USER' })
        .returning();
      const service = await env
        .getService(OAuthClientService)
        .register({ applicationId, name: 'Worker', kind: 'SERVICE', grantTypes: ['client_credentials'], scopeIds: [shared?.id ?? '', userOnly?.id ?? ''] });

      const granted = await env
        .getRouter()
        .mockRequest()
        .post('/oauth2/token')
        .headers({ authorization: basic(service.clientId, service.secret ?? ''), 'content-type': FORM })
        .body(form({ grant_type: 'client_credentials', scope: 'jobs:run jobs:profile', resource: 'api://svc' }));
      expect(granted.statusCode).toBe(200);
      const claims = env.getService(KeyService).verify((granted.json() as { access_token: string }).access_token);
      expect(claims?.scope).toBe('jobs:run');
    });

    it('should not surface a service-only scope on a user consent prompt', async () => {
      const applicationId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
      const db = env.getPostgresClient();
      const [resource] = await db.insert(schema.apiResources).values({ applicationId, identifier: 'api://consent' }).returning();
      await db.insert(schema.scopes).values([
        { apiResourceId: resource?.id ?? '', name: 'docs:read', principalType: 'BOTH' },
        { apiResourceId: resource?.id ?? '', name: 'docs:sync', principalType: 'SERVICE' },
      ]);
      const prompt = await env.getService(ConsentService).buildPrompt(userId, clientId, 'openid docs:read docs:sync');
      const names = prompt.scopes.map(scope => scope.name);
      expect(names).toContain('docs:read');
      expect(names).not.toContain('docs:sync');
    });
  });

  describe('RFC 6749 request encoding', () => {
    it('should accept a form-encoded token request', async () => {
      const { verifier, challenge } = pkce();
      const code = new URL((await authorize(challenge)).headers.location ?? '').searchParams.get('code') ?? '';
      const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier });

      const token = await env
        .getRouter()
        .mockRequest()
        .post('/oauth2/token')
        .headers({ authorization: basic(clientId, secret), 'content-type': FORM })
        .body(body.toString());

      expect(token.statusCode).toBe(200);
      expect((token.json() as { token_type: string }).token_type).toBe('Bearer');
    });

    it('should refuse a JSON token request with invalid_request', async () => {
      const { verifier, challenge } = pkce();
      const code = new URL((await authorize(challenge)).headers.location ?? '').searchParams.get('code') ?? '';

      const token = await env
        .getRouter()
        .mockRequest()
        .post('/oauth2/token')
        .headers({ authorization: basic(clientId, secret), 'content-type': 'application/json' })
        .body({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier });

      expect(token.statusCode).toBe(400);
      expect(token.json()).toMatchObject({ code: 'invalid_request' });
    });

    it('should refuse a JSON introspection request with invalid_request', async () => {
      const response = await env
        .getRouter()
        .mockRequest()
        .post('/oauth2/introspect')
        .headers({ authorization: basic(clientId, secret), 'content-type': 'application/json' })
        .body({ token: 'anything' });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'invalid_request' });
    });

    it('should advertise the revocation, introspection and client-authentication metadata', async () => {
      const response = await env.getRouter().mockRequest().get('/.well-known/openid-configuration');
      expect(response.json()).toMatchObject({
        revocation_endpoint: `${response.json().issuer}/oauth2/revoke`,
        introspection_endpoint: `${response.json().issuer}/oauth2/introspect`,
        token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'private_key_jwt', 'none'],
      });
    });
  });

  describe('audience isolation', () => {
    const clientService = () => env.getService(OAuthClientService);
    const applicationId = () => env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;

    const tokenFor = (client: { clientId: string; secret?: string }, resource: string, scope: string) =>
      env
        .getRouter()
        .mockRequest()
        .post('/oauth2/token')
        .headers({ authorization: basic(client.clientId, client.secret ?? ''), 'content-type': FORM })
        .body(form({ grant_type: 'client_credentials', scope, resource }));

    it('should refuse an audience the client holds no scope on', async () => {
      await clientService().ensureScope(applicationId(), 'api://unentitled', 'vault:read');
      const { challenge } = pkce();
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: 'openid',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        resource: 'api://unentitled',
      });

      const response = await env
        .getRouter()
        .mockRequest()
        .get(`/oauth2/authorize?${params.toString()}`)
        .cookies({ [SESSION_COOKIE_NAME]: sessionSecret });
      expect(response.statusCode).toBe(400);
    });

    it('should allow an application its own canonical audience without scope grants', async () => {
      const application = await env.getService(ApplicationService).createApplication({ name: 'ledger', subDomain: 'ledger' });
      const provisioned = await clientService().provisionApplicationIdentity({ applicationId: application.id, name: 'ledger', publicUrls: ['https://ledger.example.com'] });

      const response = await tokenFor({ clientId: provisioned.clientId, secret: provisioned.secret }, 'api://ledger', '');
      expect(response.statusCode).toBe(200);
      const claims = env.getService(KeyService).verify((response.json() as { access_token: string }).access_token);
      expect(claims?.aud).toBe('api://ledger');
    });

    it('should not mint a scope granted on one resource into a token for another', async () => {
      const alpha = await clientService().ensureScope(applicationId(), 'api://alpha', 'alpha:read');
      const beta = await clientService().ensureScope(applicationId(), 'api://beta', 'beta:read');
      const service = await clientService().register({
        applicationId: applicationId(),
        name: 'Cross Audience Service',
        kind: 'SERVICE',
        grantTypes: ['client_credentials'],
        scopeIds: [alpha, beta],
      });

      const crossed = await env
        .getRouter()
        .mockRequest()
        .post('/oauth2/token')
        .headers({ authorization: basic(service.clientId, service.secret ?? ''), 'content-type': FORM })
        .body(form({ grant_type: 'client_credentials', scope: 'alpha:read', resource: 'api://beta' }));
      expect(crossed.statusCode).toBe(400);

      const aligned = await env
        .getRouter()
        .mockRequest()
        .post('/oauth2/token')
        .headers({ authorization: basic(service.clientId, service.secret ?? ''), 'content-type': FORM })
        .body(form({ grant_type: 'client_credentials', scope: 'alpha:read', resource: 'api://alpha' }));
      expect(aligned.statusCode).toBe(200);
      expect(env.getService(KeyService).verify((aligned.json() as { access_token: string }).access_token)?.aud).toBe('api://alpha');
    });

    it('should stop issuing tokens once the api resource is deactivated', async () => {
      const scopeId = await clientService().ensureScope(applicationId(), 'api://retired', 'retired:read');
      const service = await clientService().register({
        applicationId: applicationId(),
        name: 'Retiring Service',
        kind: 'SERVICE',
        grantTypes: ['client_credentials'],
        scopeIds: [scopeId],
      });
      expect((await tokenFor(service, 'api://retired', 'retired:read')).statusCode).toBe(200);

      await env.getPostgresClient().update(schema.apiResources).set({ isActive: false }).where(eq(schema.apiResources.identifier, 'api://retired'));
      expect((await tokenFor(service, 'api://retired', 'retired:read')).statusCode).toBe(400);
    });
  });

  describe('token endpoint caller scoping', () => {
    const otherClient = async () => {
      const registered = await env.getService(OAuthClientService).register({
        applicationId: env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id,
        name: 'Unrelated App',
        kind: 'WEB_CONFIDENTIAL',
        grantTypes: ['authorization_code', 'refresh_token'],
        redirectUris: [REDIRECT_URI],
      });
      return registered;
    };

    const issueTokens = async () => {
      const { verifier, challenge } = pkce();
      const code = new URL((await authorize(challenge)).headers.location ?? '').searchParams.get('code') ?? '';
      const token = await env
        .getRouter()
        .mockRequest()
        .post('/oauth2/token')
        .headers({ authorization: basic(clientId, secret), 'content-type': FORM })
        .body(form({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier }));
      return token.json() as { access_token: string; refresh_token: string };
    };

    it('should report another client’s token as inactive', async () => {
      const tokens = await issueTokens();
      const stranger = await otherClient();

      const mine = await env
        .getRouter()
        .mockRequest()
        .post('/oauth2/introspect')
        .headers({ 'content-type': FORM })
        .body(form({ token: tokens.access_token, client_id: clientId, client_secret: secret }));
      expect((mine.json() as { active: boolean }).active).toBe(true);

      const theirs = await env
        .getRouter()
        .mockRequest()
        .post('/oauth2/introspect')
        .headers({ 'content-type': FORM })
        .body(form({ token: tokens.access_token, client_id: stranger.clientId, client_secret: stranger.secret ?? '' }));
      expect((theirs.json() as { active: boolean }).active).toBe(false);
    });

    it('should ignore a revocation request from a client that does not own the token', async () => {
      const tokens = await issueTokens();
      const stranger = await otherClient();

      await env
        .getRouter()
        .mockRequest()
        .post('/oauth2/revoke')
        .headers({ 'content-type': FORM })
        .body(form({ token: tokens.refresh_token, client_id: stranger.clientId, client_secret: stranger.secret ?? '' }));

      const stillActive = await env
        .getRouter()
        .mockRequest()
        .post('/oauth2/introspect')
        .headers({ 'content-type': FORM })
        .body(form({ token: tokens.refresh_token, client_id: clientId, client_secret: secret }));
      expect((stillActive.json() as { active: boolean }).active).toBe(true);
    });

    it('should refuse introspection from a public client', async () => {
      const publicClient = await env.getService(OAuthClientService).register({
        applicationId: env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id,
        name: 'Public SPA',
        kind: 'SPA_PUBLIC',
        grantTypes: ['authorization_code'],
        redirectUris: [REDIRECT_URI],
      });
      const tokens = await issueTokens();

      const response = await env
        .getRouter()
        .mockRequest()
        .post('/oauth2/introspect')
        .headers({ 'content-type': FORM })
        .body(form({ token: tokens.access_token, client_id: publicClient.clientId }));
      expect(response.statusCode).toBe(401);
    });
  });
});
