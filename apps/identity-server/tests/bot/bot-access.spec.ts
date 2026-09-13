import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { and, eq, inArray } from 'drizzle-orm';

import { APP_NAME } from '@server/constants';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { BOT_PERMISSIONS, BotKeyService, BotService, IDENTITY_BOT_ROLES } from '@server/modules/identity/bot';
import { InvitationService, OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { RateLimiterService } from '@server/modules/infrastructure/security';
import { ApplicationService } from '@server/modules/system/application';

import { csrfPair, TestEnvironment } from '../test-environment';

type Method = 'get' | 'post' | 'patch' | 'delete';

interface Route {
  method: Method;
  path: string;
  body?: Record<string, unknown>;
}

const env = new TestEnvironment('bot_access').init();

const DAY_MS = 24 * 60 * 60 * 1000;

describe('AccessGuard bot mode', () => {
  let db: PrimaryDatabase;
  let ownerId: bigint;
  let adminId: bigint;
  let memberId: bigint;
  let orgId: bigint;
  let foreignOrgId: bigint;
  let botId: bigint;
  let botClientId: string;
  let key: string;
  let keyId: string;
  let invitationId: bigint;

  const asBot = (route: Route, bearer = key) => {
    const mock = env.getRouter().mockRequest();
    const chain = mock[route.method](route.path).headers({ authorization: `Bearer ${bearer}` });
    return route.body ? chain.body(route.body) : chain;
  };

  const asUser = async (route: Route, userId: bigint) => {
    const { secret } = await env.getService(SessionService).create({ userId, aal: 'AAL1' });
    const csrf = csrfPair();
    const mock = env.getRouter().mockRequest();
    const chain = mock[route.method](route.path)
      .headers({ 'x-csrf-token': csrf.header })
      .cookies({ [SESSION_COOKIE_NAME]: secret, 'csrf-token': csrf.cookie });
    return route.body ? chain.body(route.body) : chain;
  };

  const codeOf = (response: { json: () => unknown }): string => (response.json() as { code: string }).code;

  const grant = async (...roleNames: string[]): Promise<void> => {
    const roles = env.getService(ApplicationService).getApplicationOrThrow(APP_NAME).roles;
    for (const name of roleNames) {
      const role = roles.find(candidate => candidate.roleName === name);
      if (!role) throw new Error(`role ${name} was not seeded`);
      await env.getService(PolicyDecisionService).assignRole({ type: 'SERVICE_ACCOUNT', id: botClientId }, role.id, orgId.toString(), adminId.toString());
    }
  };

  const base = (organisationId: bigint = orgId): string => `/api/v1/organisations/${organisationId}`;

  const botRoutes = (): (Route & { permission: string; role: string })[] => [
    { method: 'get', path: `${base()}/members`, permission: BOT_PERMISSIONS.membersRead, role: 'OrgMembersReader' },
    {
      method: 'patch',
      path: `${base()}/members/${memberId}/status`,
      body: { status: 'SUSPENDED', reason: 'automation' },
      permission: BOT_PERMISSIONS.membersWrite,
      role: 'OrgMembersManager',
    },
    { method: 'get', path: `${base()}/invitations`, permission: BOT_PERMISSIONS.invitationsWrite, role: 'OrgInvitationsManager' },
    {
      method: 'post',
      path: `${base()}/invitations`,
      body: { email: 'new@example.com', role: 'MEMBER' },
      permission: BOT_PERMISSIONS.invitationsWrite,
      role: 'OrgInvitationsManager',
    },
    { method: 'delete', path: `${base()}/invitations/${invitationId}`, permission: BOT_PERMISSIONS.invitationsWrite, role: 'OrgInvitationsManager' },
    { method: 'get', path: `${base()}/domains`, permission: BOT_PERMISSIONS.domainsRead, role: 'OrgDomainsReader' },
  ];

  beforeEach(async () => {
    db = env.getPostgresClient();
    const users = env.getService(UserService);
    const createUser = async (email: string) => (await users.createUserWithPassword({ email, password: 'Password@123', status: 'ACTIVE', emailVerified: true })).id;
    ownerId = await createUser('owner@example.com');
    adminId = await createUser('admin@example.com');
    memberId = await createUser('member@example.com');
    const foreignOwnerId = await createUser('foreign@example.com');

    const organisations = env.getService(OrganisationService);
    orgId = (await organisations.createTeam(ownerId, { name: 'Acme' })).id;
    foreignOrgId = (await organisations.createTeam(foreignOwnerId, { name: 'Globex' })).id;
    await organisations.ensureMember(orgId, adminId, 'ADMIN');
    await organisations.ensureMember(orgId, memberId, 'MEMBER');
    await organisations.ensureMember(foreignOrgId, memberId, 'MEMBER');

    const organisation = await organisations.getOrganisation(orgId);
    const invitation = await env.getService(InvitationService).invite({ organisation, email: 'pending@example.com', role: 'MEMBER', invitedBy: adminId });
    invitationId = invitation.id;
    await db
      .insert(schema.organisationDomains)
      .values({ organisationId: orgId, domain: 'acme.example.com', verificationToken: 'token', status: 'VERIFIED', verifiedAt: new Date() });

    const bot = await env.getService(BotService).createBot({ userId: adminId }, orgId, { handle: 'automation', displayName: 'Automation' });
    botId = bot.id;
    botClientId = bot.clientId;
    const created = await env.getService(BotKeyService).createKey({ userId: adminId }, orgId, botId, { name: 'ci', expiresAt: new Date(Date.now() + 30 * DAY_MS).toISOString() });
    key = created.key;
    keyId = created.id;
  });

  afterEach(() => {
    env.getService(RateLimiterService).enabled = false;
  });

  describe('seeded identity bot roles', () => {
    it('should seed every bot-grantable role on the platform application with its bot columns and permissions', async () => {
      const application = env.getService(ApplicationService).getApplicationOrThrow(APP_NAME);
      const roles = await db.query.applicationRoles.findMany({
        where: and(
          eq(schema.applicationRoles.applicationId, application.id),
          inArray(
            schema.applicationRoles.roleName,
            IDENTITY_BOT_ROLES.map(role => role.name),
          ),
        ),
      });
      expect(roles).toHaveLength(IDENTITY_BOT_ROLES.length);

      for (const definition of IDENTITY_BOT_ROLES) {
        const role = roles.find(candidate => candidate.roleName === definition.name);
        expect(role).toMatchObject({ botGrantable: true, botResource: definition.resource, botLevel: definition.level, isSensitive: false, isDefault: false });

        const permissions = await db
          .select({ name: schema.permissions.name })
          .from(schema.rolePermissions)
          .innerJoin(schema.permissions, eq(schema.permissions.id, schema.rolePermissions.permissionId))
          .where(eq(schema.rolePermissions.roleId, role!.id));
        expect(permissions.map(permission => permission.name).sort()).toEqual([...definition.permissions].sort());
      }
    });
  });

  describe('enabled routes', () => {
    it('should admit a bot on each enabled route once the PDP permits its permission', async () => {
      for (const route of botRoutes()) {
        const denied = await asBot(route);
        expect({ route: route.path, method: route.method, status: denied.statusCode, code: codeOf(denied) }).toEqual({
          route: route.path,
          method: route.method,
          status: 403,
          code: 'ORG_007',
        });
      }

      await grant('OrgMembersManager', 'OrgInvitationsManager', 'OrgDomainsReader');
      for (const route of botRoutes()) {
        const admitted = await asBot(route);
        expect({ route: route.path, method: route.method, status: admitted.statusCode }).toEqual({ route: route.path, method: route.method, status: 200 });
      }

      const membership = await env.getService(OrganisationService).getMembership(memberId, orgId);
      expect(membership?.status).toBe('SUSPENDED');
      const invitation = await db.query.organisationInvitations.findFirst({ where: eq(schema.organisationInvitations.email, 'new@example.com') });
      expect(invitation?.invitedBy).toBeNull();
    });

    it('should list what each read route returns to a bot', async () => {
      await grant('OrgMembersReader', 'OrgDomainsReader', 'OrgInvitationsManager');

      const members = (await asBot({ method: 'get', path: `${base()}/members` })).json() as { members: { userId: string }[] };
      expect(members.members.map(member => member.userId).sort()).toEqual([ownerId, adminId, memberId].map(String).sort());
      const domains = (await asBot({ method: 'get', path: `${base()}/domains` })).json() as { domains: { domain: string }[] };
      expect(domains.domains.map(domain => domain.domain)).toEqual(['acme.example.com']);
      const invitations = (await asBot({ method: 'get', path: `${base()}/invitations` })).json() as { invitations: { id: string }[] };
      expect(invitations.invitations.map(item => item.id)).toEqual([invitationId.toString()]);
    });

    it('should record bot actions against the bot service account', async () => {
      await grant('OrgMembersManager', 'OrgInvitationsManager');
      expect((await asBot({ method: 'patch', path: `${base()}/members/${memberId}/status`, body: { status: 'BLOCKED' } })).statusCode).toBe(200);
      expect((await asBot({ method: 'post', path: `${base()}/invitations`, body: { email: 'new@example.com', role: 'MEMBER' } })).statusCode).toBe(200);
      expect((await asBot({ method: 'delete', path: `${base()}/invitations/${invitationId}` })).statusCode).toBe(200);

      const events = await db
        .select()
        .from(schema.auditEvents)
        .where(inArray(schema.auditEvents.action, ['org.member_blocked', 'org.invitation_sent', 'org.invitation_revoked']));
      expect(events).toHaveLength(3);
      for (const event of events) expect(event).toMatchObject({ actorType: 'SERVICE_ACCOUNT', actorId: botClientId, organisationId: orgId.toString() });
    });

    it('should grant a permission only through the role that carries it', async () => {
      await grant('OrgMembersReader');
      expect((await asBot({ method: 'get', path: `${base()}/members` })).statusCode).toBe(200);
      const write = await asBot({ method: 'patch', path: `${base()}/members/${memberId}/status`, body: { status: 'SUSPENDED' } });
      expect(write.statusCode).toBe(403);
      expect(codeOf(write)).toBe('ORG_007');
    });
  });

  describe('refusals', () => {
    beforeEach(async () => {
      await grant(...IDENTITY_BOT_ROLES.map(role => role.name));
    });

    const expectUnauthenticated = async (bearer = key): Promise<void> => {
      const response = await asBot({ method: 'get', path: `${base()}/members` }, bearer);
      expect(response.statusCode).toBe(401);
      expect(codeOf(response)).toBe('AUTH_005');
    };

    it('should answer a malformed or revoked key with 401', async () => {
      await expectUnauthenticated('sl_bot_garbage');
      await env.getService(BotKeyService).revokeKey({ userId: adminId }, orgId, botId, keyId);
      await expectUnauthenticated();
    });

    it('should answer a suspended bot with 401', async () => {
      await env.getService(BotService).suspendBot({ userId: adminId }, orgId, botId);
      await expectUnauthenticated();
    });

    it('should answer a bot in an inactive organisation with 401', async () => {
      await db.update(schema.organisations).set({ status: 'SUSPENDED' }).where(eq(schema.organisations.id, orgId));
      await expectUnauthenticated();
    });

    it('should evaluate the IP allowlist against the connection address', async () => {
      await env.getService(BotService).updateBot({ userId: adminId }, orgId, botId, { ipAllowlist: ['198.51.100.0/24'] });
      await expectUnauthenticated();

      await env.getService(BotService).updateBot({ userId: adminId }, orgId, botId, { ipAllowlist: ['127.0.0.1'] });
      expect((await asBot({ method: 'get', path: `${base()}/members` })).statusCode).toBe(200);
    });

    it('should never let a bot invite anyone but a member', async () => {
      const response = await asBot({ method: 'post', path: `${base()}/invitations`, body: { email: 'new@example.com', role: 'ADMIN' } });
      expect(response.statusCode).toBe(403);
      expect(codeOf(response)).toBe('ORG_007');
      expect(await db.query.organisationInvitations.findFirst({ where: eq(schema.organisationInvitations.email, 'new@example.com') })).toBeUndefined();
    });

    it('should never let a bot replace or revoke an invitation that is not for a member', async () => {
      const organisation = await env.getService(OrganisationService).getOrganisation(orgId);
      const adminInvitation = await env.getService(InvitationService).invite({ organisation, email: 'future-admin@example.com', role: 'ADMIN', invitedBy: adminId });

      const replaced = await asBot({ method: 'post', path: `${base()}/invitations`, body: { email: 'future-admin@example.com', role: 'MEMBER' } });
      expect(replaced.statusCode).toBe(403);
      expect(codeOf(replaced)).toBe('ORG_007');

      const revoked = await asBot({ method: 'delete', path: `${base()}/invitations/${adminInvitation.id}` });
      expect(revoked.statusCode).toBe(403);
      expect(codeOf(revoked)).toBe('ORG_007');

      const invitations = await db.query.organisationInvitations.findMany({ where: eq(schema.organisationInvitations.email, 'future-admin@example.com') });
      expect(invitations.map(invitation => ({ id: invitation.id, role: invitation.role, revokedAt: invitation.revokedAt }))).toEqual([
        { id: adminInvitation.id, role: 'ADMIN', revokedAt: null },
      ]);

      expect((await asBot({ method: 'post', path: `${base()}/invitations`, body: { email: 'pending@example.com', role: 'MEMBER' } })).statusCode).toBe(200);
      expect((await db.query.organisationInvitations.findFirst({ where: eq(schema.organisationInvitations.id, invitationId) }))?.revokedAt).not.toBeNull();
      expect((await asBot({ method: 'delete', path: `${base()}/invitations/999999` })).statusCode).toBe(404);
    });

    it('should refuse routes that do not declare a bot permission', async () => {
      const routes: Route[] = [
        { method: 'get', path: base() },
        { method: 'patch', path: base(), body: { name: 'Renamed' } },
        { method: 'patch', path: `${base()}/members/${memberId}`, body: { role: 'ADMIN' } },
        { method: 'delete', path: `${base()}/members/${memberId}` },
        { method: 'get', path: `${base()}/applications` },
        { method: 'get', path: `${base()}/bots` },
        { method: 'get', path: '/api/v1/me/organisations' },
      ];
      for (const route of routes) {
        const response = await asBot(route);
        expect({ path: route.path, method: route.method, status: response.statusCode, code: codeOf(response) }).toEqual({
          path: route.path,
          method: route.method,
          status: 403,
          code: 'ORG_007',
        });
      }
      expect((await env.getService(OrganisationService).getMembership(memberId, orgId))?.role).toBe('MEMBER');
    });

    it('should refuse elevated routes', async () => {
      const routes: Route[] = [
        { method: 'post', path: `${base()}/bots`, body: { handle: 'spawned', displayName: 'Spawned' } },
        { method: 'post', path: `${base()}/domains`, body: { domain: 'evil.example.com' } },
        { method: 'delete', path: base() },
      ];
      for (const route of routes) {
        const response = await asBot(route);
        expect(response.statusCode).toBe(403);
        expect(codeOf(response)).toBe('ORG_007');
      }
    });

    it("should refuse another organisation's routes", async () => {
      const routes: Route[] = [
        { method: 'get', path: `${base(foreignOrgId)}/members` },
        { method: 'patch', path: `${base(foreignOrgId)}/members/${memberId}/status`, body: { status: 'SUSPENDED' } },
        { method: 'post', path: `${base(foreignOrgId)}/invitations`, body: { email: 'new@example.com', role: 'MEMBER' } },
        { method: 'get', path: `${base(foreignOrgId)}/domains` },
      ];
      for (const route of routes) {
        const response = await asBot(route);
        expect(response.statusCode).toBe(403);
        expect(codeOf(response)).toBe('ORG_001');
      }
      expect((await env.getService(OrganisationService).getMembership(memberId, foreignOrgId))?.status).toBe('ACTIVE');
    });

    it('should never let a bot act on an owner or an admin, or invite an owner', async () => {
      for (const target of [ownerId, adminId]) {
        const response = await asBot({ method: 'patch', path: `${base()}/members/${target}/status`, body: { status: 'SUSPENDED' } });
        expect(response.statusCode).toBe(403);
        expect(codeOf(response)).toBe('ORG_007');
      }
      expect((await asBot({ method: 'post', path: `${base()}/invitations`, body: { email: 'boss@example.com', role: 'OWNER' } })).statusCode).toBe(422);

      const statuses = await db.query.organisationMembers.findMany({ where: eq(schema.organisationMembers.organisationId, orgId) });
      expect(statuses.every(membership => membership.status === 'ACTIVE')).toBe(true);
    });

    it("should spend the bot's own request budget and answer 429 beyond it, even with the abuse-control kill switch off", async () => {
      await env.getService(BotService).updateBot({ userId: adminId }, orgId, botId, { rateLimitPerMinute: 2 });
      expect(env.getService(RateLimiterService).enabled).toBe(false);

      expect((await asBot({ method: 'get', path: `${base()}/members` })).statusCode).toBe(200);
      expect((await asBot({ method: 'get', path: `${base()}/members` })).statusCode).toBe(200);
      expect((await asBot({ method: 'get', path: `${base()}/members` })).statusCode).toBe(429);
    });
  });

  describe('humans', () => {
    it('should keep the human membership and role checks unchanged on bot-enabled routes', async () => {
      await grant(...IDENTITY_BOT_ROLES.map(role => role.name));

      expect((await asUser({ method: 'get', path: `${base()}/members` }, memberId)).statusCode).toBe(200);
      const memberWrite = await asUser({ method: 'patch', path: `${base()}/members/${adminId}/status`, body: { status: 'SUSPENDED' } }, memberId);
      expect(memberWrite.statusCode).toBe(403);
      expect(codeOf(memberWrite)).toBe('ORG_007');
      expect((await asUser({ method: 'get', path: `${base()}/invitations` }, memberId)).statusCode).toBe(403);

      expect((await asUser({ method: 'patch', path: `${base()}/members/${memberId}/status`, body: { status: 'SUSPENDED' } }, adminId)).statusCode).toBe(200);
      expect((await asUser({ method: 'post', path: `${base()}/invitations`, body: { email: 'human@example.com', role: 'MEMBER' } }, adminId)).statusCode).toBe(200);

      const [event] = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'org.member_suspended'));
      expect(event).toMatchObject({ actorType: 'USER', actorId: adminId.toString() });
      const invitation = await db.query.organisationInvitations.findFirst({ where: eq(schema.organisationInvitations.email, 'human@example.com') });
      expect(invitation?.invitedBy).toBe(adminId);
    });

    it('should not admit a human through a bot permission alone', async () => {
      const outsider = await env.getService(UserService).createUserWithPassword({ email: 'outsider@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
      const response = await asUser({ method: 'get', path: `${base()}/members` }, outsider.id);
      expect(response.statusCode).toBe(403);
      expect(codeOf(response)).toBe('ORG_001');
    });
  });
});
