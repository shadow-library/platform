/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';
import { RateLimiterService } from '@server/modules/infrastructure/security';

import { csrfPair, TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

type Method = 'get' | 'post' | 'delete';

/**
 * Declaring the constants
 */
const env = new TestEnvironment('org-invitation').init();

describe('Organisation invitations', () => {
  let ownerId: bigint;
  let ownerSecret: string;
  let orgId: string;

  const request = (method: Method, path: string, secret: string, body?: Record<string, unknown>) => {
    const csrf = csrfPair();
    const base = env.getRouter().mockRequest()[method](path);
    const chain = base.headers({ 'x-csrf-token': csrf.header }).cookies({ [SESSION_COOKIE_NAME]: secret, 'csrf-token': csrf.cookie });
    return body ? chain.body(body) : chain;
  };

  const session = async (userId: bigint) => (await env.getService(SessionService).create({ userId, aal: 'AAL1' })).secret;

  /** The invitation email rides the outbox; tests read the token exactly where the invitee would. */
  const latestToken = async (email: string): Promise<string> => {
    const rows = await env.getPostgresClient().query.notificationOutbox.findMany({ where: eq(schema.notificationOutbox.templateKey, 'organisation-invitation') });
    const payloads = rows.filter(row => (row.recipients as { email?: string }).email === email).map(row => row.payload as { token: string });
    const last = payloads.at(-1);
    if (!last) throw new Error(`No invitation email for ${email}`);
    return last.token;
  };

  const invite = (email: string, role: 'ADMIN' | 'MEMBER' = 'MEMBER') => request('post', `/api/v1/organisations/${orgId}/invitations`, ownerSecret, { email, role });

  beforeEach(async () => {
    const users = env.getService(UserService);
    ownerId = (await users.createUserWithPassword({ email: 'owner@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true })).id;
    ownerSecret = await session(ownerId);
    const organisation = await env.getService(OrganisationService).createTeam(ownerId, { name: 'Invite Team' });
    orgId = organisation.id.toString();
  });

  it('should answer identically for registered and unregistered addresses', async () => {
    await env.getService(UserService).createUserWithPassword({ email: 'known@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    const known = await invite('known@example.com');
    const unknown = await invite('ghost@example.com');
    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(200);
    expect(known.json()).toEqual(unknown.json());
  });

  it('should let an invitee with the verified address accept and join', async () => {
    const invitee = await env.getService(UserService).createUserWithPassword({ email: 'invitee@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    await invite('invitee@example.com', 'ADMIN');
    const token = await latestToken('invitee@example.com');

    const response = await request('post', '/api/v1/me/invitations/accept', await session(invitee.id), { token });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: orgId, name: 'Invite Team' });

    const membership = await env.getService(OrganisationService).getMembership(invitee.id, BigInt(orgId));
    expect(membership?.role).toBe('ADMIN');
  });

  it('should refuse acceptance when the caller does not hold the invited address', async () => {
    await invite('someoneelse@example.com');
    const token = await latestToken('someoneelse@example.com');
    const stranger = await env.getService(UserService).createUserWithPassword({ email: 'stranger@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });

    const response = await request('post', '/api/v1/me/invitations/accept', await session(stranger.id), { token });
    expect(response.statusCode).toBe(404);
  });

  it('should let an invitation issued before registration resolve after signup', async () => {
    await invite('future@example.com');
    const token = await latestToken('future@example.com');

    const later = await env.getService(UserService).createUserWithPassword({ email: 'future@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    const response = await request('post', '/api/v1/me/invitations/accept', await session(later.id), { token });
    expect(response.statusCode).toBe(200);
    expect(await env.getService(OrganisationService).getMembership(later.id, BigInt(orgId))).not.toBeNull();
  });

  it('should expire invitations', async () => {
    const invitee = await env.getService(UserService).createUserWithPassword({ email: 'late@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    await invite('late@example.com');
    const token = await latestToken('late@example.com');
    await env
      .getPostgresClient()
      .update(schema.organisationInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.organisationInvitations.email, 'late@example.com'));

    const response = await request('post', '/api/v1/me/invitations/accept', await session(invitee.id), { token });
    expect(response.statusCode).toBe(404);
  });

  it('should kill the token when the invitation is revoked', async () => {
    const invitee = await env.getService(UserService).createUserWithPassword({ email: 'revoked@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    await invite('revoked@example.com');
    const token = await latestToken('revoked@example.com');

    const list = await request('get', `/api/v1/organisations/${orgId}/invitations`, ownerSecret);
    const invitationId = (list.json() as { invitations: { id: string }[] }).invitations[0]?.id;
    const revoke = await request('delete', `/api/v1/organisations/${orgId}/invitations/${invitationId}`, ownerSecret);
    expect(revoke.statusCode).toBe(200);

    const response = await request('post', '/api/v1/me/invitations/accept', await session(invitee.id), { token });
    expect(response.statusCode).toBe(404);
  });

  it('should supersede a pending invitation on re-invite', async () => {
    const invitee = await env.getService(UserService).createUserWithPassword({ email: 'twice@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    await invite('twice@example.com');
    const firstToken = await latestToken('twice@example.com');
    await invite('twice@example.com');
    const secondToken = await latestToken('twice@example.com');
    expect(secondToken).not.toBe(firstToken);

    const secret = await session(invitee.id);
    expect((await request('post', '/api/v1/me/invitations/accept', secret, { token: firstToken })).statusCode).toBe(404);
    expect((await request('post', '/api/v1/me/invitations/accept', secret, { token: secondToken })).statusCode).toBe(200);
  });

  it('should let an invitee decline once', async () => {
    const invitee = await env.getService(UserService).createUserWithPassword({ email: 'decline@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    await invite('decline@example.com');
    const token = await latestToken('decline@example.com');
    const secret = await session(invitee.id);

    expect((await request('post', '/api/v1/me/invitations/decline', secret, { token })).statusCode).toBe(200);
    expect((await request('post', '/api/v1/me/invitations/accept', secret, { token })).statusCode).toBe(404);
    expect(await env.getService(OrganisationService).getMembership(invitee.id, BigInt(orgId))).toBeNull();
  });

  it('should refuse invitations from non-admin members', async () => {
    const member = await env.getService(UserService).createUserWithPassword({ email: 'plain@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    await env.getService(OrganisationService).ensureMember(BigInt(orgId), member.id, 'MEMBER');
    const response = await request('post', `/api/v1/organisations/${orgId}/invitations`, await session(member.id), { email: 'x@example.com', role: 'MEMBER' });
    expect(response.statusCode).toBe(403);
  });

  it('should rate limit invitation sending per organisation', async () => {
    const limiter = env.getService(RateLimiterService);
    limiter.enabled = true;
    try {
      for (let index = 0; index < 20; index += 1) {
        const response = await invite(`bulk-${index}@example.com`);
        expect(response.statusCode).toBe(200);
      }
      const throttled = await invite('bulk-final@example.com');
      expect(throttled.statusCode).toBe(429);
    } finally {
      limiter.enabled = false;
      await env.getRedisClient().flushdb();
    }
  });
});
