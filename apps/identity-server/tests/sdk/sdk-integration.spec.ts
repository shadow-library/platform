/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { OAuthClientService } from '@server/modules/auth/oauth';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';
import { ApplicationRoleService, ApplicationService } from '@server/modules/system/application';
import { AuthClient, FetchLike } from '@shadow-library/auth';
import { RelyingParty } from '@shadow-library/auth/rp';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * These suites run the published SDK against the real identity server — the monorepo advantage.
 * The SDK's injectable transport is bridged onto the fastify inject router, so every discovery,
 * JWKS, token, and PDP call exercises the genuine HTTP surface without opening a socket.
 */
const env = new TestEnvironment('sdk').init();
const REDIRECT_URI = 'https://app.example.com/callback';

const fetchViaRouter: FetchLike = async (url, init = {}) => {
  const { pathname, search } = new URL(url);
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  const method = (init.method ?? 'GET') as 'GET' | 'POST';
  const response = await env.getRouter().mockRequest({ method, url: `${pathname}${search}`, headers, payload: typeof init.body === 'string' ? init.body : undefined });
  return new Response(response.body, { status: response.statusCode, headers: { 'content-type': String(response.headers['content-type'] ?? 'application/json') } });
};

describe('@shadow-library/auth against the real identity server', () => {
  const issuer = Config.get('oauth.issuer');
  let applicationId: number;
  let auth: AuthClient;
  let serviceClientId: string;

  beforeEach(async () => {
    applicationId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
    /** PDP calls need the bootstrap-seeded authz:check scope granted to the calling client */
    const scopeId = await env.getService(OAuthClientService).ensureScope(applicationId, 'shadow-identity', 'authz:check');
    const service = await env
      .getService(OAuthClientService)
      .register({ applicationId, name: 'SDK Service', kind: 'SERVICE', grantTypes: ['client_credentials'], scopeIds: [scopeId] });
    serviceClientId = service.clientId;
    auth = new AuthClient({ issuer, audience: 'shadow-identity', client: { id: service.clientId, secret: service.secret }, fetch: fetchViaRouter });
  });

  it('should mint a service token and verify it through the real jwks', async () => {
    const token = await auth.getServiceToken();
    const principal = await auth.verify(token);
    expect(principal).toMatchObject({ kind: 'service', sub: serviceClientId, clientId: serviceClientId });
  });

  it('should reject a token minted for a different audience', async () => {
    const db = env.getPostgresClient();
    const [resource] = await db.insert(schema.apiResources).values({ applicationId, identifier: 'api://reports' }).returning();
    if (!resource) throw new Error('resource not created');
    const [scope] = await db.insert(schema.scopes).values({ apiResourceId: resource.id, name: 'reports:read' }).returning();
    if (!scope) throw new Error('scope not created');
    const reporter = await env
      .getService(OAuthClientService)
      .register({ applicationId, name: 'Reporter', kind: 'SERVICE', grantTypes: ['client_credentials'], scopeIds: [scope.id] });

    const reporterAuth = new AuthClient({ issuer, audience: 'shadow-identity', client: { id: reporter.clientId, secret: reporter.secret }, fetch: fetchViaRouter });
    const foreign = await reporterAuth.getServiceToken({ resource: 'api://reports', scopes: ['reports:read'] });
    await expect(auth.verify(foreign)).rejects.toMatchObject({ code: 'AUDIENCE_MISMATCH' });

    const scoped = new AuthClient({ issuer, audience: 'api://reports', fetch: fetchViaRouter });
    const principal = await scoped.verify(foreign);
    expect(principal.scopes).toEqual(['reports:read']);
  });

  it('should resolve pdp decisions for real role assignments', async () => {
    const pdp = env.getService(PolicyDecisionService);
    const role = await env.getService(ApplicationRoleService).addRole('shadow-identity', { roleName: 'sdk-editor' });
    const user = await env.getService(UserService).createUserWithPassword({ email: 'sdk@example.com', password: 'Password@123', status: 'ACTIVE' });
    const organisationId = String(user.personalOrganisationId);
    const principal = { kind: 'user' as const, sub: user.id.toString() };

    const permissionId = await pdp.createPermission(applicationId, 'sdk:write');
    await pdp.grantPermissionToRole(role.id, permissionId);

    expect(await auth.check({ action: 'sdk:write', organisationId, principal })).toBe(false);
    await pdp.assignRole({ type: 'USER', id: principal.sub }, role.id, organisationId);

    // The server bumps authz_version on grant changes; the next uncached decision for this
    // principal piggybacks it, which purges the stale cached DENY within one round-trip
    expect(await auth.check({ action: 'sdk:delete', organisationId, principal })).toBe(false);
    expect(await auth.check({ action: 'sdk:write', organisationId, principal })).toBe(true);
    expect(await auth.check({ action: 'sdk:write', organisationId: '999999', principal })).toBe(false);
  });

  it('should complete the full oidc code flow through the relying-party helper', async () => {
    const web = await env.getService(OAuthClientService).register({
      applicationId,
      name: 'SDK Web App',
      kind: 'WEB_CONFIDENTIAL',
      isFirstParty: true,
      grantTypes: ['authorization_code', 'refresh_token'],
      redirectUris: [REDIRECT_URI],
    });
    const user = await env.getService(UserService).createUserWithPassword({ email: 'rp@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    const { session, secret } = await env.getService(SessionService).create({ userId: user.id });

    const rp = new RelyingParty({ issuer, client: { id: web.clientId, secret: web.secret }, redirectUri: REDIRECT_URI, fetch: fetchViaRouter });
    const request = await rp.createAuthorizationUrl();
    const authorizeUrl = new URL(request.url);
    expect(`${authorizeUrl.protocol}//${authorizeUrl.host}${authorizeUrl.pathname}`).toBe(`${issuer}/oauth2/authorize`);

    const redirect = await env
      .getRouter()
      .mockRequest()
      .get(`${authorizeUrl.pathname}${authorizeUrl.search}`)
      .cookies({ [SESSION_COOKIE_NAME]: secret });
    expect(redirect.statusCode).toBe(302);
    const location = new URL(redirect.headers.location ?? '');
    expect(location.searchParams.get('state')).toBe(request.state);
    const code = location.searchParams.get('code') ?? '';

    const tokens = await rp.exchangeCode({ code, codeVerifier: request.codeVerifier, nonce: request.nonce });
    expect(tokens.idTokenClaims).toMatchObject({ sub: user.id.toString(), aud: web.clientId, nonce: request.nonce });
    expect(tokens.refreshToken).toBeString();

    const refreshed = await rp.refresh(tokens.refreshToken as string);
    expect(refreshed.accessToken).toBeString();

    const principal = await auth.verify(tokens.accessToken);
    expect(principal).toMatchObject({ kind: 'user', sub: user.id.toString(), sid: String(session.id) });
  });

  it('should introspect tokens through the real endpoint', async () => {
    const token = await auth.getServiceToken();
    const result = await auth.introspect(token);
    expect(result).toMatchObject({ active: true, sub: serviceClientId, tokenType: 'access_token' });
    expect(await auth.introspect('garbage')).toMatchObject({ active: false });
  });
});
