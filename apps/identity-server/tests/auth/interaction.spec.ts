/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Importing user defined packages
 */
import { OAuthClientService } from '@server/modules/auth/oauth';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { UserService } from '@server/modules/identity/user';
import { ApplicationService } from '@server/modules/system/application';

import { TestEnvironment, csrfPair } from '../test-environment';

/**
 * Defining types
 */

interface PromptBody {
  clientName: string;
  isFirstParty: boolean;
  alreadyGranted: boolean;
  scopes: { name: string; description?: string; isSensitive: boolean }[];
}

/**
 * Declaring the constants
 */
const env = new TestEnvironment('interaction').init();
const REDIRECT_URI = 'https://thirdparty.example.com/callback';

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
};

describe('UI interaction surface', () => {
  let clientId: string;
  let userId: bigint;
  let sessionSecret: string;

  const request = (method: 'get' | 'post', path: string, cookie = sessionSecret) => {
    const csrf = csrfPair();
    const chain = env.getRouter().mockRequest()[method](path);
    return chain.headers({ 'x-csrf-token': csrf.header }).cookies({ [SESSION_COOKIE_NAME]: cookie, 'csrf-token': csrf.cookie });
  };

  beforeEach(async () => {
    const applicationId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
    const client = await env.getService(OAuthClientService).register({
      applicationId,
      name: 'Acme Analytics',
      kind: 'WEB_CONFIDENTIAL',
      isFirstParty: false,
      grantTypes: ['authorization_code'],
      redirectUris: [REDIRECT_URI],
    });
    clientId = client.clientId;

    const user = await env.getService(UserService).createUserWithPassword({
      email: 'consent@example.com',
      password: 'Password@123',
      status: 'ACTIVE',
      emailVerified: true,
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    userId = user.id;
    sessionSecret = (await env.getService(SessionService).create({ userId })).secret;
  });

  describe('GET /api/v1/me', () => {
    it('should describe the signed-in user and session assurance', async () => {
      const response = await request('get', '/api/v1/me');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ userId: userId.toString(), firstName: 'Ada', lastName: 'Lovelace', email: 'consent@example.com', aal: 'AAL1', elevated: false });
    });

    it('should require a session', async () => {
      const response = await env.getRouter().mockRequest().get('/api/v1/me');
      expect(response.statusCode).toBe(401);
    });
  });

  describe('consent prompt and decision', () => {
    it('should describe the pending prompt with scope details', async () => {
      const response = await request('get', `/api/v1/auth/consent?clientId=${clientId}&scope=openid%20email`);
      expect(response.statusCode).toBe(200);
      const body = response.json() as PromptBody;
      expect(body.clientName).toBe('Acme Analytics');
      expect(body.isFirstParty).toBe(false);
      expect(body.alreadyGranted).toBe(false);
      expect(body.scopes).toEqual([
        { name: 'openid', description: 'Confirm your identity', isSensitive: false },
        { name: 'email', description: 'Read your primary email address', isSensitive: false },
      ]);
    });

    it('should reject unknown clients without leaking existence details', async () => {
      const response = await request('get', '/api/v1/auth/consent?clientId=8e2f34dc-1111-2222-3333-444455556666&scope=openid');
      expect(response.statusCode).toBe(400);
    });

    it('should unblock the authorize redirect once consent is approved', async () => {
      const { challenge } = pkce();
      const authorizeUrl = `/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid&code_challenge=${challenge}&code_challenge_method=S256`;

      const before = await env
        .getRouter()
        .mockRequest()
        .get(authorizeUrl)
        .cookies({ [SESSION_COOKIE_NAME]: sessionSecret });
      expect(before.statusCode).toBe(302);
      expect(before.headers.location).toContain('/login');

      const approve = await request('post', '/api/v1/auth/consent').body({ clientId, scopeNames: ['openid'], decision: 'APPROVE' });
      expect(approve.statusCode).toBe(200);
      expect(approve.json()).toMatchObject({ decision: 'APPROVE' });

      const prompt = await request('get', `/api/v1/auth/consent?clientId=${clientId}&scope=openid`);
      expect((prompt.json() as PromptBody).alreadyGranted).toBe(true);

      const after = await env
        .getRouter()
        .mockRequest()
        .get(authorizeUrl)
        .cookies({ [SESSION_COOKIE_NAME]: sessionSecret });
      expect(after.statusCode).toBe(302);
      expect(after.headers.location).toStartWith(`${REDIRECT_URI}?code=`);
    });

    it('should answer denial with a validated access_denied redirect', async () => {
      const deny = await request('post', '/api/v1/auth/consent').body({ clientId, scopeNames: ['openid'], decision: 'DENY', redirectUri: REDIRECT_URI, state: 'xyz' });
      expect(deny.statusCode).toBe(200);
      expect(deny.json()).toMatchObject({ decision: 'DENY', redirectTo: `${REDIRECT_URI}?error=access_denied&state=xyz` });
    });

    it('should refuse to build a denial redirect for an unregistered uri', async () => {
      const deny = await request('post', '/api/v1/auth/consent').body({ clientId, scopeNames: ['openid'], decision: 'DENY', redirectUri: 'https://evil.example.com/steal' });
      expect(deny.statusCode).toBe(200);
      const body = deny.json() as { decision: string; redirectTo?: string };
      expect(body.redirectTo).toBeUndefined();
    });

    it('should require a session for consent decisions', async () => {
      const csrf = csrfPair();
      const response = await env
        .getRouter()
        .mockRequest()
        .post('/api/v1/auth/consent')
        .headers({ 'x-csrf-token': csrf.header })
        .cookies({ 'csrf-token': csrf.cookie })
        .body({ clientId, scopeNames: ['openid'], decision: 'APPROVE' });
      expect(response.statusCode).toBe(401);
    });
  });
});
