import { beforeEach, describe, expect, it } from 'bun:test';

import { KeyService } from '@server/modules/auth/keys';
import { ACCESS_TOKEN_TYPE, AccessTokenService, OAuthClientService, TOKEN_EXCHANGE_GRANT } from '@server/modules/auth/oauth';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';
import { ApplicationAccessService, ApplicationService } from '@server/modules/system/application';
import { eq } from 'drizzle-orm';

import { TestEnvironment } from '../test-environment';

interface RegisteredApp {
  clientId: string;
  secret?: string;
  applicationId: number;
  audience: string;
}

const env = new TestEnvironment('token-exchange').init();

const CALLER_AUDIENCE = 'api://caller';
const TARGET_AUDIENCE = 'api://target';

describe('RFC 8693 token exchange', () => {
  let caller: RegisteredApp;
  let target: RegisteredApp;
  let userId: bigint;

  const basic = (app: RegisteredApp) => `Basic ${Buffer.from(`${app.clientId}:${app.secret}`).toString('base64')}`;

  const registerApp = async (name: string, audience: string): Promise<RegisteredApp> => {
    const applications = env.getService(ApplicationService);
    const clients = env.getService(OAuthClientService);
    const application = await applications.createApplication({ name, subDomain: name });
    await clients.ensureResource(application.id, audience);
    const registered = await clients.register({
      applicationId: application.id,
      name,
      kind: 'WEB_CONFIDENTIAL',
      isFirstParty: true,
      grantTypes: ['authorization_code', 'client_credentials'],
    });
    return { ...registered, applicationId: application.id, audience };
  };

  const grantOnTarget = async (name: string, isSensitive = false): Promise<void> => {
    const clients = env.getService(OAuthClientService);
    const resources = await clients.listResources();
    const resource = resources.find(candidate => candidate.identifier === TARGET_AUDIENCE);
    if (!resource) throw new Error('target resource was not provisioned');
    const scopeId = await clients.createScope(resource.id, name, undefined, isSensitive);
    await clients.grantScope(caller.clientId, scopeId);
  };

  const userToken = (overrides: Record<string, unknown> = {}) =>
    env.getService(AccessTokenService).mintAccessToken({
      subject: userId.toString(),
      audience: CALLER_AUDIENCE,
      scope: 'reports:read',
      clientId: caller.clientId,
      organisationId: '42',
      sessionId: '77',
      ttlSeconds: 600,
      actorType: 'user',
      ...overrides,
    }).token;

  const exchange = (app: RegisteredApp, body: Record<string, string | undefined>) => {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) if (value !== undefined) form.set(key, value);
    return env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .headers({ authorization: basic(app), 'content-type': 'application/x-www-form-urlencoded' })
      .body(form.toString());
  };

  const exchangeAsCaller = (overrides: Record<string, string | undefined> = {}) =>
    exchange(caller, {
      grant_type: TOKEN_EXCHANGE_GRANT,
      subject_token: userToken(),
      subject_token_type: ACCESS_TOKEN_TYPE,
      resource: TARGET_AUDIENCE,
      ...overrides,
    });

  beforeEach(async () => {
    caller = await registerApp('caller', CALLER_AUDIENCE);
    target = await registerApp('target', TARGET_AUDIENCE);
    const user = await env.getService(UserService).createUserWithPassword({ email: 'exchange@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    userId = user.id;
    await grantOnTarget('target:read');
  });

  it('should mint a token carrying the same user, organisation and session', async () => {
    const response = await exchangeAsCaller();
    expect(response.statusCode).toBe(200);

    const body = response.json() as { access_token: string; issued_token_type: string; scope: string };
    expect(body.issued_token_type).toBe(ACCESS_TOKEN_TYPE);

    const claims = env.getService(KeyService).verify(body.access_token);
    expect(claims).toMatchObject({ sub: userId.toString(), aud: TARGET_AUDIENCE, org: '42', sid: '77', client_id: caller.clientId });
  });

  it('should name the calling application in a mandatory act claim', async () => {
    const body = (await exchangeAsCaller()).json() as { access_token: string };
    const claims = env.getService(KeyService).verify(body.access_token);
    expect(claims?.act).toEqual({ sub: caller.clientId });
  });

  it('should bound the scope by the caller’s grants on the target, not the user’s consent', async () => {
    const body = (await exchangeAsCaller()).json() as { scope: string };
    expect(body.scope).toBe('target:read');
  });

  it('should let a request narrow the scope but never widen it', async () => {
    await grantOnTarget('target:write');
    expect(((await exchangeAsCaller({ scope: 'target:write' })).json() as { scope: string }).scope).toBe('target:write');

    const widened = await exchangeAsCaller({ scope: 'target:admin' });
    expect(widened.statusCode).toBe(400);
  });

  it('should never mint a sensitive scope into an exchanged token', async () => {
    await grantOnTarget('target:purge', true);
    expect(((await exchangeAsCaller()).json() as { scope: string }).scope).toBe('target:read');
    expect((await exchangeAsCaller({ scope: 'target:purge' })).statusCode).toBe(400);
  });

  it('should omit aal even when the subject token was elevated', async () => {
    const elevated = userToken({ aal: 'AAL2' });
    const body = (await exchangeAsCaller({ subject_token: elevated })).json() as { access_token: string };
    expect(env.getService(KeyService).verify(body.access_token)?.aal).toBeUndefined();
  });

  it('should cap the lifetime at the subject token’s own expiry', async () => {
    const shortLived = userToken({ ttlSeconds: 30 });
    const body = (await exchangeAsCaller({ subject_token: shortLived })).json() as { expires_in: number };
    expect(body.expires_in).toBeLessThanOrEqual(30);
  });

  it('should refuse a subject token that is already delegated (single hop)', async () => {
    const chained = userToken({ actorClientId: 'some-other-app' });
    const response = await exchangeAsCaller({ subject_token: chained });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'invalid_grant' });
  });

  it('should refuse a caller that does not own the subject token audience', async () => {
    await env.getService(OAuthClientService).grantScope(target.clientId, await callerScopeId());
    const response = await exchange(target, {
      grant_type: TOKEN_EXCHANGE_GRANT,
      subject_token: userToken(),
      subject_token_type: ACCESS_TOKEN_TYPE,
      resource: TARGET_AUDIENCE,
    });
    expect(response.statusCode).toBe(400);
  });

  const callerScopeId = async (): Promise<string> => {
    const clients = env.getService(OAuthClientService);
    const resources = await clients.listResources();
    const resource = resources.find(candidate => candidate.identifier === TARGET_AUDIENCE);
    if (!resource) throw new Error('target resource was not provisioned');
    return clients.createScope(resource.id, 'target:borrowed');
  };

  it('should refuse a caller holding no grant on the target', async () => {
    const response = await exchangeAsCaller({ resource: CALLER_AUDIENCE });
    expect(response.statusCode).toBe(400);
  });

  it('should refuse an exchange to an application the subject user may not reach (invalid_target)', async () => {
    await env.getPostgresClient().update(schema.applications).set({ visibility: 'RESTRICTED' }).where(eq(schema.applications.id, target.applicationId));
    await env.getService(ApplicationAccessService).invalidateGlobal();

    const response = await exchangeAsCaller();
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'invalid_target' });
  });

  it('should refuse a service token as the subject', async () => {
    const serviceToken = env
      .getService(AccessTokenService)
      .mintAccessToken({ subject: caller.clientId, audience: CALLER_AUDIENCE, scope: '', clientId: caller.clientId, ttlSeconds: 600, actorType: 'service' }).token;
    expect((await exchangeAsCaller({ subject_token: serviceToken })).statusCode).toBe(400);
  });

  it('should refuse a malformed or foreign subject token', async () => {
    expect((await exchangeAsCaller({ subject_token: 'not-a-token' })).statusCode).toBe(400);
  });

  it('should require the subject token type, a resource, and refuse an actor token', async () => {
    expect((await exchangeAsCaller({ subject_token_type: undefined })).statusCode).toBe(400);
    expect((await exchangeAsCaller({ resource: undefined })).statusCode).toBe(400);
    expect((await exchangeAsCaller({ actor_token: userToken() })).statusCode).toBe(400);
    expect((await exchangeAsCaller({ requested_token_type: 'urn:ietf:params:oauth:token-type:id_token' })).statusCode).toBe(400);
  });

  it('should advertise the grant in discovery', async () => {
    const discovery = await env.getRouter().mockRequest().get('/.well-known/openid-configuration');
    expect((discovery.json() as { grant_types_supported: string[] }).grant_types_supported).toContain(TOKEN_EXCHANGE_GRANT);
  });
});
