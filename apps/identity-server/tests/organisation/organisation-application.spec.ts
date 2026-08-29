import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { ApplicationAccessService, ApplicationService } from '@server/modules/system/application';

import { csrfPair, TestEnvironment } from '../test-environment';

type Method = 'get' | 'post' | 'patch' | 'delete';

const env = new TestEnvironment('organisation-application').init();

describe('Organisation application assignment', () => {
  let db: PrimaryDatabase;
  let ownerId: bigint;
  let memberId: bigint;
  let ownerSecret: string;
  let ownerAal1Secret: string;
  let adminSecret: string;
  let memberSecret: string;
  let orgId: string;
  let seq = 0;

  const uniq = (prefix: string): string => `${prefix}-${Date.now()}-${seq++}`;

  const request = (method: Method, path: string, secret: string, body?: Record<string, unknown>) => {
    const csrf = csrfPair();
    const mock = env.getRouter().mockRequest();
    const chain = mock[method](path)
      .headers({ 'x-csrf-token': csrf.header })
      .cookies({ [SESSION_COOKIE_NAME]: secret, 'csrf-token': csrf.cookie });
    return body ? chain.body(body) : chain;
  };

  const session = async (userId: bigint, aal: 'AAL1' | 'AAL2' = 'AAL1') => (await env.getService(SessionService).create({ userId, aal })).secret;

  const createApp = async (visibility: 'PUBLIC' | 'RESTRICTED' | 'INTERNAL'): Promise<number> => {
    const name = uniq('app');
    return (await env.getService(ApplicationService).createApplication({ name, subDomain: name, visibility })).id;
  };

  const releaseToOrg = async (applicationId: number): Promise<void> => {
    await db.insert(schema.organisationApplications).values({ organisationId: BigInt(orgId), applicationId, source: 'PLATFORM_RELEASE' });
  };

  const createOrgOwnedApp = async (ownerOrganisationId: bigint): Promise<number> => {
    const name = uniq('org-app');
    const application = await env.getService(ApplicationService).createApplication({ name, subDomain: name, visibility: 'RESTRICTED', ownerOrganisationId });
    return application.id;
  };

  const setMode = async (mode: 'ALL_APPS' | 'ASSIGNED_ONLY'): Promise<void> => {
    await db
      .update(schema.organisations)
      .set({ appAccessMode: mode })
      .where(eq(schema.organisations.id, BigInt(orgId)));
  };

  const auditActions = async (action: string): Promise<number> => {
    const rows = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, action));
    return rows.length;
  };

  beforeEach(async () => {
    db = env.getPostgresClient();
    await env.getRedisClient().flushdb();
    const users = env.getService(UserService);
    ownerId = (await users.createUserWithPassword({ email: uniq('owner') + '@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true })).id;
    const adminId = (await users.createUserWithPassword({ email: uniq('admin') + '@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true })).id;
    memberId = (await users.createUserWithPassword({ email: uniq('member') + '@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true })).id;
    ownerSecret = await session(ownerId, 'AAL2');
    ownerAal1Secret = await session(ownerId, 'AAL1');
    adminSecret = await session(adminId, 'AAL2');
    memberSecret = await session(memberId, 'AAL2');

    const created = await request('post', '/api/v1/organisations', ownerSecret, { name: uniq('Acme') });
    orgId = (created.json() as { id: string }).id;
    const organisations = env.getService(OrganisationService);
    await organisations.ensureMember(BigInt(orgId), adminId, 'ADMIN');
    await organisations.ensureMember(BigInt(orgId), memberId, 'MEMBER');
  });

  it('should list offerable apps with their assigned flag and the access mode', async () => {
    await setMode('ASSIGNED_ONLY');
    const publicApp = await createApp('PUBLIC');
    const restricted = await createApp('RESTRICTED');
    await releaseToOrg(restricted);

    const listed = await request('get', `/api/v1/organisations/${orgId}/applications`, adminSecret);
    expect(listed.statusCode).toBe(200);
    const body = listed.json() as { appAccessMode: string; applications: { id: number; assigned: boolean }[] };
    expect(body.appAccessMode).toBe('ASSIGNED_ONLY');
    const ids = body.applications.map(application => application.id);
    expect(ids).toContain(publicApp);
    expect(ids).toContain(restricted);
    expect(body.applications.every(application => application.assigned === false)).toBe(true);
  });

  it('should assign a reachable app, reflect it in the list, and audit it', async () => {
    const publicApp = await createApp('PUBLIC');
    const assigned = await request('post', `/api/v1/organisations/${orgId}/applications`, adminSecret, { applicationId: String(publicApp) });
    expect(assigned.statusCode).toBe(200);

    const listed = await request('get', `/api/v1/organisations/${orgId}/applications`, adminSecret);
    const entry = (listed.json() as { applications: { id: number; assigned: boolean }[] }).applications.find(application => application.id === publicApp);
    expect(entry?.assigned).toBe(true);
    expect(await auditActions('org.application.assigned')).toBe(1);
  });

  it('should unassign an app and audit it', async () => {
    const publicApp = await createApp('PUBLIC');
    await request('post', `/api/v1/organisations/${orgId}/applications`, adminSecret, { applicationId: String(publicApp) });

    const unassigned = await request('delete', `/api/v1/organisations/${orgId}/applications/${publicApp}`, adminSecret);
    expect(unassigned.statusCode).toBe(200);
    const listed = await request('get', `/api/v1/organisations/${orgId}/applications`, adminSecret);
    const entry = (listed.json() as { applications: { id: number; assigned: boolean }[] }).applications.find(application => application.id === publicApp);
    expect(entry?.assigned).toBe(false);
    expect(await auditActions('org.application.unassigned')).toBe(1);
  });

  it('should refuse to assign an app the members could never reach', async () => {
    const internal = await createApp('INTERNAL');
    const rejectedInternal = await request('post', `/api/v1/organisations/${orgId}/applications`, adminSecret, { applicationId: String(internal) });
    expect(rejectedInternal.statusCode).toBe(400);

    const restricted = await createApp('RESTRICTED');
    const rejectedUnreleased = await request('post', `/api/v1/organisations/${orgId}/applications`, adminSecret, { applicationId: String(restricted) });
    expect(rejectedUnreleased.statusCode).toBe(400);

    await releaseToOrg(restricted);
    const acceptedReleased = await request('post', `/api/v1/organisations/${orgId}/applications`, adminSecret, { applicationId: String(restricted) });
    expect(acceptedReleased.statusCode).toBe(200);
  });

  it('should refuse to assign an org-owned application (APP_009), even to its owning organisation', async () => {
    const [otherOrg] = await db
      .insert(schema.organisations)
      .values({ name: uniq('Other Org'), slug: uniq('other-org'), type: 'TEAM', status: 'ACTIVE' })
      .returning({ id: schema.organisations.id });
    const ownedByOther = await createOrgOwnedApp(otherOrg!.id);
    const rejectedForeign = await request('post', `/api/v1/organisations/${orgId}/applications`, adminSecret, { applicationId: String(ownedByOther) });
    expect(rejectedForeign.statusCode).toBe(409);
    expect(rejectedForeign.json()).toMatchObject({ code: 'APP_009' });

    const ownedBySelf = await createOrgOwnedApp(BigInt(orgId));
    const rejectedSelf = await request('post', `/api/v1/organisations/${orgId}/applications`, adminSecret, { applicationId: String(ownedBySelf) });
    expect(rejectedSelf.statusCode).toBe(409);
    expect(rejectedSelf.json()).toMatchObject({ code: 'APP_009' });
  });

  it('should never offer an org-owned application through listForOrganisation, not even to its owner', async () => {
    const ownApp = await createOrgOwnedApp(BigInt(orgId));

    const listed = await request('get', `/api/v1/organisations/${orgId}/applications`, adminSecret);
    expect(listed.statusCode).toBe(200);
    const ids = (listed.json() as { applications: { id: number }[] }).applications.map(application => application.id);
    expect(ids).not.toContain(ownApp);
  });

  it('should require an elevated ADMIN to assign', async () => {
    const publicApp = await createApp('PUBLIC');
    const asMember = await request('post', `/api/v1/organisations/${orgId}/applications`, memberSecret, { applicationId: String(publicApp) });
    expect(asMember.statusCode).toBe(403);

    const notElevated = await request('post', `/api/v1/organisations/${orgId}/applications`, await session(memberId, 'AAL1'), { applicationId: String(publicApp) });
    expect([401, 403]).toContain(notElevated.statusCode);
  });

  describe('app access mode', () => {
    it('should let an elevated owner change the access mode and audit it', async () => {
      const response = await request('patch', `/api/v1/organisations/${orgId}`, ownerSecret, { appAccessMode: 'ASSIGNED_ONLY' });
      expect(response.statusCode).toBe(200);
      expect((response.json() as { appAccessMode: string }).appAccessMode).toBe('ASSIGNED_ONLY');
      expect(await auditActions('org.app_access_mode.changed')).toBe(1);
    });

    it('should refuse the access-mode change to an admin and to a non-elevated owner', async () => {
      const asAdmin = await request('patch', `/api/v1/organisations/${orgId}`, adminSecret, { appAccessMode: 'ASSIGNED_ONLY' });
      expect(asAdmin.statusCode).toBe(403);

      const nonElevatedOwner = await request('patch', `/api/v1/organisations/${orgId}`, ownerAal1Secret, { appAccessMode: 'ASSIGNED_ONLY' });
      expect([401, 403]).toContain(nonElevatedOwner.statusCode);
    });

    it('should keep the rename path at admin level', async () => {
      const renamed = await request('patch', `/api/v1/organisations/${orgId}`, adminSecret, { name: 'Acme Renamed' });
      expect(renamed.statusCode).toBe(200);
      expect((renamed.json() as { name: string }).name).toBe('Acme Renamed');
    });
  });

  it('should compose with the sign-in gate: release + assign grants, unassign denies', async () => {
    await setMode('ASSIGNED_ONLY');
    const access = env.getService(ApplicationAccessService);
    const restricted = await createApp('RESTRICTED');
    await releaseToOrg(restricted);
    await request('post', `/api/v1/organisations/${orgId}/applications`, adminSecret, { applicationId: String(restricted) });

    await expect(access.assertUserAccess(memberId, restricted)).resolves.toBeUndefined();

    const unassigned = await request('delete', `/api/v1/organisations/${orgId}/applications/${restricted}`, adminSecret);
    expect(unassigned.statusCode).toBe(200);

    const denial = await access.assertUserAccess(memberId, restricted).then(
      () => ({ code: 'NONE' }),
      (error: { code: string }) => error,
    );
    expect(denial.code).toBe('APP_007');
  });
});
