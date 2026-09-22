/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  addOrganisationMember,
  addScimGroupMember,
  assignApplicationRole,
  type AuthzApi,
  authzApiFor,
  type AuthzCheck,
  type AuthzDecision,
  type CatalogBotGrant,
  type CatalogManifest,
  createAuthzApi,
  createOrganisationBot,
  createScimGroup,
  deleteOrganisationBotRecord,
  deleteRoleAssignmentsFor,
  findApplicationIdByName,
  findApplicationRoleId,
  findAuditEvents,
  findPlatformOrganisationId,
  findRoleAssignmentOrganisationIds,
  IAM_ADMIN_ROLE_NAME,
  identityDb,
  identityMutate,
  type IdentityUser,
  type OAuthApplicationOptions,
  type OrganisationBot,
  PLATFORM_APPLICATION_NAME,
  readCatalogPermissions,
  readCatalogRole,
  readCatalogRoles,
  readRolePermissions,
  resumeOrganisationBot,
  type RolePrincipal,
  suspendOrganisationBot,
  updateOrganisation,
  updateOrganisationMember,
} from '../../lib';
import { expect, type IdentityHarness, test } from './fixtures';
import { expectErrorCode } from './helpers';

/**
 * Defining types
 */

interface GroupMappingItem {
  id: string;
  groupId: string;
  roleId: number;
  organisationId: string;
}

interface RoleAssignmentBody {
  principalType: 'USER' | 'SERVICE_ACCOUNT' | 'ORGANISATION';
  principalId: string;
  roleId: number;
  organisationId: string;
}

/**
 * Declaring the constants
 *
 * Identity's policy decision point and the catalog behind it, driven as an application's back end drives them: a
 * client-credentials token on the application's own client, a declarative role manifest pushed through
 * `PUT /api/v1/authz/catalog`, and decisions read from `POST /api/v1/authz/check`. Every manifest targets a throwaway
 * application the test created — the seeded ecosystem applications are only ever read, and the claim that one
 * application's sync leaves another's catalog alone is made against identity's own seeded roles without pushing to
 * them. Roles and permissions come from the sync under test; the database factories arrange only the assignments,
 * memberships and directory rows no manifest carries.
 */

const BASE62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const READ = 'widgets:read';
const WRITE = 'widgets:write';
const DAY_MS = 24 * 60 * 60 * 1000;
const SCIM_GRANT_MARKER = 'scim:group:';

let cleanups: (() => Promise<unknown>)[] = [];

/** A client id shaped like a bot's but backing no bot row, which the PDP must treat as an ordinary service account. */
function botShapedClientId(): string {
  return `bot_${Array.from(randomBytes(22), byte => BASE62[byte % 62]).join('')}`;
}

function readerManifest(roleName = 'WidgetReader'): CatalogManifest {
  return { permissions: [{ name: READ }, { name: WRITE }], roles: [{ name: roleName, permissions: [READ] }] };
}

/** Removes assignments written onto a role that no throwaway-application cascade reaches. */
function trackAssignments(principal: RolePrincipal): void {
  cleanups.push(() => deleteRoleAssignmentsFor(principal));
}

/** A bot's OAuth client is `ON DELETE restrict`, so it outlives its organisation unless the test removes it. */
function trackBot(bot: OrganisationBot): void {
  cleanups.push(() => deleteOrganisationBotRecord(bot));
}

/** A throwaway application whose own client holds `authz:check` and `authz:roles:sync`. */
async function authzApp(identity: IdentityHarness, ctx: APIRequestContext, label: string, options?: OAuthApplicationOptions): Promise<AuthzApi> {
  const application = await identity.createOAuthApp(label, options);
  return createAuthzApi((await identity.admin()).ctx, ctx, application);
}

function checkFor(user: IdentityUser, organisationId: string, action: string): AuthzCheck {
  return { principalType: 'USER', principalId: user.userId, organisationId, action };
}

async function assignThroughAdmin(identity: IdentityHarness, body: RoleAssignmentBody): Promise<void> {
  const response = await identityMutate((await identity.admin()).ctx, 'post', '/api/v1/admin/role-assignments', body);
  expect(response.status(), await response.text()).toBe(200);
}

async function revokeThroughAdmin(identity: IdentityHarness, body: RoleAssignmentBody): Promise<void> {
  const response = await identityMutate((await identity.admin()).ctx, 'post', '/api/v1/admin/role-assignments/revoke', body);
  expect(response.status(), await response.text()).toBe(200);
}

async function assignmentCountFor(user: IdentityUser): Promise<number> {
  const [row] = await identityDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM role_assignments WHERE principal_type = 'USER' AND principal_id = ${user.userId}`;
  return row?.count ?? 0;
}

async function grantorsOf(user: IdentityUser, roleId: number): Promise<string[]> {
  const rows = await identityDb()<{ grantedBy: string | null }[]>`
    SELECT granted_by AS "grantedBy" FROM role_assignments WHERE principal_type = 'USER' AND principal_id = ${user.userId} AND role_id = ${roleId}
  `;
  return rows.map(row => row.grantedBy ?? '');
}

test.beforeEach(() => {
  cleanups = [];
});

test.afterEach(async () => {
  const pending = cleanups.reverse();
  cleanups = [];
  const errors: unknown[] = [];
  for (const cleanup of pending) await cleanup().catch((error: unknown) => errors.push(error));
  if (errors.length > 0) throw new AggregateError(errors, `authz cleanup failed in ${errors.length} step(s)`);
});

test.describe('identity authz — policy decisions', () => {
  test('should decide only for the calling application, denying another application’s permission and a platform admin one the principal holds', async ({ identity }) => {
    const ctx = await identity.anonymous();
    const alpha = await authzApp(identity, ctx, 'pdp-alpha');
    const beta = await authzApp(identity, ctx, 'pdp-beta');
    await alpha.syncOrThrow(readerManifest());
    await beta.syncOrThrow(readerManifest());
    const team = await identity.createTeam({ label: 'pdp-scope' });
    const user = await identity.createUser({ label: 'pdp-scope' });
    await addOrganisationMember(team.organisationId, user.userId);
    trackAssignments({ type: 'USER', id: user.userId });

    const request = checkFor(user, team.organisationId, READ);
    expect(await alpha.decide(request), 'nothing is granted before an assignment').toMatchObject({
      decision: 'DENY',
      reasons: ['no assigned role grants this permission for the application'],
    });

    const alphaRole = await readCatalogRole(alpha.application.applicationId, 'WidgetReader');
    await assignApplicationRole({ type: 'USER', id: user.userId }, alphaRole.roleId, team.organisationId);
    expect(await alpha.decide(request)).toMatchObject({ decision: 'PERMIT', reasons: [`granted by application-scoped role permission '${READ}'`] });
    expect(await beta.decide(request), 'the same permission name on another application is not the caller’s to grant').toMatchObject({ decision: 'DENY' });

    const iamAdminRoleId = await findApplicationRoleId(PLATFORM_APPLICATION_NAME, IAM_ADMIN_ROLE_NAME);
    await assignApplicationRole({ type: 'USER', id: user.userId }, iamAdminRoleId, team.organisationId);
    expect(await findRoleAssignmentOrganisationIds({ type: 'USER', id: user.userId }, iamAdminRoleId), 'the principal really holds the platform admin role').toEqual([
      team.organisationId,
    ]);
    expect(
      await alpha.decide(checkFor(user, team.organisationId, 'iam:users:read')),
      'a platform admin permission is never reachable through an application’s decision point',
    ).toMatchObject({ decision: 'DENY' });
    expect(await alpha.decide(request), 'the application’s own permission still decides').toMatchObject({ decision: 'PERMIT' });
  });

  test('should fail closed for a caller whose client is gone and refuse a call that is unauthenticated or lacks the check scope', async ({ identity }) => {
    const ctx = await identity.anonymous();
    const admin = (await identity.admin()).ctx;
    const app = await authzApp(identity, ctx, 'pdp-closed');
    await app.syncOrThrow(readerManifest());
    const user = await identity.createUser({ label: 'pdp-closed' });
    const request = checkFor(user, user.personalOrgId, READ);

    const orphaned = await identity.createOAuthClientOn(app.application, { kind: 'SERVICE', grantTypes: ['client_credentials'], suffix: 'orphan' });
    const orphan = await authzApiFor(admin, ctx, orphaned);
    expect((await orphan.check(request)).status(), 'the caller decides while its client exists').toBe(200);
    expect((await identityMutate(admin, 'delete', `/api/v1/admin/clients/${orphaned.clientId}`)).status()).toBe(200);
    const unbound = await orphan.check(request);
    expect(unbound.status()).toBe(403);
    await expectErrorCode(unbound, 'AUTHZ_002');

    const anonymous = await identity.anonymous();
    const unauthenticated = await anonymous.post('/api/v1/authz/check', { data: request });
    expect(unauthenticated.status()).toBe(401);
    await expectErrorCode(unauthenticated, 'SEC_003');

    const syncOnly = await app.scoped('authz:roles:sync');
    const underScoped = await syncOnly.check(request);
    expect(underScoped.status()).toBe(403);
    await expectErrorCode(underScoped, 'SEC_004');

    expect((await app.check(request)).status(), 'the application’s own caller is still admitted').toBe(200);
  });

  test.fixme('should reject a check whose organisation id is not an organisation id', async ({ identity }) => {
    // `CheckRequestBody.organisationId` is an unconstrained string (authz.dto.ts:11-12) and `resolveRoleIds` opens with an unguarded `BigInt` (policy-decision.service.ts:195), unlike the bot path's `isNumericId` guard (policy-decision.service.ts:108), so identity answers 500.
    const ctx = await identity.anonymous();
    const app = await authzApp(identity, ctx, 'pdp-malformed');
    await app.syncOrThrow(readerManifest());
    const user = await identity.createUser({ label: 'pdp-malformed' });

    const refused = await app.check({ principalType: 'USER', principalId: user.userId, organisationId: 'not-an-organisation', action: READ });
    expect(refused.status(), await refused.text()).toBe(422);
    await expectErrorCode(refused, 'VALIDATION_ERROR');
    const { fields } = (await refused.json()) as { fields?: { field: string }[] };
    expect(fields?.map(entry => entry.field)).toContain('body.organisationId');
  });

  test('should keep a grant inside its organisation, deny an ungranted action, and raise authzVersion on assign, org-wide grant and revoke', async ({ identity }) => {
    const ctx = await identity.anonymous();
    const app = await authzApp(identity, ctx, 'pdp-version');
    await app.syncOrThrow(readerManifest());
    const { roleId } = await readCatalogRole(app.application.applicationId, 'WidgetReader');
    const here = await identity.createTeam({ label: 'pdp-here' });
    const elsewhere = await identity.createTeam({ label: 'pdp-elsewhere' });
    const user = await identity.createUser({ label: 'pdp-version' });
    for (const team of [here, elsewhere]) await addOrganisationMember(team.organisationId, user.userId);
    trackAssignments({ type: 'USER', id: user.userId });

    const unassigned = await app.decide(checkFor(user, here.organisationId, READ));
    expect(unassigned.decision, 'a principal holding no role is denied').toBe('DENY');

    await assignThroughAdmin(identity, { principalType: 'USER', principalId: user.userId, roleId, organisationId: here.organisationId });
    const assigned = await app.decide(checkFor(user, here.organisationId, READ));
    expect(assigned.decision).toBe('PERMIT');
    expect(assigned.authzVersion, 'assigning a role raises the version').toBeGreaterThan(unassigned.authzVersion);
    expect(await app.decide(checkFor(user, here.organisationId, WRITE)), 'an action outside the granted permissions').toMatchObject({ decision: 'DENY' });

    const outside = await app.decide(checkFor(user, elsewhere.organisationId, READ));
    expect(outside.decision, 'a grant in one organisation does not carry into another').toBe('DENY');

    await assignThroughAdmin(identity, { principalType: 'ORGANISATION', principalId: elsewhere.organisationId, roleId, organisationId: elsewhere.organisationId });
    const orgWide = await app.decide(checkFor(user, elsewhere.organisationId, READ));
    expect(orgWide.decision).toBe('PERMIT');
    expect(orgWide.authzVersion, 'an organisation-wide grant raises the version').toBeGreaterThan(outside.authzVersion);

    await revokeThroughAdmin(identity, { principalType: 'USER', principalId: user.userId, roleId, organisationId: here.organisationId });
    const revoked = await app.decide(checkFor(user, here.organisationId, READ));
    expect(revoked.decision).toBe('DENY');
    expect(revoked.authzVersion, 'revoking raises the version').toBeGreaterThan(assigned.authzVersion);
  });

  test('should deny a bot that is suspended, asked about another organisation or held by an inactive one, and treat a bot-shaped service account with no bot as ordinary', async ({
    identity,
  }) => {
    const ctx = await identity.anonymous();
    const app = await authzApp(identity, ctx, 'pdp-bot');
    await app.syncOrThrow(readerManifest());
    const { roleId } = await readCatalogRole(app.application.applicationId, 'WidgetReader');
    const team = await identity.createTeam({ label: 'pdp-bot' });
    const other = await identity.createTeam({ label: 'pdp-bot-other' });
    const bot = await createOrganisationBot(team.ownerCtx, team.organisationId, { label: 'pdp' });
    trackBot(bot);
    for (const organisationId of [team.organisationId, other.organisationId]) {
      await assignApplicationRole({ type: 'SERVICE_ACCOUNT', id: bot.clientId }, roleId, organisationId);
    }

    const decideFor = (principalId: string, organisationId: string): Promise<AuthzDecision> =>
      app.decide({ principalType: 'SERVICE_ACCOUNT', principalId, organisationId, action: READ });

    expect(await decideFor(bot.clientId, team.organisationId)).toMatchObject({ decision: 'PERMIT' });
    expect(await decideFor(bot.clientId, other.organisationId), 'a bot never answers for an organisation that is not its own').toMatchObject({
      decision: 'DENY',
      reasons: ['the bot belongs to another organisation'],
    });

    await suspendOrganisationBot(team.ownerCtx, bot);
    expect(await decideFor(bot.clientId, team.organisationId)).toMatchObject({ decision: 'DENY', reasons: ['the bot is not active'] });
    await resumeOrganisationBot(team.ownerCtx, bot);
    expect(await decideFor(bot.clientId, team.organisationId), 'a resumed bot decides again').toMatchObject({ decision: 'PERMIT' });

    await updateOrganisation(team.organisationId, { status: 'DELETED' });
    expect(await decideFor(bot.clientId, team.organisationId)).toMatchObject({ decision: 'DENY', reasons: ['the organisation is not active'] });
    await updateOrganisation(team.organisationId, { status: 'ACTIVE' });
    expect(await decideFor(bot.clientId, team.organisationId), 'the organisation is active again').toMatchObject({ decision: 'PERMIT' });

    const ghost = botShapedClientId();
    await assignApplicationRole({ type: 'SERVICE_ACCOUNT', id: ghost }, roleId, team.organisationId);
    expect(await decideFor(ghost, team.organisationId), 'a bot-shaped id backing no bot is an ordinary service account').toMatchObject({ decision: 'PERMIT' });
  });
});

test.describe('identity authz — catalog sync', () => {
  test('should upsert a declared catalog and refuse a push that is unauthenticated or lacks the sync scope', async ({ identity }) => {
    const ctx = await identity.anonymous();
    const app = await authzApp(identity, ctx, 'catalog-push');
    const applicationId = app.application.applicationId;
    const manifest: CatalogManifest = {
      permissions: [{ name: READ }, { name: WRITE, description: 'change widgets' }],
      roles: [{ name: 'WidgetWriter', permissions: [READ, WRITE] }],
    };

    expect(await app.syncOrThrow(manifest)).toEqual({ permissionsUpserted: 2, permissionsDeleted: 0, rolesUpserted: 1, rolesDeleted: 0, principalsInvalidated: 0 });
    expect(await readCatalogPermissions(applicationId)).toEqual([READ, WRITE]);
    const role = await readCatalogRole(applicationId, 'WidgetWriter');
    expect(role).toMatchObject({ isDefault: false, botGrantable: false, botResource: null, botLevel: null, isSensitive: false });
    expect(await readRolePermissions(role.roleId)).toEqual([READ, WRITE]);

    const anonymous = await identity.anonymous();
    const unauthenticated = await anonymous.put('/api/v1/authz/catalog', { data: manifest });
    expect(unauthenticated.status()).toBe(401);
    await expectErrorCode(unauthenticated, 'SEC_003');

    const checkOnly = await app.scoped('authz:check');
    const underScoped = await checkOnly.sync(manifest);
    expect(underScoped.status()).toBe(403);
    await expectErrorCode(underScoped, 'SEC_004');

    expect((await app.sync(manifest)).status(), 'the application’s own caller still syncs').toBe(200);
  });

  test('should refuse a manifest deleting more than half the catalog, allow exactly half, and let force through', async ({ identity }) => {
    const ctx = await identity.anonymous();
    const app = await authzApp(identity, ctx, 'catalog-guard');
    const applicationId = app.application.applicationId;
    const one = 'a:one';
    const kept = [one, 'a:two', 'a:three', 'a:four'];
    const manifestOf = (permissions: string[], force?: boolean): CatalogManifest => ({
      permissions: permissions.map(name => ({ name })),
      roles: [{ name: 'Keeper', permissions }],
      ...(force ? { force } : {}),
    });
    await app.syncOrThrow(manifestOf(kept));

    const refused = await app.sync(manifestOf([one]));
    expect(refused.status()).toBe(409);
    await expectErrorCode(refused, 'AUTHZ_004');
    expect(await readCatalogPermissions(applicationId), 'a refused sync changes nothing').toEqual([...kept].sort());

    const audits = await findAuditEvents('authz.catalog.sync_refused', String(applicationId));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ outcome: 'DENIED', actorType: 'SERVICE_ACCOUNT', actorId: app.clientId, targetType: 'application' });
    expect(audits[0]?.detail).toMatchObject({ permissionsDeleted: 3, permissionsExisting: 4, rolesDeleted: 0, rolesExisting: 1 });

    expect(await app.syncOrThrow(manifestOf([one], true)), 'force overrides the guardrail').toMatchObject({ permissionsDeleted: 3, rolesDeleted: 0 });
    expect(await readCatalogPermissions(applicationId)).toEqual([one]);

    await app.syncOrThrow(manifestOf(kept));
    expect(await app.syncOrThrow(manifestOf(kept.slice(0, 2))), 'exactly half is allowed without force').toMatchObject({ permissionsDeleted: 2 });
    expect(await readCatalogPermissions(applicationId)).toEqual([...kept.slice(0, 2)].sort());
  });

  test('should drop a role’s assignments and invalidate its holders when a forced sync removes it', async ({ identity }) => {
    const ctx = await identity.anonymous();
    const app = await authzApp(identity, ctx, 'catalog-drop');
    await app.syncOrThrow(readerManifest('Doomed'));
    const role = await readCatalogRole(app.application.applicationId, 'Doomed');
    const team = await identity.createTeam({ label: 'catalog-drop' });
    const user = await identity.createUser({ label: 'catalog-drop' });
    await addOrganisationMember(team.organisationId, user.userId);
    trackAssignments({ type: 'USER', id: user.userId });
    await assignApplicationRole({ type: 'USER', id: user.userId }, role.roleId, team.organisationId);

    const granted = await app.decide(checkFor(user, team.organisationId, READ));
    expect(granted.decision).toBe('PERMIT');

    const dropped = await app.syncOrThrow({ permissions: [{ name: READ }, { name: WRITE }], roles: [], force: true });
    expect(dropped).toMatchObject({ rolesDeleted: 1, principalsInvalidated: 1 });
    expect(await readCatalogRoles(app.application.applicationId)).toEqual([]);
    expect(await findRoleAssignmentOrganisationIds({ type: 'USER', id: user.userId }, role.roleId), 'the assignment went with the role').toEqual([]);

    const revoked = await app.decide(checkFor(user, team.organisationId, READ));
    expect(revoked.decision).toBe('DENY');
    expect(revoked.authzVersion, 'the holder’s cached decisions are invalidated').toBeGreaterThan(granted.authzVersion);
  });

  test('should keep a role and its assignments when the manifest rebinds its permissions', async ({ identity }) => {
    const ctx = await identity.anonymous();
    const app = await authzApp(identity, ctx, 'catalog-rebind');
    await app.syncOrThrow(readerManifest('Rebound'));
    const before = await readCatalogRole(app.application.applicationId, 'Rebound');
    const team = await identity.createTeam({ label: 'catalog-rebind' });
    const user = await identity.createUser({ label: 'catalog-rebind' });
    await addOrganisationMember(team.organisationId, user.userId);
    trackAssignments({ type: 'USER', id: user.userId });
    await assignApplicationRole({ type: 'USER', id: user.userId }, before.roleId, team.organisationId);
    expect(await app.decide(checkFor(user, team.organisationId, READ))).toMatchObject({ decision: 'PERMIT' });

    const rebound = await app.syncOrThrow({ permissions: [{ name: READ }, { name: WRITE }], roles: [{ name: 'Rebound', permissions: [WRITE] }] });
    expect(rebound).toMatchObject({ rolesDeleted: 0, permissionsDeleted: 0, principalsInvalidated: 1 });

    const after = await readCatalogRole(app.application.applicationId, 'Rebound');
    expect(after.roleId, 'the role keeps its identity across a rebinding').toBe(before.roleId);
    expect(await readRolePermissions(after.roleId)).toEqual([WRITE]);
    expect(await findRoleAssignmentOrganisationIds({ type: 'USER', id: user.userId }, before.roleId)).toEqual([team.organisationId]);
    expect(await app.decide(checkFor(user, team.organisationId, READ)), 'the permission the role no longer carries').toMatchObject({ decision: 'DENY' });
    expect(await app.decide(checkFor(user, team.organisationId, WRITE)), 'the permission it gained').toMatchObject({ decision: 'PERMIT' });
  });

  test('should reject an undeclared permission or a duplicated name and leave every other application’s catalog untouched', async ({ identity }) => {
    const ctx = await identity.anonymous();
    const app = await authzApp(identity, ctx, 'catalog-isolation');
    const neighbour = await authzApp(identity, ctx, 'catalog-neighbour');
    await neighbour.syncOrThrow(readerManifest('NeighbourReader'));
    const platformApplicationId = await findApplicationIdByName(PLATFORM_APPLICATION_NAME);
    const platformRolesBefore = await readCatalogRoles(platformApplicationId);
    const neighbourRolesBefore = await readCatalogRoles(neighbour.application.applicationId);

    const rejections: [string, CatalogManifest][] = [
      ['a role carrying a permission the manifest never declares', { permissions: [{ name: READ }], roles: [{ name: 'Stray', permissions: [WRITE] }] }],
      ['a duplicated permission name', { permissions: [{ name: READ }, { name: READ }], roles: [] }],
      [
        'a duplicated role name',
        {
          permissions: [{ name: READ }],
          roles: [
            { name: 'Twin', permissions: [READ] },
            { name: 'Twin', permissions: [] },
          ],
        },
      ],
    ];
    for (const [label, manifest] of rejections) {
      const response = await app.sync(manifest);
      expect(response.status(), label).toBe(400);
      await expectErrorCode(response, 'AUTHZ_001');
    }
    expect(await readCatalogPermissions(app.application.applicationId), 'a rejected manifest writes nothing').toEqual([]);

    await app.syncOrThrow(readerManifest('IsolatedReader'));
    expect(await readCatalogRoles(platformApplicationId), 'identity’s own bot-grantable roles are untouched by another application’s sync').toEqual(platformRolesBefore);
    expect(await readCatalogRoles(neighbour.application.applicationId)).toEqual(neighbourRolesBefore);
    expect((await readCatalogRoles(app.application.applicationId)).map(role => role.roleName)).toEqual(['IsolatedReader']);
  });

  test('should set and reset a role’s bot grant from the manifest and reject every malformed grant', async ({ identity }) => {
    const ctx = await identity.anonymous();
    const app = await authzApp(identity, ctx, 'catalog-bot');
    const applicationId = app.application.applicationId;
    const permissions = [{ name: READ }, { name: WRITE }];
    const granted: CatalogManifest = {
      permissions,
      roles: [
        { name: 'WidgetReader', permissions: [READ], bot: { resource: 'widgets', level: 'read' } },
        { name: 'WidgetWriter', permissions: [READ, WRITE], bot: { resource: 'widgets', level: 'write', sensitive: true } },
      ],
    };

    await app.syncOrThrow(granted);
    expect(await readCatalogRoles(applicationId)).toEqual([
      expect.objectContaining({ roleName: 'WidgetReader', botGrantable: true, botResource: 'widgets', botLevel: 'read', isSensitive: false }),
      expect.objectContaining({ roleName: 'WidgetWriter', botGrantable: true, botResource: 'widgets', botLevel: 'write', isSensitive: true }),
    ]);

    await app.syncOrThrow({ permissions, roles: granted.roles.map(({ name, permissions: names }) => ({ name, permissions: names })) });
    expect(await readCatalogRoles(applicationId), 'a manifest without the block resets grantability, resource, level and sensitivity together').toEqual([
      expect.objectContaining({ roleName: 'WidgetReader', botGrantable: false, botResource: null, botLevel: null, isSensitive: false }),
      expect.objectContaining({ roleName: 'WidgetWriter', botGrantable: false, botResource: null, botLevel: null, isSensitive: false }),
    ]);

    const roleWith = (bot: CatalogBotGrant, names: string[] = [READ]): CatalogManifest => ({ permissions, roles: [{ name: 'Solo', permissions: names, bot }] });
    const schemaRejections: [string, CatalogManifest][] = [
      ['an empty resource', roleWith({ resource: '', level: 'read' })],
      ['a resource over 64 characters', roleWith({ resource: 'w'.repeat(65), level: 'read' })],
      ['an unknown level', roleWith({ resource: 'widgets', level: 'sideways' as CatalogBotGrant['level'] })],
    ];
    for (const [label, manifest] of schemaRejections) {
      expect((await app.sync(manifest)).status(), label).toBe(422);
    }

    const serviceRejections: [string, CatalogManifest][] = [
      ['a padded resource', roleWith({ resource: ' widgets', level: 'read' })],
      ['a bot grant on a permission-less role', roleWith({ resource: 'widgets', level: 'read' }, [])],
      [
        'a write grant that is not a superset of the read grant',
        {
          permissions,
          roles: [
            { name: 'R', permissions: [READ], bot: { resource: 'widgets', level: 'read' } },
            { name: 'W', permissions: [WRITE], bot: { resource: 'widgets', level: 'write' } },
          ],
        },
      ],
      [
        'two roles claiming the same resource and level',
        {
          permissions,
          roles: [
            { name: 'R', permissions: [READ], bot: { resource: 'widgets', level: 'read' } },
            { name: 'S', permissions: [READ], bot: { resource: 'widgets', level: 'read' } },
          ],
        },
      ],
    ];
    for (const [label, manifest] of serviceRejections) {
      const response = await app.sync(manifest);
      expect(response.status(), label).toBe(400);
      await expectErrorCode(response, 'AUTHZ_001');
    }

    expect(await app.syncOrThrow(granted), 'the well-formed manifest still syncs').toMatchObject({ rolesUpserted: 2 });
    expect((await readCatalogRoles(applicationId)).map(role => role.botLevel)).toEqual(['read', 'write']);
  });
});

test.describe('identity authz — default roles and organisation grants', () => {
  test('should resolve a default role for every user of its own application with no assignment, and never for a service account', async ({ identity }) => {
    const ctx = await identity.anonymous();
    const app = await authzApp(identity, ctx, 'tier-default');
    const neighbour = await authzApp(identity, ctx, 'tier-neighbour');
    const defaulted: CatalogManifest = { permissions: [{ name: READ }, { name: WRITE }], roles: [{ name: 'Everyone', permissions: [READ], default: true }] };
    const neighbourAction = 'gadgets:read';
    await app.syncOrThrow(defaulted);
    await neighbour.syncOrThrow({ permissions: [{ name: neighbourAction }], roles: [{ name: 'Everyone', permissions: [neighbourAction], default: true }] });
    const user = await identity.createUser({ label: 'tier-default' });

    expect(await app.decide(checkFor(user, user.personalOrgId, READ)), 'a fresh user holds the default role’s permissions').toMatchObject({ decision: 'PERMIT' });
    expect(await assignmentCountFor(user), 'a default role writes no assignment').toBe(0);
    expect(await app.decide(checkFor(user, user.personalOrgId, WRITE)), 'only the permissions the default role carries').toMatchObject({ decision: 'DENY' });
    expect(await neighbour.decide(checkFor(user, user.personalOrgId, neighbourAction)), 'the neighbour’s default role is live too').toMatchObject({ decision: 'PERMIT' });
    expect(await app.decide(checkFor(user, user.personalOrgId, neighbourAction)), 'but never through another application’s decision point').toMatchObject({ decision: 'DENY' });

    expect(
      await app.decide({ principalType: 'SERVICE_ACCOUNT', principalId: app.clientId, organisationId: user.personalOrgId, action: READ }),
      'default roles never reach a service account',
    ).toMatchObject({ decision: 'DENY' });

    await app.syncOrThrow({ ...defaulted, roles: [{ name: 'Everyone', permissions: [READ] }] });
    expect(await app.decide(checkFor(user, user.personalOrgId, READ)), 'clearing default on a re-push withdraws it').toMatchObject({ decision: 'DENY' });
    await app.syncOrThrow(defaulted);
    expect(await app.decide(checkFor(user, user.personalOrgId, READ)), 'and setting it again restores it').toMatchObject({ decision: 'PERMIT' });
  });

  test('should grant an organisation-wide role to active members only, for its own application', async ({ identity }) => {
    const ctx = await identity.anonymous();
    const app = await authzApp(identity, ctx, 'tier-org');
    const neighbour = await authzApp(identity, ctx, 'tier-org-neighbour');
    await app.syncOrThrow(readerManifest('OrgReader'));
    await neighbour.syncOrThrow(readerManifest('OrgReader'));
    const { roleId } = await readCatalogRole(app.application.applicationId, 'OrgReader');
    const team = await identity.createTeam({ label: 'tier-org' });
    const member = await identity.createUser({ label: 'tier-org-member' });
    const outsider = await identity.createUser({ label: 'tier-org-outsider' });
    await addOrganisationMember(team.organisationId, member.userId);
    await assignApplicationRole({ type: 'ORGANISATION', id: team.organisationId }, roleId, team.organisationId);

    expect(await app.decide(checkFor(member, team.organisationId, READ))).toMatchObject({ decision: 'PERMIT' });
    expect(await app.decide(checkFor(outsider, team.organisationId, READ)), 'a non-member holds nothing an organisation-wide grant confers').toMatchObject({ decision: 'DENY' });
    expect(await neighbour.decide(checkFor(member, team.organisationId, READ)), 'the grant is scoped to its own application').toMatchObject({ decision: 'DENY' });

    await updateOrganisationMember(team.organisationId, member.userId, { status: 'SUSPENDED', statusUntil: new Date(Date.now() + DAY_MS) });
    expect(await app.decide(checkFor(member, team.organisationId, READ)), 'a suspended membership ends the grant').toMatchObject({ decision: 'DENY' });
    await updateOrganisationMember(team.organisationId, member.userId, { status: 'ACTIVE', statusUntil: null });

    await updateOrganisation(team.organisationId, { status: 'SUSPENDED' });
    expect(await app.decide(checkFor(member, team.organisationId, READ)), 'a suspended organisation ends it too').toMatchObject({ decision: 'DENY' });
    await updateOrganisation(team.organisationId, { status: 'ACTIVE' });
    expect(await app.decide(checkFor(member, team.organisationId, READ)), 'and reinstating the organisation restores it').toMatchObject({ decision: 'PERMIT' });
  });

  test('should remove the organisation principal’s grants when the organisation is closed', async ({ identity }) => {
    const ctx = await identity.anonymous();
    const app = await authzApp(identity, ctx, 'tier-close');
    await app.syncOrThrow(readerManifest('OrgReader'));
    const { roleId } = await readCatalogRole(app.application.applicationId, 'OrgReader');
    const team = await identity.createTeam({ label: 'tier-close' });
    const member = await identity.createUser({ label: 'tier-close-member' });
    await addOrganisationMember(team.organisationId, member.userId);
    await assignApplicationRole({ type: 'ORGANISATION', id: team.organisationId }, roleId, team.organisationId);
    expect(await app.decide(checkFor(member, team.organisationId, READ))).toMatchObject({ decision: 'PERMIT' });

    const closed = await identityMutate(team.ownerCtx, 'delete', `/api/v1/organisations/${team.organisationId}`);
    expect(closed.status(), await closed.text()).toBe(200);
    expect(await findRoleAssignmentOrganisationIds({ type: 'ORGANISATION', id: team.organisationId }, roleId)).toEqual([]);
    expect(await app.decide(checkFor(member, team.organisationId, READ))).toMatchObject({ decision: 'DENY' });
  });
});

test.describe('identity authz — service access rules', () => {
  test('should list the calling application’s rules, normalise and deduplicate them, and reject a malformed one', async ({ identity }) => {
    const ctx = await identity.anonymous();
    const admin = (await identity.admin()).ctx;
    const app = await authzApp(identity, ctx, 'access-owner');
    const caller = await identity.createOAuthApp('access-caller');
    const applicationId = app.application.applicationId;
    expect(await app.rules(), 'a fresh application opens no routes').toEqual([]);

    const create = (body: Record<string, unknown>): Promise<APIResponse> => identityMutate(admin, 'post', '/api/v1/admin/service-access', body);
    const rule = { applicationId, callerClientId: caller.serviceClient.clientId, method: 'get', pathPattern: '/internal/widgets/*' };
    const created = await create(rule);
    expect(created.status(), await created.text()).toBe(201);
    const body = (await created.json()) as { id: string; method: string };
    expect(body.method, 'the method is stored upper case').toBe('GET');

    const repeated = await create(rule);
    expect(repeated.status()).toBe(201);
    expect(((await repeated.json()) as { id: string }).id, 'a repeated rule is the same rule').toBe(body.id);
    expect(await app.rules()).toEqual([{ callerClientId: caller.serviceClient.clientId, method: 'GET', path: '/internal/widgets/*' }]);

    const rejections: [string, Record<string, unknown>][] = [
      ['an unknown method', { ...rule, method: 'FETCH' }],
      ['a path without a leading slash', { ...rule, pathPattern: 'internal/widgets' }],
      ['an unknown caller client', { ...rule, callerClientId: `e2e-absent-${randomBytes(4).toString('hex')}` }],
    ];
    for (const [label, invalid] of rejections) {
      const response = await create(invalid);
      expect(response.status(), label).toBe(400);
      await expectErrorCode(response, 'AUTHZ_003');
    }
    expect(await app.rules(), 'no refusal added a rule').toHaveLength(1);
  });

  test('should refuse a service-access listing that is unauthenticated or lacks the check scope', async ({ identity }) => {
    const ctx = await identity.anonymous();
    const app = await authzApp(identity, ctx, 'access-scope');

    const anonymous = await identity.anonymous();
    const unauthenticated = await anonymous.get('/api/v1/authz/service-access');
    expect(unauthenticated.status()).toBe(401);
    await expectErrorCode(unauthenticated, 'SEC_003');

    const syncOnly = await app.scoped('authz:roles:sync');
    const underScoped = await syncOnly.serviceAccess();
    expect(underScoped.status()).toBe(403);
    await expectErrorCode(underScoped, 'SEC_004');

    expect((await app.serviceAccess()).status(), 'the application’s own caller still lists').toBe(200);
  });
});

test.describe('identity authz — scim group role mappings', () => {
  test('should backfill and withdraw a group’s role, stay idempotent, and never disturb a manual grant', async ({ identity }) => {
    const ctx = await identity.anonymous();
    const admin = (await identity.admin()).ctx;
    const app = await authzApp(identity, ctx, 'scim-map');
    await app.syncOrThrow(readerManifest('GroupReader'));
    const { roleId } = await readCatalogRole(app.application.applicationId, 'GroupReader');
    const team = await identity.createTeam({ label: 'scim-map' });
    const member = await identity.createUser({ label: 'scim-member' });
    const manual = await identity.createUser({ label: 'scim-manual' });
    const group = await createScimGroup(team.organisationId, 'mapped');
    for (const user of [member, manual]) {
      await addOrganisationMember(team.organisationId, user.userId);
      await addScimGroupMember(group, user.userId);
    }
    await assignThroughAdmin(identity, { principalType: 'USER', principalId: manual.userId, roleId, organisationId: team.organisationId });

    expect(await app.decide(checkFor(member, team.organisationId, READ))).toMatchObject({ decision: 'DENY' });
    const created = await identityMutate(admin, 'post', '/api/v1/admin/scim/group-mappings', { groupId: group.groupId, roleId });
    expect(created.status(), await created.text()).toBe(201);
    const mapping = (await created.json()) as GroupMappingItem;
    expect(mapping).toMatchObject({ groupId: group.groupId, roleId, organisationId: team.organisationId });
    expect(await app.decide(checkFor(member, team.organisationId, READ)), 'the mapping backfills every current member').toMatchObject({ decision: 'PERMIT' });

    const repeated = await identityMutate(admin, 'post', '/api/v1/admin/scim/group-mappings', { groupId: group.groupId, roleId });
    expect(repeated.status()).toBe(201);
    expect(((await repeated.json()) as GroupMappingItem).id, 'a repeated mapping is the same mapping').toBe(mapping.id);

    const byOrganisation = await admin.get(`/api/v1/admin/scim/group-mappings?organisationId=${team.organisationId}`);
    expect(byOrganisation.status()).toBe(200);
    expect(((await byOrganisation.json()) as { items: GroupMappingItem[] }).items.map(item => item.id)).toEqual([mapping.id]);
    const byGroup = await admin.get(`/api/v1/admin/scim/group-mappings?groupId=${group.groupId}`);
    expect(((await byGroup.json()) as { items: GroupMappingItem[] }).items.map(item => item.id)).toEqual([mapping.id]);

    const removed = await identityMutate(admin, 'delete', `/api/v1/admin/scim/group-mappings/${mapping.id}`);
    expect(removed.status()).toBe(200);
    expect(await app.decide(checkFor(member, team.organisationId, READ)), 'the derived grant goes with the mapping').toMatchObject({ decision: 'DENY' });
    expect(await app.decide(checkFor(manual, team.organisationId, READ)), 'the manual grant survives').toMatchObject({ decision: 'PERMIT' });
    expect(await grantorsOf(manual, roleId), 'one assignment remains, and it is the administrator’s').toEqual([expect.not.stringContaining(SCIM_GRANT_MARKER)]);

    const again = await identityMutate(admin, 'delete', `/api/v1/admin/scim/group-mappings/${mapping.id}`);
    expect(again.status(), 'a mapping is deleted once').toBe(404);
    await expectErrorCode(again, 'SCIM_002');
  });

  test('should refuse a mapping onto an application the group’s organisation cannot reach', async ({ identity }) => {
    const ctx = await identity.anonymous();
    const admin = (await identity.admin()).ctx;
    const internal = await authzApp(identity, ctx, 'scim-internal', { visibility: 'INTERNAL' });
    const reachable = await authzApp(identity, ctx, 'scim-reachable');
    await internal.syncOrThrow(readerManifest('InternalReader'));
    await reachable.syncOrThrow(readerManifest('ReachableReader'));
    const team = await identity.createTeam({ label: 'scim-reach' });
    const group = await createScimGroup(team.organisationId, 'reach');

    const hidden = await identityMutate(admin, 'post', '/api/v1/admin/scim/group-mappings', {
      groupId: group.groupId,
      roleId: (await readCatalogRole(internal.application.applicationId, 'InternalReader')).roleId,
    });
    expect(hidden.status()).toBe(400);
    await expectErrorCode(hidden, 'ORG_011');

    const allowed = await identityMutate(admin, 'post', '/api/v1/admin/scim/group-mappings', {
      groupId: group.groupId,
      roleId: (await readCatalogRole(reachable.application.applicationId, 'ReachableReader')).roleId,
    });
    expect(allowed.status(), 'a reachable application maps').toBe(201);
  });

  test('should admit only an elevated administrator of the role’s own application', async ({ identity }) => {
    const ctx = await identity.anonymous();
    const app = await authzApp(identity, ctx, 'scim-authz');
    const foreign = await authzApp(identity, ctx, 'scim-foreign');
    await app.syncOrThrow({ permissions: [{ name: READ }, { name: 'app:roles:manage' }], roles: [{ name: 'AppRoleAdmin', permissions: ['app:roles:manage'] }] });
    await foreign.syncOrThrow(readerManifest('ForeignReader'));
    const own = await readCatalogRole(app.application.applicationId, 'AppRoleAdmin');
    const other = await readCatalogRole(foreign.application.applicationId, 'ForeignReader');
    const team = await identity.createTeam({ label: 'scim-authz' });
    const group = await createScimGroup(team.organisationId, 'authz');
    const createMapping = (caller: APIRequestContext, roleId: number): Promise<APIResponse> =>
      identityMutate(caller, 'post', '/api/v1/admin/scim/group-mappings', { groupId: group.groupId, roleId });

    const stranger = await identity.createUser({ label: 'scim-stranger' });
    const strangerCtx = (await identity.signIn(stranger, { aal: 'AAL2' })).ctx;
    const refusedStranger = await createMapping(strangerCtx, own.roleId);
    expect(refusedStranger.status()).toBe(403);
    await expectErrorCode(refusedStranger, 'ADM_001');

    const unelevated = await identity.adminAt({ aal: 'AAL1' });
    const refusedAal1 = await createMapping(unelevated.ctx, own.roleId);
    expect(refusedAal1.status(), 'a platform administrator at AAL1 is not elevated').toBe(403);
    await expectErrorCode(refusedAal1, 'AUTH_006');

    const appAdmin = await identity.createUser({ label: 'scim-app-admin' });
    await assignApplicationRole({ type: 'USER', id: appAdmin.userId }, own.roleId, await findPlatformOrganisationId());
    const appAdminCtx = (await identity.signIn(appAdmin, { aal: 'AAL2' })).ctx;
    const ownApplication = await createMapping(appAdminCtx, own.roleId);
    expect(ownApplication.status(), await ownApplication.text()).toBe(201);

    const otherApplication = await createMapping(appAdminCtx, other.roleId);
    expect(otherApplication.status(), 'an application administrator never administers another application’s role').toBe(403);
    await expectErrorCode(otherApplication, 'ADM_001');
  });
});
