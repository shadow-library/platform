/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { OAuthClientService } from '@server/modules/auth/oauth';
import { ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('oauth-client').init();

describe('OAuthClientService', () => {
  let service: OAuthClientService;
  let applicationId: number;

  beforeEach(async () => {
    service = env.getService(OAuthClientService);
    applicationId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
  });

  it('should register a confidential client with a one-time secret', async () => {
    const { clientId, secret } = await service.register({
      applicationId,
      name: 'Pulse Web',
      kind: 'WEB_CONFIDENTIAL',
      grantTypes: ['authorization_code', 'refresh_token'],
      redirectUris: ['https://pulse.shadow-apps.com/auth/callback'],
    });

    expect(clientId).toMatch(/^[0-9a-f-]{36}$/);
    expect(secret).toBeTruthy();
    expect(await service.verifySecret(clientId, secret ?? '')).toBe(true);
    expect(await service.verifySecret(clientId, 'wrong-secret')).toBe(false);

    const client = await service.getClient(clientId);
    expect(client?.tokenEndpointAuthMethod).toBe('client_secret_basic');
    expect(client?.requirePkce).toBe(true);
  });

  it('should register a public client without a secret', async () => {
    const { clientId, secret } = await service.register({ applicationId, name: 'SPA', kind: 'SPA_PUBLIC', grantTypes: ['authorization_code', 'refresh_token'] });
    expect(secret).toBeUndefined();
    const client = await service.getClient(clientId);
    expect(client?.tokenEndpointAuthMethod).toBe('none');
  });

  it('should match redirect URIs exactly', async () => {
    const { clientId } = await service.register({
      applicationId,
      name: 'Client',
      kind: 'WEB_CONFIDENTIAL',
      grantTypes: ['authorization_code'],
      redirectUris: ['https://app.example.com/cb'],
    });

    expect(await service.isRedirectUriAllowed(clientId, 'https://app.example.com/cb')).toBe(true);
    expect(await service.isRedirectUriAllowed(clientId, 'https://app.example.com/cb/')).toBe(false);
    expect(await service.isRedirectUriAllowed(clientId, 'https://app.example.com/cb?x=1')).toBe(false);
    expect(await service.isRedirectUriAllowed(clientId, 'https://evil.example.com/cb')).toBe(false);
  });

  it('should support secret rotation with overlap', async () => {
    const { clientId, secret } = await service.register({ applicationId, name: 'Rotating', kind: 'SERVICE', grantTypes: ['client_credentials'] });
    const rotated = await service.rotateSecret(clientId);

    expect(await service.verifySecret(clientId, rotated)).toBe(true);
    expect(await service.verifySecret(clientId, secret ?? '')).toBe(true);
  });

  it('should reject secret verification for an unknown client without leaking', async () => {
    expect(await service.verifySecret('00000000-0000-0000-0000-000000000000', 'whatever')).toBe(false);
    expect(await service.verifySecret('not-a-uuid', 'whatever')).toBe(false);
  });

  it('should register a workload-identity client with no secret and the private_key_jwt method', async () => {
    const { clientId, secret } = await service.register({
      applicationId,
      name: 'Cluster Worker',
      kind: 'SERVICE',
      grantTypes: ['client_credentials'],
      authMethod: 'workload_identity',
      workloadSubject: 'system:serviceaccount:prod:cluster-worker',
    });

    expect(secret).toBeUndefined();
    const client = await service.getClient(clientId);
    expect(client?.tokenEndpointAuthMethod).toBe('private_key_jwt');
    expect(client?.workloadSubject).toBe('system:serviceaccount:prod:cluster-worker');
  });

  it('should refuse a workload-identity client without a workload subject', async () => {
    const promise = service.register({ applicationId, name: 'No Subject', kind: 'SERVICE', grantTypes: ['client_credentials'], authMethod: 'workload_identity' });
    await expect(promise).rejects.toMatchObject({ code: 'ADM_005' });
  });

  it('should cap an application at ten OAuth clients', async () => {
    const app = await env.getService(ApplicationService).createApplication({ name: `capped-${Date.now()}`, subDomain: `capped-${Date.now()}` });
    for (let index = 0; index < 10; index += 1) {
      await service.register({ applicationId: app.id, name: `client-${index}`, kind: 'SERVICE', grantTypes: ['client_credentials'] });
    }
    const eleventh = service.register({ applicationId: app.id, name: 'client-11', kind: 'SERVICE', grantTypes: ['client_credentials'] });
    await expect(eleventh).rejects.toMatchObject({ code: 'ADM_004' });
  });
});
