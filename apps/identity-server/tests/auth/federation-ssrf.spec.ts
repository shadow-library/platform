import { afterAll, beforeEach, describe, expect, it } from 'bun:test';

import { IdentityProviderService } from '@server/modules/auth/federation';
import { UserService } from '@server/modules/identity/user';
import { WebhookTargetGuard } from '@server/modules/infrastructure/webhook';
import { AuthModeService } from '@server/modules/system/auth-mode';

import { TestEnvironment } from '../test-environment';
import { installUpstreamIdP } from './upstream-idp';

const env = new TestEnvironment('federation-ssrf').init();
const upstream = installUpstreamIdP({ issuer: 'https://accounts.google.example', clientId: 'google-client-id' });

afterAll(() => upstream.restore());

const configureGoogle = () =>
  env.getService(IdentityProviderService).createGlobal({
    kind: 'GOOGLE',
    name: 'Google',
    issuer: upstream.issuer,
    clientId: upstream.clientId,
    clientSecret: 'google-client-secret',
    allowSignUp: true,
  });

const start = () => env.getRouter().mockRequest().post('/api/v1/auth/social/GOOGLE/start').body({});
const callback = (flowId: string) => env.getRouter().mockRequest().get('/api/v1/auth/federated/callback').query({ state: flowId, code: 'upstream-code' });

describe('Federation SSRF guard', () => {
  beforeEach(async () => {
    env.getService(WebhookTargetGuard).allowInsecureTargets = true;
    upstream.setClaims({ sub: upstream.subject, email: upstream.email, email_verified: true });
    await env.getService(AuthModeService).invalidate();
  });

  it('should refuse to register a provider whose issuer resolves to the metadata address', async () => {
    const guard = env.getService(WebhookTargetGuard);
    guard.allowInsecureTargets = false;
    guard.lookupAddresses = async () => [{ address: '169.254.169.254' }];

    await expect(configureGoogle()).rejects.toThrow();
    expect(await env.getService(IdentityProviderService).getGlobal('GOOGLE')).toBeNull();
  });

  it('should refuse a runtime token exchange when the token endpoint resolves to loopback', async () => {
    await configureGoogle();
    const started = (await start()).json() as { flowId: string; authorizationUrl: string };
    upstream.useNonceFrom(started.authorizationUrl);

    const guard = env.getService(WebhookTargetGuard);
    guard.allowInsecureTargets = false;
    guard.lookupAddresses = async () => [{ address: '127.0.0.1' }];

    const response = await callback(started.flowId);

    expect(response.headers['location']).toContain('error=federation_failed');
    expect(await env.getService(UserService).getUser(upstream.email)).toBeNull();
  });

  it('should let the dev escape hatch reach a non-resolving mock upstream end to end', async () => {
    await configureGoogle();
    const started = (await start()).json() as { flowId: string; authorizationUrl: string };
    upstream.useNonceFrom(started.authorizationUrl);

    const response = await callback(started.flowId);

    expect(response.statusCode).toBe(302);
    expect(response.headers['location']).toBe('/account');
    expect(await env.getService(UserService).getUser(upstream.email)).not.toBeNull();
  });
});
