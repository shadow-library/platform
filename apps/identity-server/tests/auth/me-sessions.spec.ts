/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { UserService } from '@server/modules/identity/user';

import { csrfPair, TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('me-sessions').init();

describe('Self-service session management', () => {
  let userId: bigint;
  let currentSecret: string;
  let otherSecret: string;

  const request = (method: 'get' | 'delete', path: string, cookie = currentSecret) => {
    const csrf = csrfPair();
    const chain = env.getRouter().mockRequest()[method](path);
    return chain.headers({ 'x-csrf-token': csrf.header }).cookies({ [SESSION_COOKIE_NAME]: cookie, 'csrf-token': csrf.cookie });
  };

  beforeEach(async () => {
    const user = await env.getService(UserService).createUserWithPassword({ email: 'sessions@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    userId = user.id;
    const sessions = env.getService(SessionService);
    currentSecret = (await sessions.create({ userId, aal: 'AAL2', ipAddress: '203.0.113.1', userAgent: 'TestBrowser/1.0' })).secret;
    otherSecret = (await sessions.create({ userId, aal: 'AAL1', ipAddress: '198.51.100.7', userAgent: 'OtherBrowser/2.0' })).secret;
  });

  it('should list active sessions flagging the current one', async () => {
    const response = await request('get', '/api/v1/me/sessions');
    expect(response.statusCode).toBe(200);
    const { sessions } = response.json() as { sessions: { isCurrent: boolean; userAgent?: string }[] };
    expect(sessions).toHaveLength(2);
    expect(sessions.filter(session => session.isCurrent)).toHaveLength(1);
    expect(sessions.find(session => session.isCurrent)?.userAgent).toBe('TestBrowser/1.0');
  });

  it('should require authentication for the list', async () => {
    const response = await env.getRouter().mockRequest().get('/api/v1/me/sessions');
    expect(response.statusCode).toBe(401);
  });

  it('should revoke a single session and its refresh tokens', async () => {
    const list = await request('get', '/api/v1/me/sessions');
    const { sessions } = list.json() as { sessions: { id: string; isCurrent: boolean }[] };
    const other = sessions.find(session => !session.isCurrent);

    const response = await request('delete', `/api/v1/me/sessions/${other?.id}`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ revoked: 1 });
    expect(await env.getService(SessionService).validate(otherSecret)).toBeNull();
    expect(await env.getService(SessionService).validate(currentSecret)).not.toBeNull();
  });

  it('should demand step-up for revocation', async () => {
    const response = await request('delete', '/api/v1/me/sessions', otherSecret);
    expect(response.statusCode).toBe(403);
  });

  it("should refuse to reveal or revoke another user's session", async () => {
    const stranger = await env.getService(UserService).createUserWithPassword({ email: 'stranger@example.com', password: 'Password@123', status: 'ACTIVE' });
    const strangerSession = await env.getService(SessionService).create({ userId: stranger.id });

    const response = await request('delete', `/api/v1/me/sessions/${strangerSession.session.id}`);
    expect(response.statusCode).toBe(404);
    expect(await env.getService(SessionService).validate(strangerSession.secret)).not.toBeNull();
  });

  it('should revoke all sessions except the current one', async () => {
    const sessions = env.getService(SessionService);
    await sessions.create({ userId, aal: 'AAL1' });

    const response = await request('delete', '/api/v1/me/sessions');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ revoked: 2 });
    expect(await sessions.validate(currentSecret)).not.toBeNull();
    expect(await sessions.validate(otherSecret)).toBeNull();
  });
});
