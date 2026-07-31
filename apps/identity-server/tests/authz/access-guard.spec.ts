/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { type FastifyRequest } from 'fastify';
import { type HandlerMetadata } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { type AuthContext, type AuthenticatedRequest, type AuthOptions } from '@server/modules/access';
import { ACCESS_METADATA } from '@server/modules/access/access.decorator';
import { AccessGuard } from '@server/modules/access/access.guard';
import { ADMIN_PERMISSIONS, AdminAccessService, IAM_ADMIN_ROLE, PLATFORM_ORG_NAME } from '@server/modules/admin';
import { KeyService } from '@server/modules/auth/keys';
import { SESSION_COOKIE_NAME, SessionAuthService, SessionService } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('access-guard').init();

describe('AccessGuard', () => {
  let guard: AccessGuard;
  let sessions: SessionService;

  const requestWith = (secret?: string, params: Record<string, string> = {}): FastifyRequest =>
    ({ cookies: secret ? { [SESSION_COOKIE_NAME]: secret } : {}, headers: {}, params, ip: '203.0.113.7' }) as unknown as FastifyRequest;

  const metadataFor = (options?: AuthOptions): HandlerMetadata => ({ [ACCESS_METADATA]: options, method: 'GET', path: '/test' }) as unknown as HandlerMetadata;

  /** Runs the guard for the given route options against a request, returning the attached context or the thrown error. */
  const resolve = async (options: AuthOptions | undefined, request: FastifyRequest): Promise<AuthContext | Error> => {
    const handler = guard.generate(metadataFor(options));
    if (!handler) throw new Error('guard produced no handler');
    try {
      await handler(request, {} as never);
      return (request as AuthenticatedRequest).auth as AuthContext;
    } catch (error) {
      return error as Error;
    }
  };

  const sessionFor = async (email: string, aal: 'AAL1' | 'AAL2'): Promise<{ userId: bigint; secret: string }> => {
    const user = await env.getService(UserService).createUserWithPassword({ email, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    const { secret } = await sessions.create({ userId: user.id, aal });
    return { userId: user.id, secret };
  };

  beforeEach(() => {
    sessions = env.getService(SessionService);
    guard = new AccessGuard(env.getService(SessionAuthService), env.getService(AdminAccessService), env.getService(OrganisationService), env.getService(KeyService));
  });

  it('should not guard a route with no access declaration', () => {
    expect(guard.generate(metadataFor(undefined))).toBeUndefined();
  });

  it('should treat an explicitly public route as unguarded', () => {
    expect(guard.generate(metadataFor({ public: true }))).toBeUndefined();
  });

  it('should resolve a live session and compute step-up state', async () => {
    const { userId, secret } = await sessionFor('guard-session@example.com', 'AAL1');
    const context = (await resolve({ session: true }, requestWith(secret))) as AuthContext;
    expect(context.session?.userId).toBe(userId);
    expect(context.elevated).toBe(false);
    expect(context.clientInfo.ip).toBe('203.0.113.7');
  });

  it('should reject a session-mode route without a session cookie', async () => {
    const denied = (await resolve({ session: true }, requestWith())) as Error;
    expect((denied as { code?: string }).code).toBe('AUTH_005');
  });

  it('should demand step-up on an elevated route and mark the context elevated', async () => {
    const weak = await sessionFor('guard-weak@example.com', 'AAL1');
    const denied = (await resolve({ elevated: true }, requestWith(weak.secret))) as Error;
    expect((denied as { code?: string }).code).toBe('AUTH_006');

    const strong = await sessionFor('guard-strong@example.com', 'AAL2');
    const context = (await resolve({ elevated: true }, requestWith(strong.secret))) as AuthContext;
    expect(context.elevated).toBe(true);
  });

  it('should attach the admin actor when the permission is held and deny otherwise', async () => {
    const organisation = await env.getService(OrganisationService).findTeamByName(PLATFORM_ORG_NAME);
    const platformOrgId = String(organisation?.id);
    const application = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity');
    const role = application.roles.find(candidate => candidate.roleName === IAM_ADMIN_ROLE);

    const admin = await sessionFor('guard-admin@example.com', 'AAL2');
    await env.getService(PolicyDecisionService).assignRole({ type: 'USER', id: admin.userId.toString() }, role?.id ?? 0, platformOrgId);
    const context = (await resolve({ permission: ADMIN_PERMISSIONS.usersManage }, requestWith(admin.secret))) as AuthContext;
    expect(context.actor?.organisationId).toBe(platformOrgId);

    const mortal = await sessionFor('guard-mortal@example.com', 'AAL2');
    const denied = (await resolve({ permission: ADMIN_PERMISSIONS.usersManage }, requestWith(mortal.secret))) as Error;
    expect((denied as { code?: string }).code).toBe('ADM_001');
  });

  it('should resolve org membership from the path param for an org-role route', async () => {
    const owner = await sessionFor('guard-owner@example.com', 'AAL1');
    const organisation = await env.getService(OrganisationService).createTeam(owner.userId, { name: `guard-team-${Date.now()}`, slug: `gt${Date.now()}` });
    const request = requestWith(owner.secret, { organisationId: organisation.id.toString() });
    const context = (await resolve({ orgRole: 'ADMIN' }, request)) as AuthContext;
    expect(context.membership?.role).toBe('OWNER');
    expect(context.organisation?.id).toBe(organisation.id);

    const outsider = await sessionFor('guard-outsider@example.com', 'AAL1');
    const denied = (await resolve({ orgRole: 'ADMIN' }, requestWith(outsider.secret, { organisationId: organisation.id.toString() }))) as Error;
    expect((denied as { code?: string }).code).toBe('ORG_001');
  });

  it('should reject a service-mode route presenting no bearer token', async () => {
    const denied = (await resolve({ service: 'authz:check' }, requestWith())) as Error;
    expect((denied as { code?: string }).code).toBe('SEC_003');
  });
});
