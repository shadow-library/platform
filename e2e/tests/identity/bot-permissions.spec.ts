/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  addOrganisationMember,
  assignApplicationRole,
  type AuthzApi,
  type BotGrant,
  type CatalogManifest,
  createApplicationRole,
  createAuthzApi,
  csrfHeaders,
  findApplicationIdByName,
  findAuditEvents,
  IDENTITY_CSRF_SEED_PATH,
  identityDb,
  identityMutate,
  type IdentityUser,
  invalidateAllGrants,
  type OAuthApplication,
  type OrganisationBot,
  type OrganisationRole,
  PLATFORM_APPLICATION_NAME,
  readBotAuthzVersion,
  readCatalogRole,
  readCatalogRoles,
  setRoleBotGrant,
  updateOrganisation,
  updateOrganisationMember,
} from '../../lib';
import { expect, type IdentityHarness, type IdentityTeam, test } from './fixtures';
import { expectErrorCode } from './helpers';

/**
 * Defining types
 */

interface CatalogLevel {
  roleId: number;
  roleName: string;
  level: string;
  sensitive: boolean;
  eligible: boolean;
  heldByYou: boolean;
}

interface CatalogApplication {
  applicationId: number;
  name: string;
  resources: { resource: string; levels: CatalogLevel[] }[];
}

interface GrantItem {
  roleId: number;
  roleName: string;
  applicationId: number;
  application: string;
  resource?: string;
  level?: string;
  sensitive: boolean;
  eligible: boolean;
  grantedBy?: { id: string; displayName?: string };
  granterHoldsPermission: boolean;
  managed: boolean;
}

/**
 * Declaring the constants
 *
 * What an organisation may hand a bot, and what the server re-checks when it does. The grantable roles come from the
 * real catalog sync — a manifest pushed to a throwaway application by its own client — because bot grantability,
 * sensitivity and the resource/level slot a grant is named by are all columns only that sync writes. Identity's own
 * `identity:org:*` roles are the exception: they are held by organisation rank, so an ADMIN may grant them without
 * holding any role assignment, and the platform application's grantable set is asserted against them rather than
 * pushed to.
 *
 * Every refusal here is followed by the grant that must still succeed, and every grant is read back from both the
 * API and the `role_assignments` row behind it, since the provenance marker that separates a grant made here from a
 * platform-staff assignment lives only in that row.
 */

const READ = 'widgets:read';
const WRITE = 'widgets:write';
const LEDGER = 'ledger:read';

const catalogPath = (organisationId: string): string => `/api/v1/organisations/${organisationId}/bot-permission-catalog`;

const permissionsPath = (bot: OrganisationBot): string => `/api/v1/organisations/${bot.organisationId}/bots/${bot.botId}/permissions`;

/** Two grantable widget levels, a sensitive one, a ledger role the manifest never makes grantable. */
const WIDGET_MANIFEST: CatalogManifest = {
  permissions: [{ name: READ }, { name: WRITE }, { name: LEDGER }],
  roles: [
    { name: 'WidgetReader', permissions: [READ], bot: { resource: 'widgets', level: 'read' } },
    { name: 'WidgetWriter', permissions: [READ, WRITE], bot: { resource: 'widgets', level: 'write', sensitive: true } },
    { name: 'LedgerReader', permissions: [LEDGER] },
  ],
};

async function expectRefused(response: APIResponse, status: number, code: string, message?: string): Promise<void> {
  expect(response.status(), message ?? (await response.text())).toBe(status);
  await expectErrorCode(response, code);
}

async function teamMember(identity: IdentityHarness, team: IdentityTeam, label: string, role: OrganisationRole): Promise<{ user: IdentityUser; ctx: APIRequestContext }> {
  const user = await identity.createUser({ label });
  await addOrganisationMember(team.organisationId, user.userId, { role });
  const { ctx } = await identity.signIn(user, { aal: 'AAL2' });
  return { user, ctx };
}

/** A throwaway application carrying `WIDGET_MANIFEST`, reachable by every `ALL_APPS` organisation once the grant cache is dropped. */
async function widgetApplication(identity: IdentityHarness, label: string, visibility?: 'RESTRICTED'): Promise<AuthzApi> {
  const application = await identity.createOAuthApp(label, visibility ? { visibility } : {});
  const api = await createAuthzApi((await identity.admin()).ctx, await identity.anonymous(), application);
  await api.syncOrThrow(WIDGET_MANIFEST);
  await invalidateAllGrants();
  return api;
}

async function catalog(ctx: APIRequestContext, organisationId: string): Promise<CatalogApplication[]> {
  const response = await ctx.get(catalogPath(organisationId));
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as { applications: CatalogApplication[] }).applications;
}

function levelOf(applications: CatalogApplication[], application: OAuthApplication | string, resource: string, level: string): CatalogLevel | undefined {
  const name = typeof application === 'string' ? application : application.name;
  return applications
    .find(item => item.name === name)
    ?.resources.find(item => item.resource === resource)
    ?.levels.find(item => item.level === level);
}

/** A bot's grants by role name: the API orders them by the bot resource, which a role that stopped being grantable no longer has. */
async function grantsOf(ctx: APIRequestContext, bot: OrganisationBot): Promise<GrantItem[]> {
  const response = await ctx.get(permissionsPath(bot));
  expect(response.status(), await response.text()).toBe(200);
  const { grants } = (await response.json()) as { grants: GrantItem[] };
  return grants.sort((left, right) => left.roleName.localeCompare(right.roleName));
}

function replaceGrants(ctx: APIRequestContext, bot: OrganisationBot, grants: BotGrant[]): Promise<APIResponse> {
  return identityMutate(ctx, 'put', permissionsPath(bot), { grants });
}

function widgetGrant(api: AuthzApi, level: 'read' | 'write'): BotGrant {
  return { applicationId: api.application.applicationId, resource: 'widgets', level };
}

/** The `role_assignments` rows behind a bot, with the provenance marker the API only reports as `managed`. */
async function assignmentsOf(bot: OrganisationBot): Promise<{ roleId: number; grantedBy: string | null }[]> {
  return identityDb()<{ roleId: number; grantedBy: string | null }[]>`
    SELECT role_id AS "roleId", granted_by AS "grantedBy" FROM role_assignments
    WHERE principal_type = 'SERVICE_ACCOUNT' AND principal_id = ${bot.clientId} ORDER BY role_id
  `;
}

async function permissionChangeCount(bot: OrganisationBot): Promise<number> {
  return (await findAuditEvents('bot.permissions.changed', bot.botId)).length;
}

interface RacedReplacement {
  statuses: number[];
  assignments: { roleId: number; grantedBy: string | null }[];
  audits: number;
  roleId: number;
  granterUserId: string;
}

/** Two identical grant replacements fired together on one CSRF token, since each seeding GET reissues the one before it. */
async function racingReplacements(identity: IdentityHarness, label: string): Promise<RacedReplacement> {
  const team = await identity.createTeam({ label });
  const bot = await identity.createBot(team, { label });
  const api = await widgetApplication(identity, label);
  const reader = await readCatalogRole(api.application.applicationId, 'WidgetReader');
  await assignApplicationRole({ type: 'USER', id: team.owner.userId }, reader.roleId, team.organisationId);

  const headers = await csrfHeaders(team.ownerCtx, IDENTITY_CSRF_SEED_PATH);
  const racing = await Promise.all(Array.from({ length: 2 }, () => team.ownerCtx.put(permissionsPath(bot), { headers, data: { grants: [widgetGrant(api, 'read')] } })));
  return {
    statuses: racing.map(response => response.status()),
    assignments: await assignmentsOf(bot),
    audits: await permissionChangeCount(bot),
    roleId: reader.roleId,
    granterUserId: team.owner.userId,
  };
}

test.describe('identity bot permissions — catalog and grant validation', () => {
  test('should catalog only bot-grantable roles of applications the organisation reaches and mark what the admin holds', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'botcat' });
    const bot = await identity.createBot(team, { label: 'botcat' });
    const reachable = await widgetApplication(identity, 'botcat-open');
    const withheld = await widgetApplication(identity, 'botcat-withheld', 'RESTRICTED');
    const member = await teamMember(identity, team, 'botcat-member', 'MEMBER');

    const applications = await catalog(team.ownerCtx, team.organisationId);
    expect(applications.find(item => item.name === reachable.application.name)?.resources, 'only the grantable slots, ordered read before write').toEqual([
      {
        resource: 'widgets',
        levels: [
          expect.objectContaining({ roleName: 'WidgetReader', level: 'read', sensitive: false, eligible: true, heldByYou: false }),
          expect.objectContaining({ roleName: 'WidgetWriter', level: 'write', sensitive: true, eligible: true, heldByYou: false }),
        ],
      },
    ]);
    expect(
      applications.map(item => item.name),
      'a restricted application the organisation cannot reach is not catalogued',
    ).not.toContain(withheld.application.name);

    expect(levelOf(applications, PLATFORM_APPLICATION_NAME, 'members', 'read')?.heldByYou, "identity's own bot roles are held by organisation rank").toBe(true);

    const reader = await readCatalogRole(reachable.application.applicationId, 'WidgetReader');
    await assignApplicationRole({ type: 'USER', id: team.owner.userId }, reader.roleId, team.organisationId);
    const afterAssignment = await catalog(team.ownerCtx, team.organisationId);
    expect(levelOf(afterAssignment, reachable.application, 'widgets', 'read')?.heldByYou, "another application's permission is held only once the admin is assigned it").toBe(true);
    expect(levelOf(afterAssignment, reachable.application, 'widgets', 'write')?.heldByYou, 'the writer role needs a permission the reader role does not carry').toBe(false);

    await expectRefused(await member.ctx.get(catalogPath(team.organisationId)), 403, 'ORG_007', 'a plain member reading the catalog');
    await expectRefused(await member.ctx.get(permissionsPath(bot)), 403, 'ORG_007', "a plain member reading a bot's grants");
    expect(await grantsOf(team.ownerCtx, bot), 'its admin still reads them').toEqual([]);
  });

  test('should offer exactly identity’s own bot roles on the platform application', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'botcat-identity' });
    const platform = (await catalog(team.ownerCtx, team.organisationId)).find(item => item.name === PLATFORM_APPLICATION_NAME);
    const identityBotRoles = [
      ['domains', 'read', 'OrgDomainsReader'],
      ['invitations', 'write', 'OrgInvitationsManager'],
      ['members', 'read', 'OrgMembersReader'],
      ['members', 'write', 'OrgMembersManager'],
    ];

    expect(
      platform?.resources.flatMap(resource => resource.levels.map(level => [resource.resource, level.level, level.roleName])),
      'an extra grantable role here would silently become grantable by every organisation admin',
    ).toEqual(identityBotRoles);
    expect(
      platform?.resources.flatMap(resource => resource.levels.map(level => level.heldByYou)),
      'an owner holds all of them by rank',
    ).toEqual([true, true, true, true]);
    expect(
      (await readCatalogRoles(platform?.applicationId ?? 0)).filter(role => role.botGrantable).map(role => [role.botResource, role.botLevel, role.roleName]),
      'the catalog reports the whole grantable set of the platform application',
    ).toEqual([...identityBotRoles].sort((left, right) => String(left[2]).localeCompare(String(right[2]))));
  });

  test('should replace the managed grant set, audit the difference and bump the bot’s authorization version', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'botperm-replace' });
    const bot = await identity.createBot(team, { label: 'botperm-replace' });
    const api = await widgetApplication(identity, 'botperm-replace');
    const writer = await readCatalogRole(api.application.applicationId, 'WidgetWriter');
    const reader = await readCatalogRole(api.application.applicationId, 'WidgetReader');
    await assignApplicationRole({ type: 'USER', id: team.owner.userId }, writer.roleId, team.organisationId);
    const version = await readBotAuthzVersion(bot.clientId);

    const granted = await replaceGrants(team.ownerCtx, bot, [widgetGrant(api, 'read')]);
    expect(granted.status(), await granted.text()).toBe(200);
    expect(await grantsOf(team.ownerCtx, bot)).toEqual([
      expect.objectContaining({
        roleName: 'WidgetReader',
        application: api.application.name,
        resource: 'widgets',
        level: 'read',
        eligible: true,
        managed: true,
        granterHoldsPermission: true,
        grantedBy: { id: team.owner.userId, displayName: 'E2E Factory' },
      }),
    ]);
    expect(await assignmentsOf(bot), 'the assignment carries the marker that makes it this endpoint’s to change').toEqual([
      { roleId: reader.roleId, grantedBy: `bot:${team.owner.userId}` },
    ]);
    expect(await readBotAuthzVersion(bot.clientId), 'a grant change invalidates every cached decision for the bot').toBeGreaterThan(version);
    expect((await findAuditEvents('bot.permissions.changed', bot.botId))[0]?.detail).toMatchObject({
      added: [expect.objectContaining({ application: api.application.name, resource: 'widgets', level: 'read' })],
      removed: [],
    });

    expect((await replaceGrants(team.ownerCtx, bot, [widgetGrant(api, 'read')])).status(), 'writing the same set again succeeds').toBe(200);
    expect(await permissionChangeCount(bot), 'but audits nothing, because nothing changed').toBe(1);

    const swapped = await replaceGrants(team.ownerCtx, bot, [widgetGrant(api, 'write'), widgetGrant(api, 'write')]);
    expect(swapped.status(), await swapped.text()).toBe(200);
    expect(await assignmentsOf(bot), 'a duplicated entry collapses to one assignment and the omitted level is revoked').toEqual([
      { roleId: writer.roleId, grantedBy: `bot:${team.owner.userId}` },
    ]);

    expect((await replaceGrants(team.ownerCtx, bot, [])).status(), 'an empty set clears everything').toBe(200);
    expect(await grantsOf(team.ownerCtx, bot)).toEqual([]);
    expect(await assignmentsOf(bot)).toEqual([]);
  });

  test('should converge two concurrent identical replacements on one assignment', async ({ identity }) => {
    const race = await racingReplacements(identity, 'botperm-race');
    expect(race.statuses, 'both writers are told the set they asked for is in force').toEqual([200, 200]);
    expect(race.assignments, 'they converge on one assignment').toEqual([{ roleId: race.roleId, grantedBy: `bot:${race.granterUserId}` }]);
  });

  // App bug: `added` is computed from a read taken before the insert (bot-permission.service.ts:243) and the insert
  // itself discards the loser (`onConflictDoNothing`, :251), so both writers audit the grant one of them never made.
  test.fixme('should audit two concurrent identical replacements once', async ({ identity }) => {
    const race = await racingReplacements(identity, 'botperm-race-audit');
    expect(race.audits, 'a converged write is one change, so it is one audit row').toBe(1);
  });

  test('should refuse a grant the catalog does not offer or the admin does not hold, and grant nothing', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'botperm-refuse' });
    const bot = await identity.createBot(team, { label: 'botperm-refuse' });
    const api = await widgetApplication(identity, 'botperm-refuse');
    const withheld = await widgetApplication(identity, 'botperm-unreachable', 'RESTRICTED');
    const hollow = await createApplicationRole(api.application.applicationId, { label: 'Hollow' });
    await setRoleBotGrant(hollow.roleId, { resource: 'hollow', level: 'read' });

    await expectRefused(
      await replaceGrants(team.ownerCtx, bot, [{ applicationId: api.application.applicationId, resource: 'ledger', level: 'read' }]),
      409,
      'BOT_004',
      'a role the application never made bot-grantable',
    );
    await expectRefused(await replaceGrants(team.ownerCtx, bot, [widgetGrant(withheld, 'read')]), 409, 'BOT_004', 'an application the organisation cannot reach');

    const overclaimed = await identityMutate(team.ownerCtx, 'put', permissionsPath(bot), {
      grants: [{ ...widgetGrant(api, 'write'), heldByYou: true, eligible: true }],
    });
    await expectRefused(overclaimed, 403, 'BOT_005', 'a grant the admin does not hold, however the body describes it');

    expect(levelOf(await catalog(team.ownerCtx, team.organisationId), api.application, 'hollow', 'read')?.heldByYou, 'a role carrying no permission is never held').toBe(false);
    await expectRefused(
      await replaceGrants(team.ownerCtx, bot, [{ applicationId: api.application.applicationId, resource: 'hollow', level: 'read' }]),
      403,
      'BOT_005',
      'a bot-grantable role carrying no permission',
    );
    expect(await assignmentsOf(bot), 'no refused replacement granted anything').toEqual([]);

    const writer = await readCatalogRole(api.application.applicationId, 'WidgetWriter');
    await assignApplicationRole({ type: 'USER', id: team.owner.userId }, writer.roleId, team.organisationId);
    const granted = await replaceGrants(team.ownerCtx, bot, [widgetGrant(api, 'write')]);
    expect(granted.status(), 'the admin grants it once it is held').toBe(200);
  });

  test('should validate grants given at creation and create no bot at all when one is refused', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'botperm-create' });
    const api = await widgetApplication(identity, 'botperm-create');
    const reader = await readCatalogRole(api.application.applicationId, 'WidgetReader');
    await assignApplicationRole({ type: 'USER', id: team.owner.userId }, reader.roleId, team.organisationId);
    const createWith = (handle: string, grants: BotGrant[]): Promise<APIResponse> =>
      identityMutate(team.ownerCtx, 'post', `/api/v1/organisations/${team.organisationId}/bots`, { handle, displayName: 'E2E Granted', grants });

    const created = await createWith('e2e-botperm-granted', [widgetGrant(api, 'read')]);
    expect(created.status(), await created.text()).toBe(201);
    const body = (await created.json()) as { id: string; clientId: string };
    const granted: OrganisationBot = { botId: body.id, clientId: body.clientId, handle: 'e2e-botperm-granted', organisationId: team.organisationId };
    identity.trackBot(granted);
    expect(await grantsOf(team.ownerCtx, granted), 'the grant is applied with the creation').toEqual([expect.objectContaining({ roleName: 'WidgetReader', managed: true })]);
    expect(await permissionChangeCount(granted), 'the creation audits the grant once').toBe(1);

    const refused = await createWith('e2e-botperm-refused', [widgetGrant(api, 'write')]);
    await expectRefused(refused, 403, 'BOT_005', 'a creation carrying a grant the admin does not hold');
    const [leftover] = await identityDb()<{ count: number }[]>`
      SELECT (SELECT count(*)::int FROM bots WHERE organisation_id = ${team.organisationId} AND handle = 'e2e-botperm-refused')
           + (SELECT count(*)::int FROM oauth_clients WHERE name = 'e2e-botperm-refused[bot]') AS count
    `;
    expect(leftover?.count, 'the refused creation left neither a bot nor an orphan client behind').toBe(0);
  });
});

test.describe('identity bot permissions — provenance and organisation state', () => {
  test('should leave a platform-staff assignment alone and revoke a grant whose role stopped being grantable', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'botperm-staff' });
    const bot = await identity.createBot(team, { label: 'botperm-staff' });
    const api = await widgetApplication(identity, 'botperm-staff');
    const reader = await readCatalogRole(api.application.applicationId, 'WidgetReader');
    const ledger = await readCatalogRole(api.application.applicationId, 'LedgerReader');
    await assignApplicationRole({ type: 'USER', id: team.owner.userId }, reader.roleId, team.organisationId);

    const platformStaff = await identity.admin();
    const staffAssignment = { roleId: ledger.roleId, grantedBy: platformStaff.session.userId };
    const staff = await identityMutate(platformStaff.ctx, 'post', '/api/v1/admin/role-assignments', {
      principalType: 'SERVICE_ACCOUNT',
      principalId: bot.clientId,
      roleId: ledger.roleId,
      organisationId: team.organisationId,
    });
    expect(staff.status(), await staff.text()).toBe(200);

    expect((await replaceGrants(team.ownerCtx, bot, [widgetGrant(api, 'read')])).status()).toBe(200);
    const [staffGrant, managedGrant] = await grantsOf(team.ownerCtx, bot);
    expect(staffGrant, 'the staff assignment is shown for transparency and marked as no business of this endpoint').toMatchObject({
      roleName: 'LedgerReader',
      managed: false,
      eligible: false,
    });
    expect(staffGrant, 'a role that is not bot-grantable carries no resource to name it by').not.toHaveProperty('resource');
    expect(managedGrant).toMatchObject({ roleName: 'WidgetReader', managed: true, eligible: true, resource: 'widgets', level: 'read' });

    expect((await replaceGrants(team.ownerCtx, bot, [])).status(), 'a replacement that names nothing').toBe(200);
    expect(await assignmentsOf(bot), 'clears what this endpoint wrote and leaves the staff assignment standing').toEqual([staffAssignment]);

    expect((await replaceGrants(team.ownerCtx, bot, [widgetGrant(api, 'read')])).status()).toBe(200);
    await api.syncOrThrow({ ...WIDGET_MANIFEST, roles: WIDGET_MANIFEST.roles.map(({ name, permissions }) => ({ name, permissions })) });
    const [, stranded] = await grantsOf(team.ownerCtx, bot);
    expect(stranded, 'a grant made here stays managed once its role stops being grantable').toMatchObject({ roleName: 'WidgetReader', managed: true, eligible: false });
    expect(stranded, 'and loses the resource and level no desired set could name it by').not.toHaveProperty('resource');
    expect(stranded).not.toHaveProperty('level');

    expect((await replaceGrants(team.ownerCtx, bot, [])).status(), 'a set that cannot name it still revokes it').toBe(200);
    expect(await assignmentsOf(bot)).toEqual([staffAssignment]);
  });

  test('should keep a grant through its granter’s demotion and refuse a replacement in a suspended organisation', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'botperm-granter' });
    const bot = await identity.createBot(team, { label: 'botperm-granter' });
    const granter = await teamMember(identity, team, 'botperm-granter', 'ADMIN');
    const members: BotGrant[] = [{ applicationId: await findApplicationIdByName(PLATFORM_APPLICATION_NAME), resource: 'members', level: 'read' }];

    expect((await replaceGrants(granter.ctx, bot, members)).status(), 'an admin grants identity’s own roles by rank alone').toBe(200);
    expect(await grantsOf(team.ownerCtx, bot)).toEqual([
      expect.objectContaining({ roleName: 'OrgMembersReader', granterHoldsPermission: true, grantedBy: { id: granter.user.userId, displayName: 'E2E Factory' } }),
    ]);

    await updateOrganisationMember(team.organisationId, granter.user.userId, { role: 'MEMBER' });
    expect(await grantsOf(team.ownerCtx, bot), 'the grant outlives the rank it was made with, and says so').toEqual([
      expect.objectContaining({ roleName: 'OrgMembersReader', granterHoldsPermission: false, grantedBy: { id: granter.user.userId, displayName: 'E2E Factory' } }),
    ]);

    expect((await replaceGrants(team.ownerCtx, bot, members)).status(), 'the owner keeps the grant in a later save').toBe(200);
    expect(await assignmentsOf(bot), 'a kept grant keeps the granter it was made by').toEqual([{ roleId: expect.any(Number), grantedBy: `bot:${granter.user.userId}` }]);

    await updateOrganisation(team.organisationId, { status: 'SUSPENDED' });
    await expectRefused(await replaceGrants(team.ownerCtx, bot, []), 409, 'BOT_013', 'a replacement in a suspended organisation');
    await updateOrganisation(team.organisationId, { status: 'ACTIVE' });
    expect((await replaceGrants(team.ownerCtx, bot, [])).status(), 'a reinstated organisation changes grants again').toBe(200);
  });
});
