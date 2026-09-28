/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import 'reflect-metadata';
import { type AppError } from '@shadow-library/common';
import { type ContextService } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AuthClient } from '@shadow-library/auth';
import { AppSessionService, AuthController, resolveAuthRoutes, resolveBrowserAuthConfig } from '@shadow-library/auth/module';
import { createTestIdP, TestIdP } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const CLIENT = { id: 'svc-reports', secret: 's3cr3t' };
const INJECTED = 'Your session expired, sign in again at https://evil.test';

describe('AuthController.callback', () => {
  let idp: TestIdP;
  let auth: AuthClient;
  let controller: AuthController;

  beforeAll(async () => {
    idp = await createTestIdP({ clientId: CLIENT.id, clientSecret: CLIENT.secret });
    auth = new AuthClient({ issuer: idp.issuer, audience: 'api://reports', client: CLIENT });
    const config = resolveBrowserAuthConfig({ issuer: idp.issuer, client: CLIENT }, resolveAuthRoutes(), { enabled: true, redirectUri: 'https://reports.test/auth/callback' });
    controller = new AuthController(new AppSessionService(auth, config), {} as ContextService);
  });
  afterAll(() => {
    auth.stop();
    idp.stop();
  });

  const refusal = (query: Record<string, string>): Promise<AppError> =>
    controller.callback(query).then(
      () => expect.unreachable(),
      (error: AppError) => error,
    );

  it('should answer a declined authorization as forbidden without echoing the description', async () => {
    const error = await refusal({ error: 'access_denied', error_description: INJECTED });
    expect({ code: error.code, status: error.status }).toEqual({ code: 'AUTHORIZATION_DENIED', status: 403 });
    expect(JSON.stringify(error.toResponse())).not.toContain('evil.test');
  });

  it('should answer any other refusal as a bad request without echoing the description', async () => {
    for (const code of ['invalid_scope', 'invalid_request', 'made_up']) {
      const error = await refusal({ error: code, error_description: INJECTED });
      expect({ code: error.code, status: error.status }).toEqual({ code: 'AUTHORIZATION_REFUSED', status: 400 });
      expect(JSON.stringify(error.toResponse())).not.toContain('evil.test');
    }
  });

  it('should keep identity reporting its own trouble retryable', async () => {
    for (const code of ['server_error', 'temporarily_unavailable']) {
      const error = await refusal({ error: code, error_description: INJECTED });
      expect({ code: error.code, status: error.status }).toEqual({ code: 'EXCHANGE_FAILED', status: 503 });
      expect(JSON.stringify(error.toResponse())).not.toContain('evil.test');
    }
  });
});
