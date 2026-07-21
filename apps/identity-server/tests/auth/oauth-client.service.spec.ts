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
      workloadSubjects: ['system:serviceaccount:prod:cluster-worker'],
    });

    expect(secret).toBeUndefined();
    const client = await service.getClient(clientId);
    expect(client?.tokenEndpointAuthMethod).toBe('private_key_jwt');
    expect(client?.workloadSubjects).toEqual(['system:serviceaccount:prod:cluster-worker']);
  });

  it('should refuse a workload-identity client without a workload subject', async () => {
    const promise = service.register({ applicationId, name: 'No Subject', kind: 'SERVICE', grantTypes: ['client_credentials'], authMethod: 'workload_identity' });
    await expect(promise).rejects.toMatchObject({ code: 'ADM_005' });
  });

  it('should reject a reserved or malformed client id slug', async () => {
    await expect(service.register({ id: 'shadow-identity', applicationId, name: 'Reserved', kind: 'SERVICE', grantTypes: ['client_credentials'] })).rejects.toMatchObject({ code: 'ADM_006' });
    await expect(service.register({ id: 'Bad_Id', applicationId, name: 'Bad', kind: 'SERVICE', grantTypes: ['client_credentials'] })).rejects.toMatchObject({ code: 'ADM_006' });
  });

  it('should register with an admin-chosen slug id', async () => {
    const app = await env.getService(ApplicationService).createApplication({ name: `slug-${Date.now()}`, subDomain: `slug-${Date.now()}` });
    const { clientId } = await service.register({ id: 'pulse-server', applicationId: app.id, name: 'Pulse Server', kind: 'SERVICE', grantTypes: ['client_credentials'] });
    expect(clientId).toBe('pulse-server');
  });

  it('should refuse an exact workload subject already claimed by another client', async () => {
    const app = await env.getService(ApplicationService).createApplication({ name: `uniq-${Date.now()}`, subDomain: `uniq-${Date.now()}` });
    const subject = 'system:serviceaccount:prod:shared-worker';
    await service.register({ applicationId: app.id, name: 'First', kind: 'SERVICE', grantTypes: ['client_credentials'], workloadSubjects: [subject] });
    const conflict = service.register({ applicationId: app.id, name: 'Second', kind: 'SERVICE', grantTypes: ['client_credentials'], workloadSubjects: [subject] });
    await expect(conflict).rejects.toMatchObject({ code: 'ADM_007' });
  });

  it('should resolve a shared client from either bound subject and match a pattern only for its own client', async () => {
    const app = await env.getService(ApplicationService).createApplication({ name: `shared-${Date.now()}`, subDomain: `shared-${Date.now()}` });
    const web = 'system:serviceaccount:web-ns:app-web';
    const server = 'system:serviceaccount:web-ns:app-server';
    const { clientId } = await service.register({ id: 'shared-app', applicationId: app.id, name: 'Shared', kind: 'SERVICE', grantTypes: ['client_credentials'], workloadSubjects: [web, server] });
    expect((await service.resolveClientBySubject(web))?.id).toBe(clientId);
    expect((await service.resolveClientBySubject(server))?.id).toBe(clientId);

    const patterned = await service.register({ applicationId: app.id, name: 'Patterned', kind: 'SERVICE', grantTypes: ['client_credentials'], workloadSubjects: ['system:serviceaccount:fleet:*'] });
    const client = await service.getClient(patterned.clientId);
    if (!client) throw new Error('client not found');
    expect(service.subjectMatchesClient(client, 'system:serviceaccount:fleet:anything')).toBe(true);
    expect(service.subjectMatchesClient(client, 'system:serviceaccount:other:anything')).toBe(false);
    /** A pattern is unreachable by subject-only resolution. */
    expect(await service.resolveClientBySubject('system:serviceaccount:fleet:anything')).toBeNull();
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
