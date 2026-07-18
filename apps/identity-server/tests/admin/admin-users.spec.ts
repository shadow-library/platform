/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { IAM_ADMIN_ROLE, PLATFORM_ORG_NAME } from '@server/modules/admin';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { PasswordService } from '@server/modules/identity/credentials';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { AuditService } from '@server/modules/infrastructure/audit';
import { schema } from '@server/modules/infrastructure/datastore';
import { ApplicationService } from '@server/modules/system/application';

import { csrfPair, TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('admin-users').init();

describe('Admin user lifecycle APIs', () => {
  let adminSecret: string;
  let targetId: string;
  let targetUserId: bigint;
  let platformOrgId: string;

  const request = (method: 'get' | 'post' | 'delete', path: string, cookie = adminSecret) => {
    const csrf = csrfPair();
    const chain = env.getRouter().mockRequest()[method](path);
    return chain.headers({ 'x-csrf-token': csrf.header }).cookies({ [SESSION_COOKIE_NAME]: cookie, 'csrf-token': csrf.cookie });
  };

  const createAdmin = async (email: string, aal: 'AAL1' | 'AAL2' = 'AAL2'): Promise<string> => {
    const admin = await env.getService(UserService).createUserWithPassword({ email, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    const application = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity');
    const role = application.roles.find(candidate => candidate.roleName === IAM_ADMIN_ROLE);
    await env.getService(PolicyDecisionService).assignRole({ type: 'USER', id: admin.id.toString() }, role?.id ?? 0, platformOrgId);
    const { secret } = await env.getService(SessionService).create({ userId: admin.id, aal });
    return secret;
  };

  beforeEach(async () => {
    const organisation = await env.getService(OrganisationService).findTeamByName(PLATFORM_ORG_NAME);
    platformOrgId = String(organisation?.id);
    adminSecret = await createAdmin('iam-admin@example.com');

    const target = await env
      .getService(UserService)
      .createUserWithPassword({ email: 'subject@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true, firstName: 'Subject', lastName: 'User' });
    targetUserId = target.id;
    targetId = target.id.toString();
  });

  it('should refuse the surface without a session and without the permission', async () => {
    const anonymous = await env.getRouter().mockRequest().get('/api/v1/admin/users');
    expect(anonymous.statusCode).toBe(401);

    const mortal = await env.getService(UserService).createUserWithPassword({ email: 'mortal@example.com', password: 'Password@123', status: 'ACTIVE' });
    const { secret } = await env.getService(SessionService).create({ userId: mortal.id, aal: 'AAL2' });
    const denied = await request('get', '/api/v1/admin/users', secret);
    expect(denied.statusCode).toBe(403);
    expect(JSON.stringify(denied.json())).toContain('ADM_001');
  });

  it('should demand step-up for mutations but not for reads', async () => {
    const aal1Admin = await createAdmin('aal1-admin@example.com', 'AAL1');
    const read = await request('get', `/api/v1/admin/users/${targetId}`, aal1Admin);
    expect(read.statusCode).toBe(200);

    const mutation = await request('post', `/api/v1/admin/users/${targetId}/unlock`, aal1Admin);
    expect(mutation.statusCode).toBe(403);
    expect(JSON.stringify(mutation.json())).toContain('AUTH_006');
  });

  it('should search users by email fragment with pagination metadata', async () => {
    const response = await request('get', '/api/v1/admin/users?email=subject&limit=10');
    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: { primaryEmail?: string }[]; total: number; offset: number; limit: number };
    expect(body.total).toBe(1);
    expect(body.offset).toBe(0);
    expect(body.limit).toBe(10);
    expect(body.items[0]?.primaryEmail).toBe('subject@example.com');
  });

  it('should expose a credential-free detail view', async () => {
    const response = await request('get', `/api/v1/admin/users/${targetId}`);
    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ id: targetId, status: 'ACTIVE', lockMode: 'NONE', passwordResetRequired: false, activeSessionCount: 0 });
    expect(JSON.stringify(body)).not.toContain('$argon2');
  });

  it('should lock fully, cutting live sessions, and unlock again', async () => {
    const { secret } = await env.getService(SessionService).create({ userId: targetUserId });
    const locked = await request('post', `/api/v1/admin/users/${targetId}/lock`).body({ mode: 'FULL' });
    expect(locked.statusCode).toBe(200);

    expect(await env.getService(SessionService).validate(secret)).toBeNull();
    const detail = await request('get', `/api/v1/admin/users/${targetId}`);
    expect(detail.json()).toMatchObject({ lockMode: 'FULL' });

    const unlocked = await request('post', `/api/v1/admin/users/${targetId}/unlock`);
    expect(unlocked.statusCode).toBe(200);
    const after = await request('get', `/api/v1/admin/users/${targetId}`);
    expect(after.json()).toMatchObject({ lockMode: 'NONE' });
  });

  it('should force a password reset that blocks even the correct password until recovery', async () => {
    const forced = await request('post', `/api/v1/admin/users/${targetId}/force-password-reset`);
    expect(forced.statusCode).toBe(200);

    const init = await env.getRouter().mockRequest().post('/api/v1/auth/login/init').body({ identifier: 'subject@example.com' });
    const { flowId } = init.json() as { flowId: string };
    const attempt = await env.getRouter().mockRequest().post('/api/v1/auth/challenge/verify').body({ flowId, password: 'Password@123' });
    expect(attempt.statusCode).toBe(401);
    expect(attempt.json()).toMatchObject({ status: 'PASSWORD_RESET_REQUIRED' });

    /** Recovery-style credential replacement clears the flag and restores password login. */
    await env.getService(PasswordService).changePassword(targetUserId, 'NewPassword@456', 'subject@example.com');
    const again = await env.getRouter().mockRequest().post('/api/v1/auth/login/init').body({ identifier: 'subject@example.com' });
    const retry = await env
      .getRouter()
      .mockRequest()
      .post('/api/v1/auth/challenge/verify')
      .body({ flowId: (again.json() as { flowId: string }).flowId, password: 'NewPassword@456' });
    expect(retry.json()).toMatchObject({ status: 'COMPLETED' });
  });

  it('should deactivate and reactivate an account', async () => {
    const { secret } = await env.getService(SessionService).create({ userId: targetUserId });
    const deactivated = await request('post', `/api/v1/admin/users/${targetId}/deactivate`);
    expect(deactivated.statusCode).toBe(200);
    expect(await env.getService(SessionService).validate(secret)).toBeNull();

    const detail = await request('get', `/api/v1/admin/users/${targetId}`);
    expect(detail.json()).toMatchObject({ status: 'DISABLED' });

    const reactivated = await request('post', `/api/v1/admin/users/${targetId}/reactivate`);
    expect(reactivated.statusCode).toBe(200);
    const after = await request('get', `/api/v1/admin/users/${targetId}`);
    expect(after.json()).toMatchObject({ status: 'ACTIVE' });
  });

  it('should soft-delete: scrub pii, close the account, keep the audit chain valid', async () => {
    const deleted = await request('delete', `/api/v1/admin/users/${targetId}`);
    expect(deleted.statusCode).toBe(200);

    const emails = await env.getPostgresClient().select().from(schema.userEmails).where(eq(schema.userEmails.userId, targetUserId));
    const phones = await env.getPostgresClient().select().from(schema.userPhones).where(eq(schema.userPhones.userId, targetUserId));
    expect(emails).toHaveLength(0);
    expect(phones).toHaveLength(0);

    const [profile] = await env.getPostgresClient().select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, targetUserId));
    expect(profile?.firstName).toBeNull();

    const [user] = await env.getPostgresClient().select().from(schema.users).where(eq(schema.users.id, targetUserId));
    expect(user?.status).toBe('CLOSED');

    const chain = await env.getService(AuditService).verifyChain();
    expect(chain.valid).toBe(true);
  });

  it('should attribute admin actions to the acting administrator in the audit trail', async () => {
    await request('post', `/api/v1/admin/users/${targetId}/lock`).body({ mode: 'OTP_ONLY' });
    const trail = await request('get', `/api/v1/admin/users/${targetId}/audit`);
    expect(trail.statusCode).toBe(200);
    const { events } = trail.json() as { events: { action: string; actorId?: string }[] };
    const lockEvent = events.find(event => event.action === 'admin.user.locked');
    expect(lockEvent).toBeDefined();
    expect(lockEvent?.actorId).not.toBe(targetId);
  });
});
