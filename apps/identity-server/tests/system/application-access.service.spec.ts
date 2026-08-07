import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

import { PLATFORM_ORG_NAME } from '@server/modules/admin/admin.constants';
import { Application, Organisation, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { ApplicationAccessService, ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

interface OrgOptions {
  type?: Organisation.Type;
  name?: string;
  status?: Organisation.Status;
  appAccessMode?: Organisation.AppAccessMode;
}

const env = new TestEnvironment('application-access').init();

const rejection = <T>(promise: Promise<T>): Promise<any> =>
  promise.then(
    () => ({}),
    error => error,
  );

describe('ApplicationAccessService', () => {
  let service: ApplicationAccessService;
  let db: PrimaryDatabase;
  let seq = 0;

  const uniq = (): string => `${Date.now()}-${seq++}`;

  const createUser = async (): Promise<bigint> => {
    const [user] = await db.insert(schema.users).values({ status: 'ACTIVE' }).returning({ id: schema.users.id });
    return user!.id;
  };

  const createApp = async (visibility: Application.Visibility, isActive = true): Promise<number> => {
    const name = `aac-app-${uniq()}`;
    const app = await env.getService(ApplicationService).createApplication({ name, subDomain: name, visibility, isActive });
    return app.id;
  };

  const createOrg = async (options: OrgOptions = {}): Promise<bigint> => {
    const [org] = await db
      .insert(schema.organisations)
      .values({
        name: options.name ?? `Org ${uniq()}`,
        slug: `org-${uniq()}`,
        type: options.type ?? 'TEAM',
        status: options.status ?? 'ACTIVE',
        appAccessMode: options.appAccessMode ?? 'ALL_APPS',
      })
      .returning({ id: schema.organisations.id });
    return org!.id;
  };

  const addMember = async (organisationId: bigint, userId: bigint, status: Organisation.MemberStatus = 'ACTIVE', statusUntil: Date | null = null): Promise<void> => {
    await db.insert(schema.organisationMembers).values({ organisationId, userId, role: 'MEMBER', status, statusUntil });
  };

  const grant = async (organisationId: bigint, applicationId: number, source: Application.OrganisationApplicationSource): Promise<void> => {
    await db.insert(schema.organisationApplications).values({ organisationId, applicationId, source });
  };

  const linkScim = async (organisationId: bigint, userId: bigint, managed: boolean): Promise<void> => {
    await db.insert(schema.scimDirectory).values({ organisationId, userId, userName: `scim-${uniq()}`, managed });
  };

  /** Redis is flushed per test — grant-set caches carry versioned keys that would otherwise leak across the shared connection. */
  beforeEach(async () => {
    service = env.getService(ApplicationAccessService);
    db = env.getPostgresClient();
    await env.getRedisClient().flushdb();
  });

  describe('resolveAccessibleApplicationIds — personal workspace', () => {
    it('should grant PUBLIC apps to a personal-workspace member', async () => {
      const userId = await createUser();
      const personalOrg = await createOrg({ type: 'PERSONAL' });
      await addMember(personalOrg, userId);
      const publicApp = await createApp('PUBLIC');

      const grants = await service.resolveAccessibleApplicationIds(userId);

      expect(grants.has(publicApp)).toBe(true);
    });

    it('should never grant RESTRICTED or INTERNAL apps through the personal workspace', async () => {
      const userId = await createUser();
      const personalOrg = await createOrg({ type: 'PERSONAL' });
      await addMember(personalOrg, userId);
      const restrictedApp = await createApp('RESTRICTED');
      const internalApp = await createApp('INTERNAL');

      const grants = await service.resolveAccessibleApplicationIds(userId);

      expect(grants.has(restrictedApp)).toBe(false);
      expect(grants.has(internalApp)).toBe(false);
    });
  });

  describe('resolveAccessibleApplicationIds — team visibility & assignment', () => {
    it('should grant a released RESTRICTED app to an ALL_APPS team without an assignment', async () => {
      const userId = await createUser();
      const team = await createOrg({ appAccessMode: 'ALL_APPS' });
      await addMember(team, userId);
      const restrictedApp = await createApp('RESTRICTED');
      await grant(team, restrictedApp, 'PLATFORM_RELEASE');

      const grants = await service.resolveAccessibleApplicationIds(userId);

      expect(grants.has(restrictedApp)).toBe(true);
    });

    it('should withhold an unreleased RESTRICTED app from an ALL_APPS team', async () => {
      const userId = await createUser();
      const team = await createOrg({ appAccessMode: 'ALL_APPS' });
      await addMember(team, userId);
      const restrictedApp = await createApp('RESTRICTED');

      const grants = await service.resolveAccessibleApplicationIds(userId);

      expect(grants.has(restrictedApp)).toBe(false);
    });

    it('should require both a release and an assignment for a RESTRICTED app under ASSIGNED_ONLY', async () => {
      const userId = await createUser();
      const team = await createOrg({ appAccessMode: 'ASSIGNED_ONLY' });
      await addMember(team, userId);
      const restrictedApp = await createApp('RESTRICTED');
      await grant(team, restrictedApp, 'PLATFORM_RELEASE');

      const releasedOnly = await service.resolveAccessibleApplicationIds(userId);
      expect(releasedOnly.has(restrictedApp)).toBe(false);

      await grant(team, restrictedApp, 'ORG_ASSIGNMENT');
      await service.invalidateOrganisation(team.toString());
      const releasedAndAssigned = await service.resolveAccessibleApplicationIds(userId);
      expect(releasedAndAssigned.has(restrictedApp)).toBe(true);
    });

    it('should withhold a PUBLIC app from an ASSIGNED_ONLY team until it is assigned', async () => {
      const userId = await createUser();
      const team = await createOrg({ appAccessMode: 'ASSIGNED_ONLY' });
      await addMember(team, userId);
      const publicApp = await createApp('PUBLIC');

      const beforeAssignment = await service.resolveAccessibleApplicationIds(userId);
      expect(beforeAssignment.has(publicApp)).toBe(false);

      await grant(team, publicApp, 'ORG_ASSIGNMENT');
      await service.invalidateOrganisation(team.toString());
      const afterAssignment = await service.resolveAccessibleApplicationIds(userId);
      expect(afterAssignment.has(publicApp)).toBe(true);
    });
  });

  describe('resolveAccessibleApplicationIds — platform organisation', () => {
    it('should expose INTERNAL apps to a platform-organisation member', async () => {
      const userId = await createUser();
      const platformOrg = await createOrg({ name: PLATFORM_ORG_NAME });
      await addMember(platformOrg, userId);
      const internalApp = await createApp('INTERNAL');

      const grants = await service.resolveAccessibleApplicationIds(userId);

      expect(grants.has(internalApp)).toBe(true);
    });

    it('should hide INTERNAL apps from an ordinary team member', async () => {
      const userId = await createUser();
      const team = await createOrg({ name: 'Ordinary Team' });
      await addMember(team, userId);
      const internalApp = await createApp('INTERNAL');

      const grants = await service.resolveAccessibleApplicationIds(userId);

      expect(grants.has(internalApp)).toBe(false);
    });
  });

  describe('resolveAccessibleApplicationIds — managed-account override (D-A2)', () => {
    it('should lock a managed account to its managing organisation, dropping personal-workspace grants', async () => {
      const userId = await createUser();
      const personalOrg = await createOrg({ type: 'PERSONAL' });
      await addMember(personalOrg, userId);
      const managingOrg = await createOrg({ appAccessMode: 'ASSIGNED_ONLY' });
      await addMember(managingOrg, userId);
      const publicApp = await createApp('PUBLIC');

      const adopted = await service.resolveAccessibleApplicationIds(userId);
      expect(adopted.has(publicApp)).toBe(true);

      await linkScim(managingOrg, userId, true);
      const managed = await service.resolveAccessibleApplicationIds(userId);
      expect(managed.has(publicApp)).toBe(false);
    });

    it('should leave an adopted (managed=false) account subject to all its memberships', async () => {
      const userId = await createUser();
      const personalOrg = await createOrg({ type: 'PERSONAL' });
      await addMember(personalOrg, userId);
      const org = await createOrg({ appAccessMode: 'ASSIGNED_ONLY' });
      await addMember(org, userId);
      await linkScim(org, userId, false);
      const publicApp = await createApp('PUBLIC');

      const grants = await service.resolveAccessibleApplicationIds(userId);

      expect(grants.has(publicApp)).toBe(true);
    });
  });

  describe('resolveAccessibleApplicationIds — inactive membership, org & apps', () => {
    it('should grant nothing through a suspended membership', async () => {
      const userId = await createUser();
      const team = await createOrg();
      await addMember(team, userId, 'SUSPENDED', new Date(Date.now() + 60_000));
      const restrictedApp = await createApp('RESTRICTED');
      await grant(team, restrictedApp, 'PLATFORM_RELEASE');

      const grants = await service.resolveAccessibleApplicationIds(userId);

      expect(grants.has(restrictedApp)).toBe(false);
    });

    it('should treat a lapsed suspension as active', async () => {
      const userId = await createUser();
      const team = await createOrg();
      await addMember(team, userId, 'SUSPENDED', new Date(Date.now() - 60_000));
      const restrictedApp = await createApp('RESTRICTED');
      await grant(team, restrictedApp, 'PLATFORM_RELEASE');

      const grants = await service.resolveAccessibleApplicationIds(userId);

      expect(grants.has(restrictedApp)).toBe(true);
    });

    it('should grant nothing through a suspended organisation', async () => {
      const userId = await createUser();
      const team = await createOrg({ status: 'SUSPENDED' });
      await addMember(team, userId);
      const restrictedApp = await createApp('RESTRICTED');
      await grant(team, restrictedApp, 'PLATFORM_RELEASE');

      const grants = await service.resolveAccessibleApplicationIds(userId);

      expect(grants.has(restrictedApp)).toBe(false);
    });

    it('should exclude an inactive application even when released', async () => {
      const userId = await createUser();
      const team = await createOrg();
      await addMember(team, userId);
      const inactiveApp = await createApp('RESTRICTED', false);
      await grant(team, inactiveApp, 'PLATFORM_RELEASE');

      const grants = await service.resolveAccessibleApplicationIds(userId);

      expect(grants.has(inactiveApp)).toBe(false);
    });
  });

  describe('assertUserAccess — hidden vs denied', () => {
    it('should resolve for a granted application', async () => {
      const userId = await createUser();
      const personalOrg = await createOrg({ type: 'PERSONAL' });
      await addMember(personalOrg, userId);
      const publicApp = await createApp('PUBLIC');

      await expect(service.assertUserAccess(userId, publicApp)).resolves.toBeUndefined();
    });

    it('should answer an inactive application as hidden (APP_006)', async () => {
      const userId = await createUser();
      const inactiveApp = await createApp('PUBLIC', false);

      const error = await rejection(service.assertUserAccess(userId, inactiveApp));
      expect(error.code).toBe('APP_006');
    });

    it('should answer an ungranted INTERNAL application as hidden (APP_006), never denied', async () => {
      const userId = await createUser();
      const team = await createOrg({ name: 'Ordinary Team' });
      await addMember(team, userId);
      const internalApp = await createApp('INTERNAL');

      const error = await rejection(service.assertUserAccess(userId, internalApp));
      expect(error.code).toBe('APP_006');
    });

    it('should answer a visible but ungranted application as denied (APP_007)', async () => {
      const userId = await createUser();
      const publicApp = await createApp('PUBLIC');

      const error = await rejection(service.assertUserAccess(userId, publicApp));
      expect(error.code).toBe('APP_007');
    });
  });

  describe('cache invalidation', () => {
    it('should serve a stale grant set until the organisation is invalidated', async () => {
      const userId = await createUser();
      const team = await createOrg({ appAccessMode: 'ASSIGNED_ONLY' });
      await addMember(team, userId);
      const restrictedApp = await createApp('RESTRICTED');
      await grant(team, restrictedApp, 'PLATFORM_RELEASE');

      const initial = await service.resolveAccessibleApplicationIds(userId);
      expect(initial.has(restrictedApp)).toBe(false);

      await grant(team, restrictedApp, 'ORG_ASSIGNMENT');
      const stale = await service.resolveAccessibleApplicationIds(userId);
      expect(stale.has(restrictedApp)).toBe(false);

      await service.invalidateOrganisation(team.toString());
      const fresh = await service.resolveAccessibleApplicationIds(userId);
      expect(fresh.has(restrictedApp)).toBe(true);
    });

    it('should discard every cached grant set on a global invalidation', async () => {
      const userId = await createUser();
      const team = await createOrg({ appAccessMode: 'ALL_APPS' });
      await addMember(team, userId);
      const app = await createApp('PUBLIC');

      const initial = await service.resolveAccessibleApplicationIds(userId);
      expect(initial.has(app)).toBe(true);

      await db.update(schema.applications).set({ isActive: false }).where(eq(schema.applications.id, app));
      const stale = await service.resolveAccessibleApplicationIds(userId);
      expect(stale.has(app)).toBe(true);

      await service.invalidateGlobal();
      const fresh = await service.resolveAccessibleApplicationIds(userId);
      expect(fresh.has(app)).toBe(false);
    });
  });
});
