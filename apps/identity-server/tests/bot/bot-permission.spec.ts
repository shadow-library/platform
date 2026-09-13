import { beforeEach, describe, expect, it } from 'bun:test';

import { and, eq } from 'drizzle-orm';

import { OAuthClientService } from '@server/modules/auth/oauth';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { CatalogSyncService, PolicyDecisionService } from '@server/modules/authz';
import { BotService, IDENTITY_BOT_ROLES } from '@server/modules/identity/bot';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { ApplicationAccessService, ApplicationService } from '@server/modules/system/application';

import { csrfPair, TestEnvironment } from '../test-environment';

type Method = 'get' | 'post' | 'put';

interface GrantJson {
  roleId: number;
  roleName: string;
  applicationId: number;
  application: string;
  resource?: string;
  level?: string;
  sensitive: boolean;
  eligible: boolean;
  grantedAt: string;
  grantedBy?: { id: string; displayName?: string };
  granterHoldsPermission: boolean;
  managed: boolean;
}

interface CatalogLevelJson {
  roleId: number;
  level: string;
  sensitive: boolean;
  eligible: boolean;
  heldByYou: boolean;
}

interface CatalogJson {
  applications: { applicationId: number; name: string; resources: { resource: string; levels: CatalogLevelJson[] }[] }[];
}

const env = new TestEnvironment('bot-permission').init();

describe('Bot permissions', () => {
  let db: PrimaryDatabase;
  let adminId: bigint;
  let adminSecret: string;
  let adminAal1Secret: string;
  let otherAdminId: bigint;
  let orgId: string;
  let botId: string;
  let botClientId: string;
  let forgeApplicationId: number;
  let forgeProjectsReadRoleId: number;
  let seq = 0;

  const request = (method: Method, path: string, secret: string, body?: Record<string, unknown>) => {
    const csrf = csrfPair();
    const mock = env.getRouter().mockRequest();
    const chain = mock[method](path)
      .headers({ 'x-csrf-token': csrf.header })
      .cookies({ [SESSION_COOKIE_NAME]: secret, 'csrf-token': csrf.cookie });
    return body ? chain.body(body) : chain;
  };

  const session = async (userId: bigint, aal: 'AAL1' | 'AAL2' = 'AAL2') => (await env.getService(SessionService).create({ userId, aal })).secret;

  const createUser = async (email: string, displayName?: string): Promise<bigint> =>
    (await env.getService(UserService).createUserWithPassword({ email, password: 'Password@123', status: 'ACTIVE', emailVerified: true, displayName })).id;

  const codeOf = (response: { json: () => unknown }): string => (response.json() as { code: string }).code;

  const permissionsPath = (bot = botId): string => `/api/v1/organisations/${orgId}/bots/${bot}/permissions`;

  const grants = async (bot = botId): Promise<GrantJson[]> => {
    const response = await request('get', permissionsPath(bot), adminSecret);
    expect(response.statusCode).toBe(200);
    return (response.json() as { grants: GrantJson[] }).grants;
  };

  const replace = (body: Record<string, unknown>[], secret = adminSecret, bot = botId) => request('put', permissionsPath(bot), secret, { grants: body });

  const identityGrant = (resource: string, level: string) => ({ applicationId: env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id, resource, level });

  const forgeGrant = (level: string) => ({ applicationId: forgeApplicationId, resource: 'projects', level });

  /** A second application whose bot-grantable roles are held only through a real role assignment, not by organisation rank. */
  const seedForgeApplication = async (): Promise<void> => {
    const applications = env.getService(ApplicationService);
    const name = `forge-${seq++}-${Date.now()}`;
    const application = await applications.createApplication({ name, subDomain: name });
    forgeApplicationId = application.id;

    const client = await env.getService(OAuthClientService).register({ applicationId: application.id, name: `${name}-svc`, kind: 'SERVICE', grantTypes: ['client_credentials'] });
    await env.getService(CatalogSyncService).sync(client.clientId, {
      permissions: [{ name: 'forge:projects:read' }, { name: 'forge:projects:write' }, { name: 'forge:generation:run' }],
      roles: [
        { name: 'ProjectsReader', permissions: ['forge:projects:read'], bot: { resource: 'projects', level: 'read' } },
        { name: 'ProjectsWriter', permissions: ['forge:projects:read', 'forge:projects:write'], bot: { resource: 'projects', level: 'write' } },
        { name: 'GenerationRunner', permissions: ['forge:generation:run'], bot: { resource: 'generation', level: 'write', sensitive: true } },
        { name: 'HumansOnly', permissions: ['forge:projects:write'] },
      ],
    });
    forgeProjectsReadRoleId = applications.getApplicationByIdOrThrow(application.id).roles.find(role => role.roleName === 'ProjectsReader')?.id as number;
  };

  beforeEach(async () => {
    db = env.getPostgresClient();
    const organisations = env.getService(OrganisationService);

    const ownerId = await createUser('owner@example.com');
    adminId = await createUser('admin@example.com', 'Priya Raman');
    otherAdminId = await createUser('other-admin@example.com', 'Sam Ortiz');
    orgId = (await organisations.createTeam(ownerId, { name: 'Acme' })).id.toString();
    await organisations.ensureMember(BigInt(orgId), adminId, 'ADMIN');
    await organisations.ensureMember(BigInt(orgId), otherAdminId, 'ADMIN');

    adminSecret = await session(adminId);
    adminAal1Secret = await session(adminId, 'AAL1');

    const bot = await env.getService(BotService).createBot({ userId: adminId }, BigInt(orgId), { handle: `bot-${seq++}`, displayName: 'Release notes' });
    botId = bot.id.toString();
    botClientId = bot.clientId;

    await seedForgeApplication();
  });

  describe('GET /bot-permission-catalog', () => {
    const catalog = async (secret = adminSecret): Promise<CatalogJson> => {
      const response = await request('get', `/api/v1/organisations/${orgId}/bot-permission-catalog`, secret);
      expect(response.statusCode).toBe(200);
      return response.json() as CatalogJson;
    };

    it('should list only the bot-grantable roles of applications the organisation can reach', async () => {
      const listed = await catalog();
      const forge = listed.applications.find(application => application.applicationId === forgeApplicationId);
      expect(forge?.resources.map(resource => resource.resource).sort()).toEqual(['generation', 'projects']);

      const projects = forge?.resources.find(resource => resource.resource === 'projects');
      expect(projects?.levels.map(level => level.level)).toEqual(['read', 'write']);
      expect(projects?.levels.every(level => level.eligible)).toBe(true);

      const roleNames = listed.applications.flatMap(application => application.resources.flatMap(resource => resource.levels.map(level => level.roleId)));
      expect(roleNames).not.toContain(
        env
          .getService(ApplicationService)
          .getApplicationByIdOrThrow(forgeApplicationId)
          .roles.find(role => role.roleName === 'HumansOnly')?.id,
      );
    });

    it('should mark identity permissions held by rank and another application’s permissions unheld', async () => {
      const listed = await catalog();
      const identity = listed.applications.find(application => application.name === 'shadow-identity');
      expect(identity?.resources.flatMap(resource => resource.levels).every(level => level.heldByYou)).toBe(true);

      const forge = listed.applications.find(application => application.applicationId === forgeApplicationId);
      expect(forge?.resources.flatMap(resource => resource.levels).every(level => level.heldByYou)).toBe(false);
    });

    it('should mark an application permission held once the admin is assigned its role', async () => {
      await env.getService(PolicyDecisionService).assignRole({ type: 'USER', id: adminId.toString() }, forgeProjectsReadRoleId, orgId);
      const listed = await catalog();
      const projects = listed.applications.find(application => application.applicationId === forgeApplicationId)?.resources.find(resource => resource.resource === 'projects');
      expect(projects?.levels.find(level => level.level === 'read')?.heldByYou).toBe(true);
      expect(projects?.levels.find(level => level.level === 'write')?.heldByYou).toBe(false);
    });

    it('should flag a sensitive grant', async () => {
      const listed = await catalog();
      const generation = listed.applications.find(application => application.applicationId === forgeApplicationId)?.resources.find(resource => resource.resource === 'generation');
      expect(generation?.levels[0]?.sensitive).toBe(true);
    });
  });

  describe('PUT /bots/:botId/permissions', () => {
    it('should require a stepped-up session', async () => {
      const response = await replace([identityGrant('members', 'read')], adminAal1Secret);
      expect(response.statusCode).toBe(403);
      expect(codeOf(response)).toBe('AUTH_006');
    });

    it('should apply the added and removed diff and audit it', async () => {
      expect((await replace([identityGrant('members', 'read'), identityGrant('domains', 'read')])).statusCode).toBe(200);
      expect((await grants()).map(grant => `${grant.resource}:${grant.level}`).sort()).toEqual(['domains:read', 'members:read']);

      expect((await replace([identityGrant('members', 'write')])).statusCode).toBe(200);
      expect((await grants()).map(grant => `${grant.resource}:${grant.level}`)).toEqual(['members:write']);

      const events = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'bot.permissions.changed'));
      expect(events).toHaveLength(2);
      const latest = events.at(-1)?.detail as { added: { resource: string }[]; removed: { resource: string }[] };
      expect(latest.added.map(grant => grant.resource)).toEqual(['members']);
      expect(latest.removed.map(grant => grant.resource).sort()).toEqual(['domains', 'members']);
    });

    it('should write the assignments against the bot’s client id as a service account', async () => {
      await replace([identityGrant('members', 'read')]);
      const assignments = await db
        .select()
        .from(schema.roleAssignments)
        .where(and(eq(schema.roleAssignments.principalType, 'SERVICE_ACCOUNT'), eq(schema.roleAssignments.principalId, botClientId)));
      expect(assignments).toHaveLength(1);
      expect(assignments[0]).toMatchObject({ organisationId: BigInt(orgId), grantedBy: `bot:${adminId}` });
      expect((await grants())[0]).toMatchObject({ managed: true, grantedBy: { id: adminId.toString() } });
    });

    it('should bump the bot’s authz version so cached decisions invalidate', async () => {
      const principal = { type: 'SERVICE_ACCOUNT' as const, id: botClientId };
      const before = await env.getService(PolicyDecisionService).getAuthzVersion(principal);
      await replace([identityGrant('members', 'read')]);
      expect(await env.getService(PolicyDecisionService).getAuthzVersion(principal)).toBeGreaterThan(before);
    });

    it('should reject a role that is not bot-grantable with BOT_004', async () => {
      const response = await replace([{ applicationId: forgeApplicationId, resource: 'humans', level: 'write' }]);
      expect(response.statusCode).toBe(409);
      expect(codeOf(response)).toBe('BOT_004');
      expect(await grants()).toEqual([]);
    });

    it('should reject a grant the admin does not hold with BOT_005, even when the client claims to hold it', async () => {
      const response = await replace([{ ...forgeGrant('read'), heldByYou: true, eligible: true }]);
      expect(response.statusCode).toBe(403);
      expect(codeOf(response)).toBe('BOT_005');
      expect(await grants()).toEqual([]);
    });

    /** Inserted straight into the table because the catalog sync now refuses to create one; this is the runtime lock for rows that predate that rule. */
    it('should never treat a permission-less bot-grantable role as held', async () => {
      await db
        .insert(schema.applicationRoles)
        .values({ applicationId: forgeApplicationId, roleName: 'GhostRole', botGrantable: true, botResource: 'ghost', botLevel: 'read', isSensitive: false });

      const listed = await request('get', `/api/v1/organisations/${orgId}/bot-permission-catalog`, adminSecret);
      const ghost = (listed.json() as CatalogJson).applications
        .find(application => application.applicationId === forgeApplicationId)
        ?.resources.find(resource => resource.resource === 'ghost');
      expect(ghost?.levels[0]?.heldByYou).toBe(false);

      const response = await replace([{ applicationId: forgeApplicationId, resource: 'ghost', level: 'read' }]);
      expect(response.statusCode).toBe(403);
      expect(codeOf(response)).toBe('BOT_005');
      expect(await grants()).toEqual([]);
    });

    it('should accept a grant once the admin actually holds it', async () => {
      await env.getService(PolicyDecisionService).assignRole({ type: 'USER', id: adminId.toString() }, forgeProjectsReadRoleId, orgId);
      expect((await replace([forgeGrant('read')])).statusCode).toBe(200);
      expect((await grants()).map(grant => grant.application)).toHaveLength(1);
    });

    it('should be a no-op that writes no audit event when nothing changes', async () => {
      await replace([identityGrant('members', 'read')]);
      expect((await replace([identityGrant('members', 'read')])).statusCode).toBe(200);
      expect(await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'bot.permissions.changed'))).toHaveLength(1);
    });

    it('should clear every grant for an empty desired set', async () => {
      await replace([identityGrant('members', 'read')]);
      expect((await replace([])).statusCode).toBe(200);
      expect(await grants()).toEqual([]);
    });

    it('should reject a tuple naming an application the organisation cannot reach with BOT_004', async () => {
      await db.update(schema.applications).set({ visibility: 'RESTRICTED' }).where(eq(schema.applications.id, forgeApplicationId));
      await env.getService(ApplicationAccessService).invalidateGlobal();
      await env.getService(PolicyDecisionService).assignRole({ type: 'USER', id: adminId.toString() }, forgeProjectsReadRoleId, orgId);

      const response = await replace([forgeGrant('read')]);
      expect(response.statusCode).toBe(409);
      expect(codeOf(response)).toBe('BOT_004');

      const listed = await request('get', `/api/v1/organisations/${orgId}/bot-permission-catalog`, adminSecret);
      expect((listed.json() as CatalogJson).applications.find(application => application.applicationId === forgeApplicationId)).toBeUndefined();
    });

    it('should collapse duplicate entries in one desired set to a single assignment', async () => {
      expect((await replace([identityGrant('members', 'read'), identityGrant('members', 'read')])).statusCode).toBe(200);
      expect(await grants()).toHaveLength(1);

      const assignments = await db
        .select()
        .from(schema.roleAssignments)
        .where(and(eq(schema.roleAssignments.principalType, 'SERVICE_ACCOUNT'), eq(schema.roleAssignments.principalId, botClientId)));
      expect(assignments).toHaveLength(1);
    });

    it('should converge two interleaved writes of the same grant onto one assignment', async () => {
      const [first, second] = await Promise.all([replace([identityGrant('members', 'read')]), replace([identityGrant('members', 'read')])]);
      expect([first.statusCode, second.statusCode]).toEqual([200, 200]);

      const assignments = await db
        .select()
        .from(schema.roleAssignments)
        .where(and(eq(schema.roleAssignments.principalType, 'SERVICE_ACCOUNT'), eq(schema.roleAssignments.principalId, botClientId)));
      expect(assignments).toHaveLength(1);
      expect(await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'bot.permissions.changed'))).toHaveLength(1);
    });

    it('should leave a platform-staff assignment in place and mark it unmanaged', async () => {
      const humansOnlyRoleId = env
        .getService(ApplicationService)
        .getApplicationByIdOrThrow(forgeApplicationId)
        .roles.find(role => role.roleName === 'HumansOnly')?.id as number;
      await env.getService(PolicyDecisionService).assignRole({ type: 'SERVICE_ACCOUNT', id: botClientId }, humansOnlyRoleId, orgId, otherAdminId.toString());

      expect((await replace([identityGrant('members', 'read')])).statusCode).toBe(200);
      const remaining = await db
        .select()
        .from(schema.roleAssignments)
        .where(and(eq(schema.roleAssignments.principalType, 'SERVICE_ACCOUNT'), eq(schema.roleAssignments.principalId, botClientId)));
      expect(remaining.map(row => row.roleId)).toContain(humansOnlyRoleId);

      const staffGrant = (await grants()).find(grant => grant.roleId === humansOnlyRoleId);
      expect(staffGrant).toMatchObject({ managed: false, eligible: false });
      expect(staffGrant?.grantedBy?.id).toBe(otherAdminId.toString());
    });

    /** A grant the UI shows must always be clearable; a role that stopped being bot-grantable cannot be named by any desired set, so omission has to revoke it. */
    it('should revoke its own grant once the role stops being bot-grantable', async () => {
      await env.getService(PolicyDecisionService).assignRole({ type: 'USER', id: adminId.toString() }, forgeProjectsReadRoleId, orgId);
      expect((await replace([forgeGrant('read')])).statusCode).toBe(200);
      expect((await grants()).map(grant => grant.roleId)).toContain(forgeProjectsReadRoleId);

      await db.update(schema.applicationRoles).set({ botGrantable: false, botResource: null, botLevel: null }).where(eq(schema.applicationRoles.id, forgeProjectsReadRoleId));
      const orphaned = (await grants()).find(grant => grant.roleId === forgeProjectsReadRoleId);
      expect(orphaned).toMatchObject({ managed: true, eligible: false });
      expect(orphaned?.resource).toBeUndefined();

      expect((await replace([])).statusCode).toBe(200);
      expect(await grants()).toEqual([]);
    });

    it('should refuse a suspended organisation with BOT_013', async () => {
      await db
        .update(schema.organisations)
        .set({ status: 'SUSPENDED' })
        .where(eq(schema.organisations.id, BigInt(orgId)));
      const response = await replace([identityGrant('members', 'read')]);
      expect(response.statusCode).toBe(409);
      expect(codeOf(response)).toBe('BOT_013');
    });
  });

  describe('stale grants', () => {
    it('should keep a grant after its granter is demoted and report it as no longer held', async () => {
      const otherSecret = await session(otherAdminId);
      expect((await request('put', permissionsPath(), otherSecret, { grants: [identityGrant('members', 'read')] })).statusCode).toBe(200);

      const beforeDemotion = await grants();
      expect(beforeDemotion[0]).toMatchObject({ granterHoldsPermission: true, grantedBy: { id: otherAdminId.toString(), displayName: 'Sam Ortiz' } });

      await env.getService(OrganisationService).updateMemberRole(BigInt(orgId), otherAdminId, 'MEMBER');
      const afterDemotion = await grants();
      expect(afterDemotion).toHaveLength(1);
      expect(afterDemotion[0]).toMatchObject({ granterHoldsPermission: false, grantedBy: { displayName: 'Sam Ortiz' } });
    });

    it('should report a grant as held while its granter still holds it', async () => {
      await replace([identityGrant('members', 'read')]);
      expect((await grants())[0]?.granterHoldsPermission).toBe(true);
    });

    it('should keep the original granter when a later save leaves the grant in place', async () => {
      const otherSecret = await session(otherAdminId);
      await request('put', permissionsPath(), otherSecret, { grants: [identityGrant('members', 'read')] });
      await replace([identityGrant('members', 'read'), identityGrant('domains', 'read')]);

      const members = (await grants()).find(grant => grant.resource === 'members');
      expect(members?.grantedBy?.id).toBe(otherAdminId.toString());
    });
  });

  describe('POST /bots with grants', () => {
    const createWith = (grantList: Record<string, unknown>[], secret = adminSecret) =>
      request('post', `/api/v1/organisations/${orgId}/bots`, secret, { handle: `created-${seq++}`, displayName: 'Created', grants: grantList });

    it('should grant through the same validation path on creation', async () => {
      const response = await createWith([identityGrant('members', 'read')]);
      expect(response.statusCode).toBe(201);

      const created = (response.json() as { id: string }).id;
      expect((await grants(created)).map(grant => grant.resource)).toEqual(['members']);
      const events = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'bot.permissions.changed'));
      expect(events).toHaveLength(1);
    });

    it('should create no bot at all when a grant is refused', async () => {
      const before = await env.getService(BotService).listBots(BigInt(orgId));
      const response = await createWith([forgeGrant('read')]);
      expect(response.statusCode).toBe(403);
      expect(codeOf(response)).toBe('BOT_005');

      const after = await env.getService(BotService).listBots(BigInt(orgId));
      expect(after.bots).toHaveLength(before.bots.length);
    });
  });

  /**
   * heldRoleIds treats organisation rank as holding every bot-grantable role of the platform application, so a
   * new one added outside IDENTITY_BOT_ROLES would become grantable by any ADMIN without anyone deciding that.
   */
  describe('platform rank rule', () => {
    it('should keep the platform’s bot-grantable roles equal to IDENTITY_BOT_ROLES', () => {
      const seeded = env
        .getService(ApplicationService)
        .getApplicationOrThrow('shadow-identity')
        .roles.filter(role => role.botGrantable);
      expect(seeded.map(role => `${role.roleName}:${role.botResource}:${role.botLevel}`).sort()).toEqual(
        IDENTITY_BOT_ROLES.map(role => `${role.name}:${role.resource}:${role.level}`).sort(),
      );
    });
  });

  describe('access control', () => {
    it('should answer another organisation’s bot with BOT_009', async () => {
      const foreignId = await createUser('foreign@example.com');
      const foreignOrgId = (await env.getService(OrganisationService).createTeam(foreignId, { name: 'Globex' })).id.toString();
      const foreignSecret = await session(foreignId);

      const response = await request('get', `/api/v1/organisations/${foreignOrgId}/bots/${botId}/permissions`, foreignSecret);
      expect(response.statusCode).toBe(404);
      expect(codeOf(response)).toBe('BOT_009');
    });

    it('should refuse a plain member', async () => {
      const memberId = await createUser('member@example.com');
      await env.getService(OrganisationService).ensureMember(BigInt(orgId), memberId, 'MEMBER');
      const memberSecret = await session(memberId);

      expect((await request('get', `/api/v1/organisations/${orgId}/bot-permission-catalog`, memberSecret)).statusCode).toBe(403);
      expect((await request('get', permissionsPath(), memberSecret)).statusCode).toBe(403);
    });
  });
});
