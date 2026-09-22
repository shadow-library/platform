/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  addOrganisationMember,
  assignApplicationRole,
  createApplicationRole,
  createResourceScope,
  findPlatformOrganisationId,
  findRoleAssignmentOrganisationIds,
  identityDb,
  identityMutate,
  issueTokens,
  OAUTH_REDIRECT_URI,
  type OAuthApplication,
  type OAuthTestClient,
  updateOrganisation,
} from '../../lib';
import { expect, type IdentityHarness, test } from './fixtures';
import { expectErrorCode } from './helpers';

/**
 * Defining types
 */

interface ClientDetail {
  id: string;
  name: string;
  isActive: boolean;
  redirectUris: string[];
  scopes: string[];
  authMethod: string;
  workloadSubjects?: string[];
}

interface RoleAssignmentItem {
  principalType: string;
  principalId: string;
  roleId: number;
  organisationId: string;
}

/**
 * Declaring the constants
 *
 * The OAuth client registry and the role-assignment API of identity's admin console. Every client is registered on a
 * throwaway application, never on a seeded one, so the ten-client ceiling and the deletion cascade are exercised
 * without touching the ecosystem. Application roles are written straight to the database — identity creates them
 * only through catalog sync — and the API under test is what confers them.
 */

/** A workload subject nobody else can be using: the namespace label is unique to this test. */
function uniqueWorkloadSubject(): string {
  return `system:serviceaccount:e2e-${randomBytes(4).toString('hex')}:runner`;
}

function registerClient(admin: APIRequestContext, application: OAuthApplication, body: Record<string, unknown>) {
  return identityMutate(admin, 'post', '/api/v1/admin/clients', {
    clientId: `${application.name}-${randomBytes(3).toString('hex')}`,
    applicationId: application.applicationId,
    name: 'e2e client',
    kind: 'WEB_CONFIDENTIAL',
    grantTypes: ['authorization_code'],
    redirectUris: [OAUTH_REDIRECT_URI],
    ...body,
  });
}

async function clientDetail(admin: APIRequestContext, clientId: string): Promise<ClientDetail> {
  const response = await admin.get(`/api/v1/admin/clients/${clientId}`);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as ClientDetail;
}

async function listAssignments(admin: APIRequestContext, query: string): Promise<RoleAssignmentItem[]> {
  const response = await admin.get(`/api/v1/admin/role-assignments?${query}`);
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as { items: RoleAssignmentItem[] }).items;
}

function assignRole(ctx: APIRequestContext, body: Record<string, unknown>) {
  return identityMutate(ctx, 'post', '/api/v1/admin/role-assignments', body);
}

function revokeRole(ctx: APIRequestContext, body: Record<string, unknown>) {
  return identityMutate(ctx, 'post', '/api/v1/admin/role-assignments/revoke', body);
}

/** An elevated caller holding `app:roles:manage` on `application` alone, as an application's own role administrator does. */
async function appRoleAdmin(identity: IdentityHarness, application: OAuthApplication): Promise<APIRequestContext> {
  const role = await createApplicationRole(application.applicationId, { label: 'AppRoleAdmin', permissions: ['app:roles:manage'] });
  const user = await identity.createUser({ label: 'app-role-admin' });
  await assignApplicationRole({ type: 'USER', id: user.userId }, role.roleId, await findPlatformOrganisationId());
  return (await identity.signIn(user, { aal: 'AAL2' })).ctx;
}

test.describe('identity admin OAuth client administration', () => {
  test('should hand a confidential client its secret exactly once', async ({ identity }) => {
    const admin = await identity.admin();
    const application = await identity.createOAuthApp('client-secret');

    const registered = await registerClient(admin.ctx, application, {});
    expect(registered.status(), await registered.text()).toBe(201);
    const { clientId, secret } = (await registered.json()) as { clientId: string; secret?: string };
    expect(secret, 'a confidential client is given a secret').toBeTruthy();

    const detail = await admin.ctx.get(`/api/v1/admin/clients/${clientId}`);
    expect(await detail.text(), 'the detail never carries the secret again').not.toContain(secret ?? '');
  });

  test('should refuse a client registration that names an impossible grant, application, id or redirect uri', async ({ identity }) => {
    const admin = await identity.admin();
    const application = await identity.createOAuthApp('client-validation');

    const implicit = await registerClient(admin.ctx, application, { grantTypes: ['implicit'] });
    expect(implicit.status()).toBe(400);
    await expectErrorCode(implicit, 'ADM_003');

    const unknownApplication = await registerClient(admin.ctx, application, { applicationId: 99_999_999 });
    expect(unknownApplication.status()).toBe(404);

    const badRedirect = await registerClient(admin.ctx, application, { redirectUris: ['not-a-url'] });
    expect(badRedirect.status()).toBe(400);
    await expectErrorCode(badRedirect, 'ADM_003');

    const reserved = await registerClient(admin.ctx, application, { clientId: 'shadow-identity' });
    expect(reserved.status(), 'the platform client id is reserved').toBe(400);
    await expectErrorCode(reserved, 'ADM_006');

    // `Bad_Id` never reaches the service: the client-id pattern is on the DTO, so the schema layer refuses it first.
    const malformed = await registerClient(admin.ctx, application, { clientId: 'Bad_Id' });
    expect(malformed.status()).toBe(422);
    expect(((await malformed.json()) as { fields: { field: string }[] }).fields.map(field => field.field)).toEqual(['body.clientId']);

    const chosen = `${application.name}-verbatim`;
    const accepted = await registerClient(admin.ctx, application, { clientId: chosen });
    expect(accepted.status(), await accepted.text()).toBe(201);
    expect((await accepted.json()) as { clientId: string }).toMatchObject({ clientId: chosen });

    const patchedWithFragment = await identityMutate(admin.ctx, 'patch', `/api/v1/admin/clients/${chosen}`, { redirectUris: [`${OAUTH_REDIRECT_URI}#fragment`] });
    expect(patchedWithFragment.status()).toBe(400);
    await expectErrorCode(patchedWithFragment, 'ADM_003');
    expect((await clientDetail(admin.ctx, chosen)).redirectUris, 'the refused patch changed nothing').toEqual([OAUTH_REDIRECT_URI]);
  });

  test('should refuse a workload client with no subject, a subject another client holds and an eleventh client', async ({ identity }) => {
    const admin = await identity.admin();
    const application = await identity.createOAuthApp('client-limits');

    const noSubjects = await registerClient(admin.ctx, application, { authMethod: 'workload_identity', grantTypes: ['client_credentials'] });
    expect(noSubjects.status()).toBe(400);
    await expectErrorCode(noSubjects, 'ADM_005');

    const subject = uniqueWorkloadSubject();
    const bound = await registerClient(admin.ctx, application, { authMethod: 'workload_identity', grantTypes: ['client_credentials'], workloadSubjects: [subject] });
    expect(bound.status(), await bound.text()).toBe(201);

    const duplicate = await registerClient(admin.ctx, application, { authMethod: 'workload_identity', grantTypes: ['client_credentials'], workloadSubjects: [subject] });
    expect(duplicate.status(), 'an exact subject belongs to one client').toBe(400);
    await expectErrorCode(duplicate, 'ADM_007');

    // The application is provisioned with a client of its own, and the workload client above is the second.
    for (let index = 0; index < 8; index++) expect((await registerClient(admin.ctx, application, {})).status(), `client ${index + 3}`).toBe(201);

    const eleventh = await registerClient(admin.ctx, application, {});
    expect(eleventh.status()).toBe(409);
    await expectErrorCode(eleventh, 'ADM_004');
  });

  test('should replace redirect uris wholesale and reflect a rename and deactivation', async ({ identity }) => {
    const admin = await identity.admin();
    const application = await identity.createOAuthApp('client-patch');
    const registered = await registerClient(admin.ctx, application, { redirectUris: [OAUTH_REDIRECT_URI, 'https://app.example.test/other'] });
    const { clientId } = (await registered.json()) as { clientId: string };

    const replaced = await identityMutate(admin.ctx, 'patch', `/api/v1/admin/clients/${clientId}`, { redirectUris: ['https://app.example.test/only'] });
    expect(replaced.status(), await replaced.text()).toBe(200);
    expect((await clientDetail(admin.ctx, clientId)).redirectUris).toEqual(['https://app.example.test/only']);

    const renamed = await identityMutate(admin.ctx, 'patch', `/api/v1/admin/clients/${clientId}`, { name: 'e2e renamed', isActive: false });
    expect(renamed.status(), await renamed.text()).toBe(200);
    expect(await clientDetail(admin.ctx, clientId)).toMatchObject({ name: 'e2e renamed', isActive: false });
  });

  test('should register a workload-identity client with no secret and show its subjects', async ({ identity }) => {
    const admin = await identity.admin();
    const application = await identity.createOAuthApp('client-workload');
    const subjects = [uniqueWorkloadSubject()];

    const registered = await registerClient(admin.ctx, application, { authMethod: 'workload_identity', grantTypes: ['client_credentials'], workloadSubjects: subjects });
    expect(registered.status(), await registered.text()).toBe(201);
    const { clientId, secret } = (await registered.json()) as { clientId: string; secret?: string };
    expect(secret, 'a workload client authenticates with a cluster token, not a secret').toBeUndefined();
    expect(await clientDetail(admin.ctx, clientId)).toMatchObject({ authMethod: 'workload_identity', workloadSubjects: subjects });
  });

  test('should create a resource with a scope and grant it to a client, then revoke it', async ({ identity }) => {
    const admin = await identity.admin();
    const application = await identity.createOAuthApp('client-scopes');
    const registered = await registerClient(admin.ctx, application, {});
    const { clientId } = (await registered.json()) as { clientId: string };

    const identifier = `api://e2e-${randomBytes(4).toString('hex')}`;
    const resource = await identityMutate(admin.ctx, 'post', '/api/v1/admin/resources', { applicationId: application.applicationId, identifier, displayName: 'E2E Resource' });
    expect(resource.status(), await resource.text()).toBe(201);

    const scopeName = `e2e:scope:${randomBytes(3).toString('hex')}`;
    const scopeId = await createResourceScope(admin.ctx, identifier, scopeName);

    const granted = await identityMutate(admin.ctx, 'post', `/api/v1/admin/clients/${clientId}/scopes`, { scopeId });
    expect(granted.status(), await granted.text()).toBe(200);
    expect((await clientDetail(admin.ctx, clientId)).scopes).toContain(scopeName);

    const revoked = await identityMutate(admin.ctx, 'delete', `/api/v1/admin/clients/${clientId}/scopes/${scopeId}`);
    expect(revoked.status(), await revoked.text()).toBe(200);
    expect((await clientDetail(admin.ctx, clientId)).scopes).not.toContain(scopeName);
  });

  test('should delete a client with its consents and refresh tokens, but never from an unelevated session', async ({ identity }) => {
    const admin = await identity.admin();
    const application = await identity.createOAuthApp('client-delete');
    const client: OAuthTestClient = await identity.createOAuthClientOn(application, { suffix: 'spa' });
    const user = await identity.createUser({ label: 'client-delete' });
    const { ctx } = await identity.signIn(user);

    const tokens = await issueTokens(ctx, await identity.anonymous(), client);
    expect(tokens.refreshToken).toBeTruthy();
    const counts = async (): Promise<{ clients: number; consents: number; families: number; tokens: number }> => {
      const [row] = await identityDb()<{ clients: number; consents: number; families: number; tokens: number }[]>`
        SELECT
          (SELECT count(*)::int FROM oauth_clients WHERE id = ${client.clientId}) AS clients,
          (SELECT count(*)::int FROM consents WHERE client_id = ${client.clientId}) AS consents,
          (SELECT count(*)::int FROM refresh_token_families WHERE client_id = ${client.clientId}) AS families,
          (SELECT count(*)::int FROM refresh_tokens rt JOIN refresh_token_families f ON f.id = rt.family_id WHERE f.client_id = ${client.clientId}) AS tokens
      `;
      if (!row) throw new Error('count query returned no row');
      return row;
    };
    const before = await counts();
    expect(before).toMatchObject({ clients: 1, families: 1 });
    expect(before.tokens).toBeGreaterThan(0);
    expect(before.consents, 'a first-party client records the policy consent').toBeGreaterThan(0);

    const weakAdmin = await identity.adminAt({ aal: 'AAL1' });
    const unelevated = await identityMutate(weakAdmin.ctx, 'delete', `/api/v1/admin/clients/${client.clientId}`);
    expect(unelevated.status()).toBe(403);
    await expectErrorCode(unelevated, 'AUTH_006');
    expect(await counts(), 'the refused delete removed nothing').toMatchObject({ clients: 1 });

    const deleted = await identityMutate(admin.ctx, 'delete', `/api/v1/admin/clients/${client.clientId}`);
    expect(deleted.status(), await deleted.text()).toBe(200);
    expect(await counts()).toEqual({ clients: 0, consents: 0, families: 0, tokens: 0 });
    expect((await admin.ctx.get(`/api/v1/admin/clients/${client.clientId}`)).status()).toBe(401);
  });
});

test.describe('identity admin role assignments', () => {
  test('should assign, list and revoke a user role', async ({ identity }) => {
    const admin = await identity.admin();
    const application = await identity.createOAuthApp('role-user');
    const role = await createApplicationRole(application.applicationId, { label: 'Member', permissions: ['e2e:member:read'] });
    const team = await identity.createTeam({ label: 'role-user' });
    const user = await identity.createUser({ label: 'role-user' });
    await addOrganisationMember(team.organisationId, user.userId);

    const body = { principalType: 'USER', principalId: user.userId, roleId: role.roleId, organisationId: team.organisationId };
    expect((await assignRole(admin.ctx, body)).status()).toBe(200);
    expect(await listAssignments(admin.ctx, `principalType=USER&principalId=${user.userId}`)).toEqual([
      expect.objectContaining({ principalType: 'USER', principalId: user.userId, roleId: role.roleId, organisationId: team.organisationId }),
    ]);

    expect((await revokeRole(admin.ctx, body)).status()).toBe(200);
    expect(await listAssignments(admin.ctx, `principalType=USER&principalId=${user.userId}`)).toEqual([]);
  });

  test('should scope an organisation-wide grant to its principal organisation', async ({ identity }) => {
    const admin = await identity.admin();
    const application = await identity.createOAuthApp('role-org');
    const role = await createApplicationRole(application.applicationId, { label: 'OrgWide', permissions: ['e2e:orgwide:read'] });
    const team = await identity.createTeam({ label: 'role-org' });
    const other = await identity.createTeam({ label: 'role-org-other' });

    const assigned = await assignRole(admin.ctx, { principalType: 'ORGANISATION', principalId: team.organisationId, roleId: role.roleId, organisationId: other.organisationId });
    expect(assigned.status(), await assigned.text()).toBe(200);
    expect(await listAssignments(admin.ctx, `principalType=ORGANISATION&principalId=${team.organisationId}`), 'the scope comes from the principal, not the body').toEqual([
      expect.objectContaining({ organisationId: team.organisationId, roleId: role.roleId }),
    ]);

    const unknown = await assignRole(admin.ctx, { principalType: 'ORGANISATION', principalId: '99999999', roleId: role.roleId, organisationId: '99999999' });
    expect(unknown.status()).toBe(404);
    await expectErrorCode(unknown, 'ORG_002');

    const personal = await assignRole(admin.ctx, {
      principalType: 'ORGANISATION',
      principalId: team.owner.personalOrgId,
      roleId: role.roleId,
      organisationId: team.owner.personalOrgId,
    });
    expect(personal.status(), 'a personal workspace holds no organisation-wide grant').toBe(409);
    await expectErrorCode(personal, 'ORG_003');

    const revoked = await revokeRole(admin.ctx, { principalType: 'ORGANISATION', principalId: team.organisationId, roleId: role.roleId, organisationId: other.organisationId });
    expect(revoked.status(), await revoked.text()).toBe(200);
    expect(await findRoleAssignmentOrganisationIds({ type: 'ORGANISATION', id: team.organisationId }, role.roleId)).toEqual([]);
  });

  test('should let an app-scoped role admin grant an organisation-wide role of its own application only', async ({ identity }) => {
    const own = await identity.createOAuthApp('role-scope-own');
    const foreign = await identity.createOAuthApp('role-scope-foreign');
    const ownRole = await createApplicationRole(own.applicationId, { label: 'OwnOrgWide', permissions: ['e2e:own:read'] });
    const foreignRole = await createApplicationRole(foreign.applicationId, { label: 'ForeignOrgWide', permissions: ['e2e:foreign:read'] });
    const ctx = await appRoleAdmin(identity, own);
    const team = await identity.createTeam({ label: 'role-scope' });

    const granted = await assignRole(ctx, { principalType: 'ORGANISATION', principalId: team.organisationId, roleId: ownRole.roleId, organisationId: team.organisationId });
    expect(granted.status(), await granted.text()).toBe(200);

    const refused = await assignRole(ctx, { principalType: 'ORGANISATION', principalId: team.organisationId, roleId: foreignRole.roleId, organisationId: team.organisationId });
    expect(refused.status(), "another application's role is out of reach").toBe(403);
    await expectErrorCode(refused, 'ADM_001');
    expect(await findRoleAssignmentOrganisationIds({ type: 'ORGANISATION', id: team.organisationId }, foreignRole.roleId)).toEqual([]);
  });

  test('should hold an app-scoped role admin to the tenants its application is entitled in', async ({ identity }) => {
    const application = await identity.createOAuthApp('role-tenancy');
    const role = await createApplicationRole(application.applicationId, { label: 'Tenant', permissions: ['e2e:tenant:read'] });
    const ctx = await appRoleAdmin(identity, application);

    const entitled = await identity.createTeam({ label: 'role-entitled' });
    const fenced = await identity.createTeam({ label: 'role-fenced', appAccessMode: 'ASSIGNED_ONLY' });
    const member = await identity.createUser({ label: 'role-member' });
    const outsider = await identity.createUser({ label: 'role-outsider' });
    await addOrganisationMember(entitled.organisationId, member.userId);
    await addOrganisationMember(fenced.organisationId, member.userId);

    const nonMember = await assignRole(ctx, { principalType: 'USER', principalId: outsider.userId, roleId: role.roleId, organisationId: entitled.organisationId });
    expect(nonMember.status(), 'an app admin may not plant a role on a non-member').toBe(403);
    await expectErrorCode(nonMember, 'ORG_001');

    for (const principal of [
      { principalType: 'USER', principalId: member.userId },
      { principalType: 'ORGANISATION', principalId: fenced.organisationId },
      { principalType: 'SERVICE_ACCOUNT', principalId: application.serviceClient.clientId },
    ]) {
      const refused = await assignRole(ctx, { ...principal, roleId: role.roleId, organisationId: fenced.organisationId });
      expect(refused.status(), `${principal.principalType} in an organisation the application is not entitled in`).toBe(400);
      await expectErrorCode(refused, 'ORG_011');
    }

    const revokeThere = await revokeRole(ctx, { principalType: 'USER', principalId: member.userId, roleId: role.roleId, organisationId: fenced.organisationId });
    expect(revokeThere.status(), 'nor may it revoke there').toBe(400);
    await expectErrorCode(revokeThere, 'ORG_011');

    const allowed = await assignRole(ctx, { principalType: 'USER', principalId: member.userId, roleId: role.roleId, organisationId: entitled.organisationId });
    expect(allowed.status(), 'a member of an entitled organisation is in reach').toBe(200);
    expect(await findRoleAssignmentOrganisationIds({ type: 'USER', id: member.userId }, role.roleId)).toEqual([entitled.organisationId]);
  });

  test('should let a platform administrator reach past the tenancy guards', async ({ identity }) => {
    const admin = await identity.admin();
    const application = await identity.createOAuthApp('role-bypass');
    const role = await createApplicationRole(application.applicationId, { label: 'Bypass', permissions: ['e2e:bypass:read'] });
    const fenced = await identity.createTeam({ label: 'role-bypass', appAccessMode: 'ASSIGNED_ONLY' });
    const outsider = await identity.createUser({ label: 'role-bypass' });

    const assigned = await assignRole(admin.ctx, { principalType: 'USER', principalId: outsider.userId, roleId: role.roleId, organisationId: fenced.organisationId });
    expect(assigned.status(), 'a platform admin assigns across tenants').toBe(200);

    const entitled = await identity.createTeam({ label: 'role-bypass-entitled' });
    await addOrganisationMember(entitled.organisationId, outsider.userId);
    expect((await assignRole(admin.ctx, { principalType: 'USER', principalId: outsider.userId, roleId: role.roleId, organisationId: entitled.organisationId })).status()).toBe(200);
    await updateOrganisation(entitled.organisationId, { appAccessMode: 'ASSIGNED_ONLY' });

    const revoked = await revokeRole(admin.ctx, { principalType: 'USER', principalId: outsider.userId, roleId: role.roleId, organisationId: entitled.organisationId });
    expect(revoked.status(), 'and revokes after the entitlement is gone').toBe(200);
    expect(await findRoleAssignmentOrganisationIds({ type: 'USER', id: outsider.userId }, role.roleId)).toEqual([fenced.organisationId]);
  });
});
