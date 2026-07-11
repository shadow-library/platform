/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { ApplicationRoleService, ApplicationService } from '@server/modules/system/application';

import { TestEnvironment, csrfPair } from '../test-environment';

/**
 * Defining types
 */

type Method = 'get' | 'post' | 'patch' | 'delete';

/**
 * Declaring the constants
 */
const env = new TestEnvironment('team-organisation').init();

describe('Team organisations', () => {
  let ownerId: bigint;
  let adminId: bigint;
  let memberId: bigint;
  let ownerSecret: string;
  let adminSecret: string;
  let memberSecret: string;
  let orgId: string;

  const request = (method: Method, path: string, secret: string, body?: Record<string, unknown>) => {
    const csrf = csrfPair();
    const base = env.getRouter().mockRequest()[method](path);
    const chain = base.headers({ 'x-csrf-token': csrf.header }).cookies({ [SESSION_COOKIE_NAME]: secret, 'csrf-token': csrf.cookie });
    return body ? chain.body(body) : chain;
  };

  const session = async (userId: bigint, aal: 'AAL1' | 'AAL2' = 'AAL1') => (await env.getService(SessionService).create({ userId, aal })).secret;

  beforeEach(async () => {
    const users = env.getService(UserService);
    ownerId = (await users.createUserWithPassword({ email: 'owner@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true })).id;
    adminId = (await users.createUserWithPassword({ email: 'admin@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true })).id;
    memberId = (await users.createUserWithPassword({ email: 'member@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true })).id;
    ownerSecret = await session(ownerId, 'AAL2');
    adminSecret = await session(adminId);
    memberSecret = await session(memberId);

    const created = await request('post', '/api/v1/organisations', ownerSecret, { name: 'Acme Team' });
    orgId = (created.json() as { id: string }).id;
    const organisations = env.getService(OrganisationService);
    await organisations.ensureMember(BigInt(orgId), adminId, 'ADMIN');
    await organisations.ensureMember(BigInt(orgId), memberId, 'MEMBER');
  });

  it('should create a team organisation owned by the creator', async () => {
    const response = await request('post', '/api/v1/organisations', memberSecret, { name: 'Fresh Team', slug: 'fresh-team' });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: 'Fresh Team', slug: 'fresh-team', type: 'TEAM', status: 'ACTIVE' });

    const id = (response.json() as { id: string }).id;
    const members = await request('get', `/api/v1/organisations/${id}/members`, memberSecret);
    expect((members.json() as { members: { userId: string; role: string }[] }).members).toEqual([
      { userId: memberId.toString(), role: 'OWNER', email: 'member@example.com', joinedAt: expect.any(String) },
    ]);
  });

  it('should reject a duplicate slug', async () => {
    await request('post', '/api/v1/organisations', ownerSecret, { name: 'One', slug: 'taken-slug' });
    const response = await request('post', '/api/v1/organisations', ownerSecret, { name: 'Two', slug: 'taken-slug' });
    expect(response.statusCode).toBe(409);
  });

  it('should answer non-members and absent organisations identically', async () => {
    const outsider = await session((await env.getService(UserService).createUserWithPassword({ email: 'outsider@example.com', password: 'Password@123', status: 'ACTIVE' })).id);
    const foreign = await request('get', `/api/v1/organisations/${orgId}`, outsider);
    const absent = await request('get', '/api/v1/organisations/999999', outsider);
    expect(foreign.statusCode).toBe(absent.statusCode);
    expect((foreign.json() as { code: string }).code).toBe((absent.json() as { code: string }).code);
  });

  it('should allow admins to rename but not members', async () => {
    const renamed = await request('patch', `/api/v1/organisations/${orgId}`, adminSecret, { name: 'Acme Renamed' });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toMatchObject({ name: 'Acme Renamed' });

    const forbidden = await request('patch', `/api/v1/organisations/${orgId}`, memberSecret, { name: 'Nope' });
    expect(forbidden.statusCode).toBe(403);
  });

  it('should let an admin promote a member to admin but never to owner', async () => {
    const promote = await request('patch', `/api/v1/organisations/${orgId}/members/${memberId}`, adminSecret, { role: 'ADMIN' });
    expect(promote.statusCode).toBe(200);

    const toOwner = await request('patch', `/api/v1/organisations/${orgId}/members/${memberId}`, adminSecret, { role: 'OWNER' });
    expect(toOwner.statusCode).toBe(403);
  });

  it('should let an elevated owner hand out ownership', async () => {
    const response = await request('patch', `/api/v1/organisations/${orgId}/members/${adminId}`, ownerSecret, { role: 'OWNER' });
    expect(response.statusCode).toBe(200);
    const members = await request('get', `/api/v1/organisations/${orgId}/members`, ownerSecret);
    const roles = (members.json() as { members: { userId: string; role: string }[] }).members;
    expect(roles.find(member => member.userId === adminId.toString())?.role).toBe('OWNER');
  });

  it('should protect the last owner from demotion and removal', async () => {
    const demote = await request('patch', `/api/v1/organisations/${orgId}/members/${ownerId}`, ownerSecret, { role: 'MEMBER' });
    expect(demote.statusCode).toBe(409);

    const leave = await request('delete', `/api/v1/me/organisations/${orgId}`, ownerSecret);
    expect(leave.statusCode).toBe(409);
  });

  it('should remove a member and revoke their org-scoped grants', async () => {
    const pdp = env.getService(PolicyDecisionService);
    const applicationId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
    const role = await env.getService(ApplicationRoleService).addRole('shadow-identity', { roleName: `org-role-${Date.now()}` });
    const permissionId = await pdp.createPermission(applicationId, 'org-things:write');
    await pdp.grantPermissionToRole(role.id, permissionId);
    const principal = { type: 'USER' as const, id: memberId.toString() };
    await pdp.assignRole(principal, role.id, orgId);

    const response = await request('delete', `/api/v1/organisations/${orgId}/members/${memberId}`, adminSecret);
    expect(response.statusCode).toBe(200);
    expect((await pdp.check({ principal, organisationId: orgId, action: 'org-things:write' })).decision).toBe('DENY');
    const members = await request('get', `/api/v1/organisations/${orgId}/members`, adminSecret);
    expect((members.json() as { members: { userId: string }[] }).members.some(member => member.userId === memberId.toString())).toBe(false);
  });

  it('should refuse member administration below the target rank', async () => {
    const response = await request('delete', `/api/v1/organisations/${orgId}/members/${ownerId}`, adminSecret);
    expect(response.statusCode).toBe(403);
  });

  it('should reject membership operations on personal workspaces', async () => {
    const user = await env.getService(UserService).getUser(memberId);
    const personalOrgId = user?.personalOrganisationId?.toString() as string;
    const response = await request('patch', `/api/v1/organisations/${personalOrgId}`, memberSecret, { name: 'Nope' });
    expect(response.statusCode).toBe(409);
  });

  it('should let a member leave and drop their grants', async () => {
    const response = await request('delete', `/api/v1/me/organisations/${orgId}`, memberSecret);
    expect(response.statusCode).toBe(200);
    const list = await request('get', '/api/v1/me/organisations', memberSecret);
    const organisations = (list.json() as { organisations: { id: string }[] }).organisations;
    expect(organisations.some(organisation => organisation.id === orgId)).toBe(false);
  });

  it('should soft-delete an organisation only for an elevated owner', async () => {
    const forbidden = await request('delete', `/api/v1/organisations/${orgId}`, adminSecret);
    expect([401, 403]).toContain(forbidden.statusCode);

    const response = await request('delete', `/api/v1/organisations/${orgId}`, ownerSecret);
    expect(response.statusCode).toBe(200);
    const detail = await request('get', `/api/v1/organisations/${orgId}`, ownerSecret);
    expect(detail.statusCode).toBe(403);
  });

  it('should list my organisations with role and workspace', async () => {
    const response = await request('get', '/api/v1/me/organisations', ownerSecret);
    expect(response.statusCode).toBe(200);
    const organisations = (response.json() as { organisations: { type: string; role: string }[] }).organisations;
    expect(organisations.some(organisation => organisation.type === 'PERSONAL')).toBe(true);
    expect(organisations.find(organisation => organisation.type === 'TEAM')?.role).toBe('OWNER');
  });
});
