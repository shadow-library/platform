/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { PULSE_PERMISSIONS, PULSE_SCOPES } from '@modules/auth';
import { TEST_AUDIENCE, TEST_ORG, TestEnvironment } from '@tests/test-environment';

/**
 * Declaring the constants
 */
const testEnv = new TestEnvironment('auth_guard_test');

/** A management route gated by a PDP permission (`pulse:templates:read`) */
const MANAGEMENT_ROUTE = '/api/v1/template-groups';
/** The machine-to-machine send route gated by the `notifications:send` scope */
const SEND_ROUTE = '/api/v1/notifications';
const SEND_BODY = { templateKey: 'sign-up', recipients: { email: 'user@example.com' }, locale: 'en-US', service: 'default' };

describe('Auth Guard', () => {
  testEnv.init();

  describe('Authentication', () => {
    it('should reject a request with no bearer token', async () => {
      const response = await testEnv.getRouter().mockRequest().get(MANAGEMENT_ROUTE);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: 'SEC_001' });
    });

    it('should reject an expired token', async () => {
      const token = await testEnv.getIdP().issueToken({ sub: 'expired-user', org: TEST_ORG, audience: TEST_AUDIENCE, ttlSeconds: -120 });
      const response = await testEnv
        .getRouter()
        .mockRequest()
        .headers({ authorization: `Bearer ${token}` })
        .get(MANAGEMENT_ROUTE);

      expect(response.statusCode).toBe(401);
    });

    it('should reject a token minted for a different audience', async () => {
      const token = await testEnv.getIdP().issueToken({ sub: 'wrong-aud', org: TEST_ORG, audience: 'some-other-api' });
      const response = await testEnv
        .getRouter()
        .mockRequest()
        .headers({ authorization: `Bearer ${token}` })
        .get(MANAGEMENT_ROUTE);

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Authorization by permission', () => {
    it('should reject an authenticated user without the required permission', async () => {
      const headers = await testEnv.userHeaders({ sub: 'permissionless-user', permissions: [] });
      const response = await testEnv.getRouter().mockRequest().headers(headers).get(MANAGEMENT_ROUTE);

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'SEC_002' });
    });

    it('should allow a user granted the required permission', async () => {
      const headers = await testEnv.userHeaders({ sub: 'template-reader', permissions: [PULSE_PERMISSIONS.templatesRead] });
      const response = await testEnv.getRouter().mockRequest().headers(headers).get(MANAGEMENT_ROUTE);

      expect(response.statusCode).toBe(200);
    });

    it('should reject a service token on a permission-gated route because it carries no organisation', async () => {
      const headers = await testEnv.serviceHeaders({ scopes: [PULSE_SCOPES.notificationsSend] });
      const response = await testEnv.getRouter().mockRequest().headers(headers).get(MANAGEMENT_ROUTE);

      expect(response.statusCode).toBe(403);
    });
  });

  describe('Authorization by scope', () => {
    it('should allow a service token carrying the send scope to dispatch a notification', async () => {
      const headers = await testEnv.serviceHeaders({ scopes: [PULSE_SCOPES.notificationsSend] });
      const response = await testEnv.getRouter().mockRequest().headers(headers).post(SEND_ROUTE).body(SEND_BODY);

      expect(response.statusCode).toBe(201);
    });

    it('should reject a service token that lacks the send scope', async () => {
      const headers = await testEnv.serviceHeaders({ scopes: [] });
      const response = await testEnv.getRouter().mockRequest().headers(headers).post(SEND_ROUTE).body(SEND_BODY);

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'SEC_002' });
    });
  });
});
