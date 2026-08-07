import { beforeEach, describe, expect, it } from 'bun:test';

import { AccessTokenService, applicationAudience, OAuthClientService } from '@server/modules/auth/oauth';
import { ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

interface SelfDescription {
  appId: string;
  name?: string;
  isFirstParty: boolean;
  audience?: string;
  redirectUris: string[];
  scopes: string[];
  sensitiveScopes: string[];
  grants: { audience: string; scopes: string[] }[];
  accessTokenTtl: number;
}

const env = new TestEnvironment('apps-self').init();

const ORIGIN = 'https://reports.example.com';

describe('GET /api/v1/apps/me', () => {
  let clientId: string;
  let applicationId: number;

  const serviceToken = (subject = clientId, scope = '') =>
    env.getService(AccessTokenService).mintAccessToken({ subject, audience: 'shadow-identity', scope, clientId: subject, ttlSeconds: 60, actorType: 'service' }).token;

  const describeSelf = (token?: string) => {
    const chain = env.getRouter().mockRequest().get('/api/v1/apps/me');
    return token ? chain.headers({ authorization: `Bearer ${token}` }) : chain;
  };

  beforeEach(async () => {
    const application = await env.getService(ApplicationService).createApplication({ name: 'reports', subDomain: 'reports' });
    applicationId = application.id;
    const provisioned = await env.getService(OAuthClientService).provisionApplicationIdentity({ applicationId, name: 'reports', publicUrls: [ORIGIN] });
    clientId = provisioned.clientId;
  });

  it('should describe the caller’s own registration', async () => {
    const response = await describeSelf(serviceToken());
    expect(response.statusCode).toBe(200);
    expect(response.json() as SelfDescription).toMatchObject({
      appId: 'reports',
      isFirstParty: true,
      audience: 'api://reports',
      redirectUris: [`${ORIGIN}/api/auth/callback`],
    });
  });

  it('should separate the scopes its api defines from the sensitive ones', async () => {
    const clients = env.getService(OAuthClientService);
    const resource = (await clients.listResources()).find(candidate => candidate.identifier === applicationAudience('reports'));
    if (!resource) throw new Error('the application resource was not provisioned');
    await clients.createScope(resource.id, 'reports:read');
    await clients.createScope(resource.id, 'reports:purge', undefined, true);

    const body = (await describeSelf(serviceToken())).json() as SelfDescription;
    expect(body.scopes).toEqual(['reports:read']);
    expect(body.sensitiveScopes).toEqual(['reports:purge']);
  });

  it('should list grants on other applications but never its own surface', async () => {
    const clients = env.getService(OAuthClientService);
    const own = (await clients.listResources()).find(candidate => candidate.identifier === applicationAudience('reports'));
    if (!own) throw new Error('the application resource was not provisioned');
    await clients.grantScope(clientId, await clients.createScope(own.id, 'reports:read'));

    const other = await env.getService(ApplicationService).createApplication({ name: 'billing', subDomain: 'billing' });
    const otherResource = await clients.ensureResource(other.id, applicationAudience('billing'));
    await clients.grantScope(clientId, await clients.createScope(otherResource.id, 'billing:read'));

    const body = (await describeSelf(serviceToken())).json() as SelfDescription;
    expect(body.grants).toEqual([{ audience: 'api://billing', scopes: ['billing:read'] }]);
  });

  it('should require a service token and answer only about the caller', async () => {
    expect((await describeSelf()).statusCode).toBe(401);

    expect((await describeSelf(serviceToken('vanished-client'))).statusCode).toBe(401);
  });

  it('should need no scope beyond a valid service token', async () => {
    expect((await describeSelf(serviceToken(clientId, ''))).statusCode).toBe(200);
  });

  describe('1:1 provisioning', () => {
    it('should derive one client and one api://<app> resource from the application', async () => {
      const clients = env.getService(OAuthClientService);
      const registered = await clients.listClients(applicationId);
      expect(registered.map(client => client.id)).toEqual(['reports']);

      const resources = (await clients.listResources()).filter(resource => resource.identifier.includes('reports'));
      expect(resources.map(resource => resource.identifier)).toEqual(['api://reports']);
    });

    it('should be idempotent and never mint a second credential', async () => {
      const again = await env.getService(OAuthClientService).provisionApplicationIdentity({ applicationId, name: 'reports', publicUrls: [ORIGIN] });
      expect(again).toMatchObject({ clientId: 'reports', audience: 'api://reports', created: false });
      expect(again.secret).toBeUndefined();
      expect((await env.getService(OAuthClientService).listClients(applicationId)).length).toBe(1);
    });
  });

  it('should publish the global first-party endpoints in discovery', async () => {
    const discovery = await env.getRouter().mockRequest().get('/.well-known/openid-configuration');
    const body = discovery.json() as { issuer: string; step_up_endpoint: string; app_session_endpoint: string };
    expect(body.step_up_endpoint).toBe(`${body.issuer}/step-up`);
    expect(body.app_session_endpoint).toBe(`${body.issuer}/api/v1/app-sessions`);
  });
});
