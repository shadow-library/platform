/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AccessTokenService, OAuthClientService } from '@server/modules/auth/oauth';
import { ServiceAccessService } from '@server/modules/authz';
import { ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('service-access').init();

describe('ServiceAccessService', () => {
  let service: ServiceAccessService;
  let applicationId: number;
  let targetClientId: string;
  let callerClientId: string;

  beforeEach(async () => {
    service = env.getService(ServiceAccessService);
    const applications = env.getService(ApplicationService);
    const clients = env.getService(OAuthClientService);
    const application = await applications.createApplication({ name: `svc-access-${Date.now()}`, subDomain: `sa${Date.now()}` });
    applicationId = application.id;
    targetClientId = (await clients.register({ applicationId, name: 'Target Service', kind: 'SERVICE', grantTypes: ['client_credentials'] })).clientId;
    callerClientId = (await clients.register({ applicationId, name: 'Caller Service', kind: 'SERVICE', grantTypes: ['client_credentials'] })).clientId;
  });

  it('should create, list, and idempotently re-create rules', async () => {
    const rule = await service.create({ applicationId, callerClientId, method: 'post', pathPattern: '/api/v1/index' });
    expect(rule).toMatchObject({ applicationId, callerClientId, method: 'POST', pathPattern: '/api/v1/index' });

    const again = await service.create({ applicationId, callerClientId, method: 'POST', pathPattern: '/api/v1/index' });
    expect(again.id).toBe(rule.id);
    expect(await service.listForApplication(applicationId)).toHaveLength(1);
  });

  it('should reject malformed methods, paths, and unknown callers', async () => {
    await expect(service.create({ applicationId, callerClientId, method: 'YEET', pathPattern: '/x' })).rejects.toThrow();
    await expect(service.create({ applicationId, callerClientId, method: 'GET', pathPattern: 'no-slash' })).rejects.toThrow();
    await expect(service.create({ applicationId, callerClientId: crypto.randomUUID(), method: 'GET', pathPattern: '/x' })).rejects.toThrow();
  });

  it('should resolve the rules of the caller’s own application from its client id', async () => {
    await service.create({ applicationId, callerClientId, method: 'POST', pathPattern: '/api/v1/index' });
    const rules = await service.listForClient(targetClientId);
    expect(rules.some(rule => rule.callerClientId === callerClientId)).toBe(true);
    await expect(service.listForClient('not-a-uuid')).rejects.toThrow();
  });

  it('should delete rules', async () => {
    const rule = await service.create({ applicationId, callerClientId, method: 'DELETE', pathPattern: '/api/v1/jobs/*' });
    expect(await service.delete(rule.id)).toBe(true);
    expect(await service.delete(rule.id)).toBe(false);
  });

  describe('over the HTTP service-access endpoint', () => {
    const serviceToken = (subject: string, scope = 'authz:check') =>
      env.getService(AccessTokenService).mintAccessToken({ subject, audience: 'shadow-identity', scope, clientId: subject, ttlSeconds: 60, actorType: 'service' }).token;

    it('should return the caller application’s rules with sdk field names', async () => {
      await service.create({ applicationId, callerClientId, method: 'POST', pathPattern: '/api/v1/index' });
      const response = await env
        .getRouter()
        .mockRequest()
        .get('/api/v1/authz/service-access')
        .headers({ authorization: `Bearer ${serviceToken(targetClientId)}` });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { rules: { callerClientId: string; method: string; path: string }[] };
      expect(body.rules.some(rule => rule.callerClientId === callerClientId && rule.method === 'POST' && rule.path === '/api/v1/index')).toBe(true);
    });

    it('should reject unauthenticated calls and tokens lacking the authz:check scope', async () => {
      expect((await env.getRouter().mockRequest().get('/api/v1/authz/service-access')).statusCode).toBe(401);
      const response = await env
        .getRouter()
        .mockRequest()
        .get('/api/v1/authz/service-access')
        .headers({ authorization: `Bearer ${serviceToken(targetClientId, 'authz:roles:sync')}` });
      expect(response.statusCode).toBe(403);
    });
  });
});
