/**
 * Importing npm packages
 */
import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext } from '../../lib';
import { expectErrorCode } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Request-level assertions on identity's error contract — driven through raw `APIRequestContext`s (no browser)
 * so the exact status and machine `code` are observable. These exercise the boundaries a UI can't easily reach:
 * an expired flow, the OAuth token endpoint's content-type and client-auth rules, an unauthenticated userinfo
 * call, and the CSRF double-submit guard. The CSRF checks use a real user session but deliberately never send a
 * valid token, so the guarded mutation is always refused and the session is left intact.
 */

/** A well-formed but non-existent flow id — the server must treat it as an expired/unknown flow, not a validation error. */
const UNKNOWN_FLOW_ID = 'flow_auth_00000000-0000-0000-0000-000000000000';

test.describe('identity API error contract', () => {
  let anonymous: APIRequestContext;

  test.beforeAll(async () => {
    anonymous = await apiContext('identity');
  });

  test.afterAll(async () => {
    await anonymous.dispose();
  });

  test('should answer an unknown flow id on challenge/verify with 410 AUTH_001', async () => {
    const response = await anonymous.post('/api/v1/auth/challenge/verify', { data: { flowId: UNKNOWN_FLOW_ID, password: 'irrelevant' } });
    expect(response.status()).toBe(410);
    await expectErrorCode(response, 'AUTH_001');
  });

  test('should reject a JSON body on the OAuth token endpoint with 400 invalid_request', async () => {
    // The token endpoint is form-encoded only (RFC 6749); a JSON body is a malformed request, not a client-auth failure.
    const response = await anonymous.post('/oauth2/token', { data: { grant_type: 'client_credentials' } });
    expect(response.status()).toBe(400);
    await expectErrorCode(response, 'invalid_request');
  });

  test('should reject bogus client credentials on the OAuth token endpoint with 401 invalid_client', async () => {
    // Correct form encoding, unknown client — client authentication fails before any grant is considered.
    const response = await anonymous.post('/oauth2/token', { form: { grant_type: 'client_credentials', client_id: 'no-such-client', client_secret: 'wrong' } });
    expect(response.status()).toBe(401);
    await expectErrorCode(response, 'invalid_client');
  });

  test('should reject userinfo without a usable bearer token with 401', async () => {
    const missing = await anonymous.get('/oauth2/userinfo');
    expect(missing.status()).toBe(401);

    const garbage = await anonymous.get('/oauth2/userinfo', { headers: { authorization: 'Bearer not-a-real-token' } });
    expect(garbage.status()).toBe(401);
  });

  test('should refuse a session-cookie mutation that is missing or carries a mismatched CSRF token', async () => {
    // A real user session (its storage state carries `__Host-sid` + `csrf-token`), so the double-submit guard is
    // engaged. We never echo the matching token, so signout is always blocked — user2's session is untouched and
    // the account/security specs that share it keep working.
    const session = await apiContext('identity', 'user2');
    try {
      const withoutToken = await session.post('/api/v1/auth/signout');
      expect(withoutToken.status(), 'signout with no x-csrf-token must be refused').toBe(403);
      await expectErrorCode(withoutToken, 'S010');

      const withMismatch = await session.post('/api/v1/auth/signout', { headers: { 'x-csrf-token': 'deadbeefdeadbeefdeadbeef' } });
      expect(withMismatch.status(), 'signout with a mismatched x-csrf-token must be refused').toBe(403);
      await expectErrorCode(withMismatch, 'S010');
    } finally {
      await session.dispose();
    }
  });
});
