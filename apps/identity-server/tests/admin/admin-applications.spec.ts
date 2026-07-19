/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { IAM_ADMIN_ROLE, PLATFORM_ORG_NAME } from '@server/modules/admin';
import { OAuthClientService } from '@server/modules/auth/oauth';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { ApplicationMemberService, ApplicationService } from '@server/modules/system/application';

import { csrfPair, TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('admin-applications').init();

describe('Admin application API', () => {
  let adminSecret: string;
  let platformOrgId: string;
  let platformAppId: number;

  const request = (method: 'get' | 'post' | 'delete' | 'patch', path: string, cookie = adminSecret) => {
    const csrf = csrfPair();
    const chain = env.getRouter().mockRequest()[method](path);
    return chain.headers({ 'x-csrf-token': csrf.header }).cookies({ [SESSION_COOKIE_NAME]: cookie, 'csrf-token': csrf.cookie });
  };

  const uniqueName = (prefix: string): string => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  const asAdmin = async (): Promise<string> => {
    const application = env.getService(ApplicationService).getApplicationOrThrow(APP_NAME);
    const admin = await env
      .getService(UserService)
      .createUserWithPassword({ email: uniqueName('app-admin') + '@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    const role = application.roles.find(candidate => candidate.roleName === IAM_ADMIN_ROLE);
    await env.getService(PolicyDecisionService).assignRole({ type: 'USER', id: admin.id.toString() }, role?.id ?? 0, platformOrgId);
    const { secret } = await env.getService(SessionService).create({ userId: admin.id, aal: 'AAL2' });
    return secret;
  };

  beforeEach(async () => {
    const organisation = await env.getService(OrganisationService).findTeamByName(PLATFORM_ORG_NAME);
    platformOrgId = String(organisation?.id);
    platformAppId = env.getService(ApplicationService).getApplicationOrThrow(APP_NAME).id;
    adminSecret = await asAdmin();
  });

  it('should register an application and expose it through detail and list', async () => {
    const name = uniqueName('pulse');
    const created = await request('post', '/api/v1/admin/applications').body({ name, subDomain: 'pulse', displayName: 'Pulse', description: 'Realtime feed product' });
    expect(created.statusCode).toBe(201);
    const { id } = created.json() as { id: number };
    expect(typeof id).toBe('number');

    const detail = await request('get', `/api/v1/admin/applications/${id}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ id, name, subDomain: 'pulse', displayName: 'Pulse', description: 'Realtime feed product', isActive: true, roles: [] });

    const list = await request('get', '/api/v1/admin/applications');
    expect(list.statusCode).toBe(200);
    const items = (list.json() as { items: { name: string }[] }).items;
    expect(items.map(item => item.name)).toContain(name);
    expect(items.map(item => item.name)).toContain(APP_NAME);
  });

  it('should reject a duplicate application name with a conflict', async () => {
    const name = uniqueName('acme');
    const first = await request('post', '/api/v1/admin/applications').body({ name, subDomain: 'acme' });
    expect(first.statusCode).toBe(201);

    const duplicate = await request('post', '/api/v1/admin/applications').body({ name, subDomain: 'acme2' });
    expect(duplicate.statusCode).toBe(409);
  });

  it('should reject a malformed application name', async () => {
    const bad = await request('post', '/api/v1/admin/applications').body({ name: 'Not A Slug!', subDomain: 'x' });
    expect(bad.statusCode).toBe(422);
  });

  it('should update editable metadata as a partial change', async () => {
    const name = uniqueName('novel');
    const created = await request('post', '/api/v1/admin/applications').body({ name, subDomain: 'novel', displayName: 'Novel' });
    const { id } = created.json() as { id: number };

    const updated = await request('patch', `/api/v1/admin/applications/${id}`).body({ displayName: 'Novel Forge', logoUrl: 'https://cdn.example.com/logo.png' });
    expect(updated.statusCode).toBe(200);

    const detail = await request('get', `/api/v1/admin/applications/${id}`);
    expect(detail.json()).toMatchObject({ displayName: 'Novel Forge', logoUrl: 'https://cdn.example.com/logo.png' });
  });

  it('should delete an application that owns no clients', async () => {
    const name = uniqueName('ephemeral');
    const created = await request('post', '/api/v1/admin/applications').body({ name, subDomain: 'ephemeral' });
    const { id } = created.json() as { id: number };

    const removed = await request('delete', `/api/v1/admin/applications/${id}`);
    expect(removed.statusCode).toBe(200);

    const detail = await request('get', `/api/v1/admin/applications/${id}`);
    expect(detail.statusCode).toBe(404);
  });

  it('should refuse to delete an application that still owns clients', async () => {
    const name = uniqueName('withclient');
    const created = await request('post', '/api/v1/admin/applications').body({ name, subDomain: 'withclient' });
    const { id } = created.json() as { id: number };

    const client = await request('post', '/api/v1/admin/clients').body({ applicationId: id, name: 'svc', kind: 'SERVICE', grantTypes: ['client_credentials'] });
    expect(client.statusCode).toBe(201);

    const removed = await request('delete', `/api/v1/admin/applications/${id}`);
    expect(removed.statusCode).toBe(409);
  });

  it('should protect the platform application from deletion and deactivation', async () => {
    const removed = await request('delete', `/api/v1/admin/applications/${platformAppId}`);
    expect(removed.statusCode).toBe(403);

    const deactivated = await request('patch', `/api/v1/admin/applications/${platformAppId}`).body({ isActive: false });
    expect(deactivated.statusCode).toBe(403);
  });

  it('should list and remove application members', async () => {
    const name = uniqueName('members');
    const created = await request('post', '/api/v1/admin/applications').body({ name, subDomain: 'members' });
    const { id } = created.json() as { id: number };

    const user = await env
      .getService(UserService)
      .createUserWithPassword({ email: uniqueName('m') + '@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    await env.getService(ApplicationMemberService).ensureMembership(id, user.id);

    const members = await request('get', `/api/v1/admin/applications/${id}/members`);
    expect(members.statusCode).toBe(200);
    expect((members.json() as { items: { userId: string }[] }).items.map(item => item.userId)).toContain(user.id.toString());

    const removed = await request('delete', `/api/v1/admin/applications/${id}/members/${user.id}`);
    expect(removed.statusCode).toBe(200);

    const after = await request('get', `/api/v1/admin/applications/${id}/members`);
    expect((after.json() as { items: unknown[] }).items).toHaveLength(0);
  });

  it('should deny a caller lacking the applications permission', async () => {
    const outsider = await env
      .getService(UserService)
      .createUserWithPassword({ email: uniqueName('outsider') + '@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    const { secret } = await env.getService(SessionService).create({ userId: outsider.id, aal: 'AAL2' });

    const denied = await request('get', '/api/v1/admin/applications', secret);
    expect(denied.statusCode).toBe(403);
  });

  it('should store public URLs on the application and regenerate its relying-party redirect URIs', async () => {
    const pulse = env.getService(ApplicationService).getApplicationOrThrow('pulse');

    /** Two spellings of the same origin must collapse to one, not collide into a duplicate redirect URI. */
    const updated = await request('patch', `/api/v1/admin/applications/${pulse.id}`).body({ publicUrls: ['https://pulse.example.com', 'https://pulse.example.com/'] });
    expect(updated.statusCode).toBe(200);

    const detail = await request('get', `/api/v1/admin/applications/${pulse.id}`);
    expect((detail.json() as { publicUrls: string[] }).publicUrls).toEqual(['https://pulse.example.com']);

    const clients = await env.getService(OAuthClientService).listClients(pulse.id);
    const rp = clients.find(client => client.kind === 'WEB_CONFIDENTIAL');
    const rpDetail = await env.getService(OAuthClientService).getClientDetail(rp!.id);
    expect(rpDetail?.redirectUris).toEqual(['https://pulse.example.com/api/auth/callback']);
  });
});
