/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { OAuthClientService } from '@server/modules/auth/oauth';
import { PolicyDecisionService } from '@server/modules/authz';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';
import { ScimGroupMappingService } from '@server/modules/scim';
import { ApplicationRoleService, ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

type Json = Record<string, unknown>;

/**
 * Declaring the constants
 *
 * The group→role sync engine (T-905): a mapping's derived assignments follow directory membership.
 * These specs drive the real SCIM membership surface (RFC 7644 PATCH untouched) and assert that the
 * PDP flips PERMIT/DENY for the affected members, that overlapping groups keep a shared role, that a
 * group delete cleans up, and that the existing membership-end path already revokes the derived rows.
 */
const env = new TestEnvironment('scim-group-mapping').init();
const USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
const PATCH_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';
const FORM = 'application/x-www-form-urlencoded';

describe('SCIM group → role mapping sync', () => {
  let token: string;
  let orgId: bigint;
  let roleId: number;
  let permission: string;

  const provisionTenant = async (domain: string, orgName: string): Promise<{ token: string; orgId: bigint }> => {
    const owner = await env.getService(UserService).createUserWithPassword({ email: `owner@${domain}`, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    const organisation = await env.getService(OrganisationService).createTeam(owner.id, { name: orgName });
    await env
      .getPostgresClient()
      .insert(schema.organisationDomains)
      .values({ organisationId: organisation.id, domain, verificationToken: 'token', status: 'VERIFIED', verifiedAt: new Date() });

    const applicationId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
    const scopeId = await env.getService(OAuthClientService).ensureScope(applicationId, 'shadow-identity', 'scim:provision');
    const client = await env
      .getService(OAuthClientService)
      .register({ applicationId, name: `${orgName} SCIM`, kind: 'SERVICE', grantTypes: ['client_credentials'], scopeIds: [scopeId], organisationId: organisation.id });

    const response = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .headers({ 'content-type': FORM })
      .body(new URLSearchParams({ grant_type: 'client_credentials', client_id: client.clientId, client_secret: client.secret ?? '', scope: 'scim:provision' }).toString());
    return { token: (response.json() as { access_token: string }).access_token, orgId: organisation.id };
  };

  const scim = (method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, bearer = token) => {
    const chain = env.getRouter().mockRequest()[method](`/scim/v2${path}`);
    return chain.headers({ authorization: `Bearer ${bearer}`, 'content-type': 'application/scim+json' });
  };

  const createUser = async (userName: string, extra: Json = {}): Promise<{ directoryId: string; userId: bigint }> => {
    const response = await scim('post', '/Users').body({ schemas: [USER_SCHEMA], userName, name: { givenName: 'Pat', familyName: 'Doe' }, ...extra });
    expect(response.statusCode).toBe(201);
    const user = await env.getService(UserService).getUser(userName);
    return { directoryId: (response.json() as Json)['id'] as string, userId: user?.id ?? 0n };
  };

  const createGroup = async (displayName: string, members: string[] = []): Promise<string> => {
    const response = await scim('post', '/Groups').body({ displayName, members: members.map(value => ({ value })) });
    expect(response.statusCode).toBe(201);
    return (response.json() as Json)['id'] as string;
  };

  const mapGroup = async (groupId: string, mappedRole = roleId): Promise<void> => {
    const role = await env.getService(ApplicationRoleService).getRole(mappedRole);
    if (!role) throw new Error('role missing');
    await env.getService(ScimGroupMappingService).createMapping(role, groupId, 'admin');
  };

  const permits = async (userId: bigint): Promise<boolean> => {
    const decision = await env
      .getService(PolicyDecisionService)
      .check({ principal: { type: 'USER', id: userId.toString() }, organisationId: orgId.toString(), action: permission });
    return decision.decision === 'PERMIT';
  };

  let appId: number;

  beforeEach(async () => {
    const tenant = await provisionTenant('acme.example.com', 'Acme Corp');
    token = tenant.token;
    orgId = tenant.orgId;

    const app = await env.getService(ApplicationService).createApplication({ name: `tier-${Date.now()}`, subDomain: `t${Date.now()}` });
    appId = app.id;
    roleId = (await env.getService(ApplicationRoleService).addRole(app.name, { roleName: 'premium' })).id;
    permission = `tier:${Date.now()}:use`;
    const permissionId = await env.getService(PolicyDecisionService).ensurePermission(appId, permission);
    await env.getService(PolicyDecisionService).grantPermissionToRole(roleId, permissionId);
  });

  it('should assign the mapped role when a member is added and revoke it when removed', async () => {
    const alpha = await createUser('add-alpha@acme.example.com');
    const groupId = await createGroup('Engineering');
    await mapGroup(groupId);

    expect(await permits(alpha.userId)).toBe(false);

    const added = await scim('patch', `/Groups/${groupId}`).body({ schemas: [PATCH_SCHEMA], Operations: [{ op: 'Add', path: 'members', value: [{ value: alpha.directoryId }] }] });
    expect(added.statusCode).toBe(200);
    expect(await permits(alpha.userId)).toBe(true);

    const removed = await scim('patch', `/Groups/${groupId}`).body({ schemas: [PATCH_SCHEMA], Operations: [{ op: 'Remove', path: `members[value eq "${alpha.directoryId}"]` }] });
    expect(removed.statusCode).toBe(200);
    expect(await permits(alpha.userId)).toBe(false);
  });

  it('should backfill existing members when a mapping is created', async () => {
    const alpha = await createUser('bf-alpha@acme.example.com');
    const beta = await createUser('bf-beta@acme.example.com');
    const groupId = await createGroup('Sales', [alpha.directoryId, beta.directoryId]);

    expect(await permits(alpha.userId)).toBe(false);
    await mapGroup(groupId);

    expect(await permits(alpha.userId)).toBe(true);
    expect(await permits(beta.userId)).toBe(true);
  });

  it('should keep a shared role until the last overlapping group releases it', async () => {
    const worker = await createUser('overlap@acme.example.com');
    const first = await createGroup('First', [worker.directoryId]);
    const second = await createGroup('Second', [worker.directoryId]);
    await mapGroup(first);
    await mapGroup(second);
    expect(await permits(worker.userId)).toBe(true);

    const leftFirst = await scim('patch', `/Groups/${first}`).body({ schemas: [PATCH_SCHEMA], Operations: [{ op: 'Remove', path: `members[value eq "${worker.directoryId}"]` }] });
    expect(leftFirst.statusCode).toBe(200);
    /** The second group still maps the role, so the derived grant survives the first removal. */
    expect(await permits(worker.userId)).toBe(true);

    const leftSecond = await scim('patch', `/Groups/${second}`).body({
      schemas: [PATCH_SCHEMA],
      Operations: [{ op: 'Remove', path: `members[value eq "${worker.directoryId}"]` }],
    });
    expect(leftSecond.statusCode).toBe(200);
    expect(await permits(worker.userId)).toBe(false);
  });

  it('should revoke derived grants when the group is deleted', async () => {
    const member = await createUser('grp-del@acme.example.com');
    const groupId = await createGroup('Doomed', [member.directoryId]);
    await mapGroup(groupId);
    expect(await permits(member.userId)).toBe(true);

    const deleted = await scim('delete', `/Groups/${groupId}`);
    expect(deleted.statusCode).toBe(204);
    expect(await permits(member.userId)).toBe(false);

    const rows = await env
      .getService(PolicyDecisionService)
      .listAssignments({ principal: { type: 'USER', id: member.userId.toString() }, organisationId: orgId.toString(), roleId });
    expect(rows).toHaveLength(0);
  });

  it('should let the existing membership-end path clean the derived rows on deprovision', async () => {
    /** An adopted (managed=false) account whose deprovision ends org membership, which already revokes org-scoped assignments. */
    await env.getService(UserService).createUserWithPassword({ email: 'veteran@acme.example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    const veteran = await createUser('veteran@acme.example.com');
    const groupId = await createGroup('Adopted', [veteran.directoryId]);
    await mapGroup(groupId);
    expect(await permits(veteran.userId)).toBe(true);

    const removed = await scim('delete', `/Users/${veteran.directoryId}`);
    expect(removed.statusCode).toBe(204);
    /** Membership ended → `revokeAllForPrincipalInOrganisation` already cleared the marker row; no new code needed. */
    expect(await permits(veteran.userId)).toBe(false);
    const rows = await env.getService(PolicyDecisionService).listAssignments({ principal: { type: 'USER', id: veteran.userId.toString() }, organisationId: orgId.toString() });
    expect(rows).toHaveLength(0);
  });
});
