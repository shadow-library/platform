import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

import { APP_NAME } from '@server/constants';
import { IAM_ADMIN_ROLE, PLATFORM_ORG_NAME } from '@server/modules/admin';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { ApplicationService } from '@server/modules/system/application';

import { csrfPair, TestEnvironment } from '../test-environment';

type Method = 'get' | 'post' | 'delete' | 'patch';

const env = new TestEnvironment('admin-application-release').init();

describe('Admin application release API', () => {
  let db: PrimaryDatabase;
  let adminId: bigint;
  let adminSecret: string;
  let adminAal1Secret: string;
  let platformOrgId: string;
  let orgId: bigint;
  let seq = 0;

  const uniq = (prefix: string): string => `${prefix}-${Date.now()}-${seq++}`;

  const request = (method: Method, path: string, secret = adminSecret, body?: Record<string, unknown>) => {
    const csrf = csrfPair();
    const mock = env.getRouter().mockRequest();
    const chain = mock[method](path)
      .headers({ 'x-csrf-token': csrf.header })
      .cookies({ [SESSION_COOKIE_NAME]: secret, 'csrf-token': csrf.cookie });
    return body ? chain.body(body) : chain;
  };

  const createApp = async (visibility: 'PUBLIC' | 'RESTRICTED' | 'INTERNAL'): Promise<number> => {
    const name = uniq('app');
    const app = await env.getService(ApplicationService).createApplication({ name, subDomain: name, visibility });
    return app.id;
  };

  const createTeam = async (name = uniq('team')): Promise<bigint> => {
    const [org] = await db
      .insert(schema.organisations)
      .values({ name, slug: uniq('slug'), type: 'TEAM', status: 'ACTIVE' })
      .returning({ id: schema.organisations.id });
    return org!.id;
  };

  const auditActions = async (action: string): Promise<number> => {
    const rows = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, action));
    return rows.length;
  };

  beforeEach(async () => {
    db = env.getPostgresClient();
    await env.getRedisClient().flushdb();
    const application = env.getService(ApplicationService).getApplicationOrThrow(APP_NAME);
    const organisation = await env.getService(OrganisationService).findTeamByName(PLATFORM_ORG_NAME);
    platformOrgId = String(organisation?.id);

    const admin = await env
      .getService(UserService)
      .createUserWithPassword({ email: uniq('admin') + '@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    adminId = admin.id;
    const role = application.roles.find(candidate => candidate.roleName === IAM_ADMIN_ROLE);
    await env.getService(PolicyDecisionService).assignRole({ type: 'USER', id: admin.id.toString() }, role?.id ?? 0, platformOrgId);
    adminSecret = (await env.getService(SessionService).create({ userId: admin.id, aal: 'AAL2' })).secret;
    adminAal1Secret = (await env.getService(SessionService).create({ userId: admin.id, aal: 'AAL1' })).secret;
    orgId = await createTeam();
  });

  it('should change visibility, invalidate globally and audit the change', async () => {
    const appId = await createApp('PUBLIC');
    const patched = await request('patch', `/api/v1/admin/applications/${appId}`, adminSecret, { visibility: 'RESTRICTED' });
    expect(patched.statusCode).toBe(200);

    const detail = await request('get', `/api/v1/admin/applications/${appId}`);
    expect((detail.json() as { visibility: string }).visibility).toBe('RESTRICTED');
    expect(await auditActions('application.visibility.changed')).toBe(1);
  });

  it('should release a RESTRICTED app to a team and surface it in the overview', async () => {
    const appId = await createApp('RESTRICTED');
    const released = await request('post', `/api/v1/admin/applications/${appId}/organisations`, adminSecret, { organisationId: orgId.toString() });
    expect(released.statusCode).toBe(200);

    const overview = await request('get', `/api/v1/admin/applications/${appId}/organisations`);
    const items = (overview.json() as { items: { organisationId: string; source: string; assignedBy?: string }[] }).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ organisationId: orgId.toString(), source: 'PLATFORM_RELEASE', assignedBy: adminId.toString() });
    expect(await auditActions('application.release.granted')).toBe(1);
  });

  it('should be idempotent on a repeated release', async () => {
    const appId = await createApp('RESTRICTED');
    await request('post', `/api/v1/admin/applications/${appId}/organisations`, adminSecret, { organisationId: orgId.toString() });
    const again = await request('post', `/api/v1/admin/applications/${appId}/organisations`, adminSecret, { organisationId: orgId.toString() });
    expect(again.statusCode).toBe(200);

    const overview = await request('get', `/api/v1/admin/applications/${appId}/organisations`);
    expect((overview.json() as { items: unknown[] }).items).toHaveLength(1);
  });

  it('should revoke a release and audit it', async () => {
    const appId = await createApp('RESTRICTED');
    await request('post', `/api/v1/admin/applications/${appId}/organisations`, adminSecret, { organisationId: orgId.toString() });

    const revoked = await request('delete', `/api/v1/admin/applications/${appId}/organisations/${orgId}`);
    expect(revoked.statusCode).toBe(200);
    const overview = await request('get', `/api/v1/admin/applications/${appId}/organisations`);
    expect((overview.json() as { items: unknown[] }).items).toHaveLength(0);
    expect(await auditActions('application.release.revoked')).toBe(1);
  });

  it('should refuse to release a non-RESTRICTED application', async () => {
    const appId = await createApp('PUBLIC');
    const released = await request('post', `/api/v1/admin/applications/${appId}/organisations`, adminSecret, { organisationId: orgId.toString() });
    expect(released.statusCode).toBe(400);
  });

  it('should reject an unknown or non-team release target', async () => {
    const appId = await createApp('RESTRICTED');
    const absent = await request('post', `/api/v1/admin/applications/${appId}/organisations`, adminSecret, { organisationId: '999999' });
    expect(absent.statusCode).toBe(404);

    const personalHolder = await env.getService(UserService).createUserWithPassword({ email: uniq('p') + '@example.com', password: 'Password@123', status: 'ACTIVE' });
    const personalOrgId = (await env.getService(UserService).getUser(personalHolder.id))?.personalOrganisationId?.toString() as string;
    const personal = await request('post', `/api/v1/admin/applications/${appId}/organisations`, adminSecret, { organisationId: personalOrgId });
    expect(personal.statusCode).toBe(409);
  });

  it('should require the applications permission and a step-up', async () => {
    const appId = await createApp('RESTRICTED');
    const outsider = await env.getService(UserService).createUserWithPassword({ email: uniq('out') + '@example.com', password: 'Password@123', status: 'ACTIVE' });
    const outsiderSecret = (await env.getService(SessionService).create({ userId: outsider.id, aal: 'AAL2' })).secret;

    const denied = await request('get', `/api/v1/admin/applications/${appId}/organisations`, outsiderSecret);
    expect(denied.statusCode).toBe(403);

    const notElevated = await request('post', `/api/v1/admin/applications/${appId}/organisations`, adminAal1Secret, { organisationId: orgId.toString() });
    expect(notElevated.statusCode).toBe(403);
  });
});
