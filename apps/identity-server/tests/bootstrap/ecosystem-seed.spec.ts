/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { OAuthClientService } from '@server/modules/auth/oauth';
import { ServiceAccessService } from '@server/modules/authz';
import { EcosystemSeedService } from '@server/modules/bootstrap';
import { OAuthClient, schema } from '@server/modules/infrastructure/datastore';
import { ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('ecosystem_seed').init();
const ECOSYSTEM_APPS = ['pulse', 'novel-forge', 'webnovel'];

async function findClient(applicationName: string, clientName: string, kind: OAuthClient.Kind): Promise<OAuthClient | null> {
  const application = env.getService(ApplicationService).getApplicationOrThrow(applicationName);
  const clients = await env.getService(OAuthClientService).listClients();
  return clients.find(client => client.applicationId === application.id && client.name === clientName && client.kind === kind) ?? null;
}

describe('EcosystemSeedService', () => {
  it('should provision an application and API resource for every ecosystem app', async () => {
    const applications = env.getService(ApplicationService);
    const resources = await env.getService(OAuthClientService).listResources();
    for (const name of ECOSYSTEM_APPS) {
      expect(applications.getApplication(name)).not.toBeNull();
      expect(resources.some(resource => resource.identifier === `${name}-server`)).toBe(true);
    }
  });

  it('should provision authorization_code + PKCE relying-party clients with callback redirects', async () => {
    for (const name of ECOSYSTEM_APPS) {
      const client = await findClient(name, name, 'WEB_CONFIDENTIAL');
      expect(client).not.toBeNull();
      expect(client?.grantTypes).toEqual(['authorization_code', 'refresh_token']);
      expect(client?.requirePkce).toBe(true);
      expect(client?.isFirstParty).toBe(true);

      const detail = await env.getService(OAuthClientService).getClientDetail(client!.id);
      expect(detail?.redirectUris).toContain(`http://${name}.shadow-apps.test/api/auth/callback`);
      expect(detail?.redirectUris?.some(uri => uri.startsWith('http://localhost:') && uri.endsWith('/api/auth/callback'))).toBe(true);
    }
  });

  it('should provision client_credentials service clients holding the identity-side scopes', async () => {
    for (const name of ECOSYSTEM_APPS) {
      const client = await findClient(name, `${name}-server`, 'SERVICE');
      expect(client).not.toBeNull();
      expect(client?.grantTypes).toEqual(['client_credentials']);
      expect(client?.tokenEndpointAuthMethod).toBe('client_secret_basic');

      const scopes = await env.getService(OAuthClientService).getGrantedScopeNames(client!.id);
      expect(scopes).toContain('authz:check');
      expect(scopes).toContain('authz:roles:sync');
    }
  });

  it('should provision the identity-server service client under the platform application', async () => {
    const client = await findClient('shadow-identity', 'identity-server', 'SERVICE');
    expect(client).not.toBeNull();
    expect(client?.grantTypes).toEqual(['client_credentials']);
  });

  it('should grant webnovel:publish to novel-forge-server', async () => {
    const client = await findClient('novel-forge', 'novel-forge-server', 'SERVICE');
    const scopes = await env.getService(OAuthClientService).getGrantedScopeNames(client!.id);
    expect(scopes).toContain('webnovel:publish');
  });

  it('should allow identity-server to POST notifications to pulse', async () => {
    const pulse = env.getService(ApplicationService).getApplicationOrThrow('pulse');
    const identityClient = await findClient('shadow-identity', 'identity-server', 'SERVICE');
    const rules = await env.getService(ServiceAccessService).listForApplication(pulse.id);
    expect(rules.some(rule => rule.callerClientId === identityClient?.id && rule.method === 'POST' && rule.pathPattern === '/api/v1/notifications')).toBe(true);
  });

  it('should allow novel-forge-server to call the internal webnovel routes', async () => {
    const webnovel = env.getService(ApplicationService).getApplicationOrThrow('webnovel');
    const novelForgeServer = await findClient('novel-forge', 'novel-forge-server', 'SERVICE');
    const rules = await env.getService(ServiceAccessService).listForApplication(webnovel.id);
    expect(rules.some(rule => rule.callerClientId === novelForgeServer?.id && rule.method === '*' && rule.pathPattern === '/internal/*')).toBe(true);
  });

  it('should issue a client_credentials token to a seeded service client over the token endpoint', async () => {
    const client = await findClient('novel-forge', 'novel-forge-server', 'SERVICE');
    const secret = await env.getService(OAuthClientService).rotateSecret(client!.id);

    const response = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .body({ grant_type: 'client_credentials', client_id: client!.id, client_secret: secret, scope: 'webnovel:publish', resource: 'webnovel-server' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { access_token: string; token_type: string; scope: string };
    expect(body.token_type).toBe('Bearer');
    expect(body.scope).toBe('webnovel:publish');
    const claims = JSON.parse(Buffer.from(body.access_token.split('.')[1] as string, 'base64url').toString()) as Record<string, unknown>;
    expect(claims.aud).toBe('webnovel-server');
    expect(claims.client_id).toBe(client!.id);
  });

  it('should be idempotent and converge when run again', async () => {
    const seed = env.getService(EcosystemSeedService);
    await seed.seed();
    await seed.seed();

    const clients = await env.getService(OAuthClientService).listClients();
    for (const name of ECOSYSTEM_APPS) {
      expect(clients.filter(client => client.name === name)).toHaveLength(1);
      expect(clients.filter(client => client.name === `${name}-server`)).toHaveLength(1);
    }

    const pulse = env.getService(ApplicationService).getApplicationOrThrow('pulse');
    const rules = await env.getService(ServiceAccessService).listForApplication(pulse.id);
    expect(rules.filter(rule => rule.pathPattern === '/api/v1/notifications')).toHaveLength(1);

    const applications = await env.getPostgresClient().select().from(schema.applications);
    expect(applications.filter(application => ECOSYSTEM_APPS.includes(application.name))).toHaveLength(3);
  });
});
