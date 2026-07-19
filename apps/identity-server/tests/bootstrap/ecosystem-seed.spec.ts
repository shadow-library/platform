/**
 * Importing npm packages
 */
import { afterEach, describe, expect, it, spyOn } from 'bun:test';

import { eq } from 'drizzle-orm';
import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { OAuthClientService } from '@server/modules/auth/oauth';
import { ServiceAccessService } from '@server/modules/authz';
import { EcosystemSeedService } from '@server/modules/bootstrap';
import { OAuthClient, schema } from '@server/modules/infrastructure/datastore';
import { ApplicationService } from '@server/modules/system/application';

import { TEST_REGEX, TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('ecosystem_seed').init();
const ECOSYSTEM_APPS = ['pulse', 'novel-forge', 'webnovel'];

const FIXED_RP_CLIENT_ID = '11111111-2222-4333-8444-555555555555';
const FIXED_SERVER_CLIENT_ID = '66666666-7777-4888-9999-aaaaaaaaaaaa';
const FIXED_CONFIG_KEYS = [
  'ecosystem.pulse.rp-client-id',
  'ecosystem.pulse.rp-client-secret',
  'ecosystem.pulse.server-client-id',
  'ecosystem.pulse.server-client-secret',
  'ecosystem.novel-forge.server-client-secret',
  'ecosystem.webnovel.rp-client-id',
] as const;

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

      /** The public origins are stored on the application itself — the callback URIs are derived from them. */
      const application = env.getService(ApplicationService).getApplicationOrThrow(name);
      expect(application.publicUrls).toContain(`http://${name}.shadow-apps.test`);
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

  it('should grant notifications:send to identity-server for its pulse dispatches', async () => {
    const client = await findClient('shadow-identity', 'identity-server', 'SERVICE');
    const scopes = await env.getService(OAuthClientService).getGrantedScopeNames(client!.id);
    expect(scopes).toContain('notifications:send');

    const resources = await env.getService(OAuthClientService).listResources();
    const pulseResource = resources.find(resource => resource.identifier === 'pulse-server');
    expect(pulseResource?.scopes.some(scope => scope.name === 'notifications:send')).toBe(true);
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

  describe('fixed credentials from the environment', () => {
    /** The suite database is cloned per test, but the config cache is process-global — always reset it. */
    afterEach(() => {
      for (const key of FIXED_CONFIG_KEYS) Config['cache'].delete(key);
    });

    async function deleteClient(applicationName: string, clientName: string, kind: OAuthClient.Kind): Promise<string> {
      const client = await findClient(applicationName, clientName, kind);
      await env
        .getPostgresClient()
        .delete(schema.oauthClients)
        .where(eq(schema.oauthClients.id, client!.id));
      return client!.id;
    }

    function listSecrets(clientId: string): Promise<unknown[]> {
      return env.getPostgresClient().select().from(schema.oauthClientSecrets).where(eq(schema.oauthClientSecrets.clientId, clientId));
    }

    it('should create clients with the environment-fixed ids and secrets', async () => {
      await deleteClient('pulse', 'pulse', 'WEB_CONFIDENTIAL');
      await deleteClient('pulse', 'pulse-server', 'SERVICE');
      Config['cache'].set('ecosystem.pulse.rp-client-id', FIXED_RP_CLIENT_ID);
      Config['cache'].set('ecosystem.pulse.rp-client-secret', 'rp-secret-from-env');
      Config['cache'].set('ecosystem.pulse.server-client-id', FIXED_SERVER_CLIENT_ID);
      Config['cache'].set('ecosystem.pulse.server-client-secret', 'server-secret-from-env');

      await env.getService(EcosystemSeedService).seed();

      const relyingParty = await findClient('pulse', 'pulse', 'WEB_CONFIDENTIAL');
      const service = await findClient('pulse', 'pulse-server', 'SERVICE');
      expect(relyingParty?.id).toBe(FIXED_RP_CLIENT_ID);
      expect(service?.id).toBe(FIXED_SERVER_CLIENT_ID);

      const oauthClients = env.getService(OAuthClientService);
      expect(await oauthClients.verifySecret(FIXED_RP_CLIENT_ID, 'rp-secret-from-env')).toBe(true);
      expect(await oauthClients.verifySecret(FIXED_SERVER_CLIENT_ID, 'server-secret-from-env')).toBe(true);
    });

    it('should adopt the environment secret, stay idempotent while it verifies and rotate when it changes', async () => {
      const seed = env.getService(EcosystemSeedService);
      const oauthClients = env.getService(OAuthClientService);
      const client = await findClient('novel-forge', 'novel-forge-server', 'SERVICE');

      Config['cache'].set('ecosystem.novel-forge.server-client-secret', 'env-secret-one');
      await seed.seed();
      expect(await oauthClients.verifySecret(client!.id, 'env-secret-one')).toBe(true);

      const secretsAfterAdoption = await listSecrets(client!.id);
      await seed.seed();
      expect(await listSecrets(client!.id)).toHaveLength(secretsAfterAdoption.length);

      Config['cache'].set('ecosystem.novel-forge.server-client-secret', 'env-secret-two');
      await seed.seed();
      expect(await oauthClients.verifySecret(client!.id, 'env-secret-two')).toBe(true);
      expect(await oauthClients.verifySecret(client!.id, 'env-secret-one')).toBe(false);
    });

    it('should keep the existing id and warn instead of re-keying a live client', async () => {
      const existing = await findClient('webnovel', 'webnovel', 'WEB_CONFIDENTIAL');
      Config['cache'].set('ecosystem.webnovel.rp-client-id', FIXED_RP_CLIENT_ID);

      const seed = env.getService(EcosystemSeedService);
      const warn = spyOn(seed['logger'], 'warn');
      await seed.seed();

      const converged = await findClient('webnovel', 'webnovel', 'WEB_CONFIDENTIAL');
      expect(converged?.id).toBe(existing!.id);
      expect(warn.mock.calls.some(call => String(call[0]).includes('refusing to re-key'))).toBe(true);
      warn.mockRestore();
    });

    it('should reject a non-UUID fixed client id with a clear error', async () => {
      Config['cache'].set('ecosystem.pulse.server-client-id', 'not-a-uuid');
      const promise = env.getService(EcosystemSeedService).seed();
      await expect(promise).rejects.toThrow("Environment variable 'ECOSYSTEM_PULSE_SERVER_CLIENT_ID' must be a UUID; received 'not-a-uuid'");
    });

    it('should fall back to a random id and one-time secret when the fixed credentials are unset', async () => {
      const previousId = await deleteClient('pulse', 'pulse', 'WEB_CONFIDENTIAL');
      await env.getService(EcosystemSeedService).seed();

      const recreated = await findClient('pulse', 'pulse', 'WEB_CONFIDENTIAL');
      expect(recreated?.id).toMatch(TEST_REGEX.uuid);
      expect(recreated?.id).not.toBe(previousId);
      expect(await listSecrets(recreated!.id)).toHaveLength(1);
    });
  });
});
