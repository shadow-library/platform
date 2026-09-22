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
  findApplicationRoleId,
  findPlatformOrganisationId,
  findRoleAssignmentOrganisationIds,
  findSessionBySecret,
  IAM_ADMIN_ROLE_NAME,
  identityDb,
  identityMutate,
  type IdentitySession,
  type IdentityUser,
  loginInit,
  PLATFORM_APPLICATION_NAME,
  readSessionStatus,
  relyingPartyClient,
  updateApplication,
  verifyChallenge,
} from '../../lib';
import { expect, type IdentityHarness, test } from './fixtures';
import { expectErrorCode, expectSessionCookie, flowStepOf } from './helpers';

/**
 * Defining types
 */

interface UserDetail {
  id: string;
  status: string;
  lockMode: string;
  lockedUntil?: string;
  passwordResetRequired: boolean;
  activeSessionCount: number;
  emails: { value: string; isPrimary: boolean }[];
  phones: { value: string }[];
}

interface UserRow {
  status: string;
  lockMode: string;
  statusReason: string | null;
  statusUntil: Date | null;
  username: string | null;
}

interface AuditRow {
  id: string;
  action: string;
  actorId: string | null;
  organisationId: string | null;
  prevHash: string | null;
  hash: string;
}

/**
 * Declaring the constants
 *
 * Identity's admin console API: who may reach it, and what the user, application and release endpoints do. Every
 * application, client, organisation and account here is the test's own — the platform application and the seeded
 * ecosystem clients are only ever read, or used as the subject of a refusal that changes nothing. The bootstrap
 * admin is the acting administrator throughout, on a database-minted session at the assurance level each case needs.
 */

/** Every permission `GET /api/v1/admin/context` may report, which is identity's whole admin taxonomy. */
const ADMIN_PERMISSIONS = [
  'iam:users:read',
  'iam:users:manage',
  'iam:apps:read',
  'iam:apps:manage',
  'iam:clients:read',
  'iam:clients:manage',
  'iam:roles:manage',
  'iam:audit:read',
  'iam:webhooks:manage',
  'app:roles:manage',
];

const DAY_MS = 24 * 60 * 60 * 1000;

async function adminPermissions(ctx: APIRequestContext): Promise<string[]> {
  const response = await ctx.get('/api/v1/admin/context');
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as { permissions: string[] }).permissions;
}

async function userDetail(admin: APIRequestContext, userId: string): Promise<UserDetail> {
  const response = await admin.get(`/api/v1/admin/users/${userId}`);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as UserDetail;
}

async function userRow(userId: string): Promise<UserRow> {
  const [row] = await identityDb()<UserRow[]>`
    SELECT status, lock_mode AS "lockMode", status_reason AS "statusReason", status_until AS "statusUntil", username FROM users WHERE id = ${userId}
  `;
  if (!row) throw new Error(`no user row for ${userId}`);
  return row;
}

async function lockedUntilOf(userId: string): Promise<Date | null> {
  const [row] = await identityDb()<{ lockedUntil: Date | null }[]>`SELECT locked_until AS "lockedUntil" FROM users WHERE id = ${userId}`;
  return row?.lockedUntil ?? null;
}

async function auditRowsFor(action: string, targetId: string): Promise<AuditRow[]> {
  return identityDb()<AuditRow[]>`
    SELECT id::text, action, actor_id AS "actorId", organisation_id AS "organisationId", prev_hash AS "prevHash", hash
    FROM audit_events WHERE action = ${action} AND target_id = ${targetId} ORDER BY id
  `;
}

/** A caller signed in as `user` whose session is proven live, so a later 401 can only come from the action under test. */
async function liveSession(identity: IdentityHarness, user: IdentityUser): Promise<{ session: IdentitySession; ctx: APIRequestContext }> {
  const signedIn = await identity.signIn(user);
  const probe = await signedIn.ctx.get('/api/v1/me');
  expect(probe.status(), 'the session must work before the action under test').toBe(200);
  return signedIn;
}

async function expectSessionRejected(ctx: APIRequestContext, message: string): Promise<void> {
  const response = await ctx.get('/api/v1/me');
  expect(response.status(), message).toBe(401);
}

test.describe('identity admin context and authorization', () => {
  test('should report the whole admin taxonomy for the bootstrap admin and nothing for anyone else', async ({ identity }) => {
    const admin = await identity.admin();
    expect(new Set(await adminPermissions(admin.ctx))).toEqual(new Set(ADMIN_PERMISSIONS));

    const outsider = await identity.createUser({ label: 'admin-context' });
    const { ctx } = await identity.signIn(outsider);
    expect(await adminPermissions(ctx), 'a session that is not staff holds no admin permission').toEqual([]);
  });

  test('should refuse admin reads without a session, allow them at AAL1 and gate mutations behind step-up', async ({ identity }) => {
    const anonymous = await identity.anonymous();
    const unauthenticated = await anonymous.get('/api/v1/admin/users');
    expect(unauthenticated.status()).toBe(401);
    await expectErrorCode(unauthenticated, 'AUTH_005');

    const target = await identity.createUser({ label: 'admin-gate' });
    const weakAdmin = await identity.adminAt({ aal: 'AAL1' });
    const read = await weakAdmin.ctx.get(`/api/v1/admin/users/${target.userId}`);
    expect(read.status(), 'an admin read needs no step-up').toBe(200);

    const mutations: [string, unknown][] = [
      [`/api/v1/admin/users/${target.userId}/unlock`, undefined],
      [`/api/v1/admin/users/${target.userId}/suspend`, { reason: 'e2e', until: new Date(Date.now() + DAY_MS).toISOString() }],
      [`/api/v1/admin/users/${target.userId}/block`, { reason: 'e2e' }],
    ];
    for (const [path, body] of mutations) {
      const refused = await identityMutate(weakAdmin.ctx, 'post', path, body);
      expect(refused.status(), `${path} from an AAL1 admin`).toBe(403);
      await expectErrorCode(refused, 'AUTH_006');
    }
    expect(await userRow(target.userId), 'a refused mutation changes nothing').toMatchObject({ status: 'ACTIVE', lockMode: 'NONE' });

    const elevated = await identity.admin();
    const allowed = await identityMutate(elevated.ctx, 'post', `/api/v1/admin/users/${target.userId}/unlock`);
    expect(allowed.status(), 'the same mutation passes on an elevated session').toBe(200);
  });

  test('should confine an app-scoped role admin to the roles of its own application', async ({ identity }) => {
    const application = await identity.createOAuthApp('role-admin');
    const adminRole = await createApplicationRole(application.applicationId, { label: 'AppRoleAdmin', permissions: ['app:roles:manage'] });
    const targetRole = await createApplicationRole(application.applicationId, { label: 'AppMember', permissions: ['e2e:demo:read'] });

    const platformOrganisationId = await findPlatformOrganisationId();
    const roleAdmin = await identity.createUser({ label: 'role-admin' });
    await assignApplicationRole({ type: 'USER', id: roleAdmin.userId }, adminRole.roleId, platformOrganisationId);
    const { ctx } = await identity.signIn(roleAdmin, { aal: 'AAL2' });

    const team = await identity.createTeam({ label: 'role-admin' });
    const member = await identity.createUser({ label: 'role-target' });
    await addOrganisationMember(team.organisationId, member.userId);

    const assigned = await identityMutate(ctx, 'post', '/api/v1/admin/role-assignments', {
      principalType: 'USER',
      principalId: member.userId,
      roleId: targetRole.roleId,
      organisationId: team.organisationId,
    });
    expect(assigned.status(), await assigned.text()).toBe(200);
    expect(await findRoleAssignmentOrganisationIds({ type: 'USER', id: member.userId }, targetRole.roleId)).toEqual([team.organisationId]);

    const platformRoleId = await findApplicationRoleId(PLATFORM_APPLICATION_NAME, IAM_ADMIN_ROLE_NAME);
    const refused = await identityMutate(ctx, 'post', '/api/v1/admin/role-assignments', {
      principalType: 'USER',
      principalId: member.userId,
      roleId: platformRoleId,
      organisationId: platformOrganisationId,
    });
    expect(refused.status(), "an app admin may not touch the platform application's roles").toBe(403);
    await expectErrorCode(refused, 'ADM_001');
    expect(await findRoleAssignmentOrganisationIds({ type: 'USER', id: member.userId }, platformRoleId)).toEqual([]);
  });

  test('should refuse the application endpoints to a caller without the applications permission', async ({ identity }) => {
    const application = await identity.createOAuthApp('outsider', { visibility: 'RESTRICTED' });
    const outsider = await identity.createUser({ label: 'apps-outsider' });
    const { ctx } = await identity.signIn(outsider, { aal: 'AAL2' });

    for (const path of ['/api/v1/admin/applications', `/api/v1/admin/applications/${application.applicationId}/organisations`]) {
      const refused = await ctx.get(path);
      expect(refused.status(), path).toBe(403);
      await expectErrorCode(refused, 'ADM_001');
    }

    const team = await identity.createTeam({ label: 'release-gate' });
    const weakAdmin = await identity.adminAt({ aal: 'AAL1' });
    const unelevated = await identityMutate(weakAdmin.ctx, 'post', `/api/v1/admin/applications/${application.applicationId}/organisations`, {
      organisationId: team.organisationId,
    });
    expect(unelevated.status(), 'a release needs step-up').toBe(403);
    await expectErrorCode(unelevated, 'AUTH_006');

    const admin = await identity.admin();
    const overview = await admin.ctx.get(`/api/v1/admin/applications/${application.applicationId}/organisations`);
    expect(overview.status(), 'the permitted caller still reads the release overview').toBe(200);
    const released = await identityMutate(admin.ctx, 'post', `/api/v1/admin/applications/${application.applicationId}/organisations`, { organisationId: team.organisationId });
    expect(released.status(), 'and still releases').toBe(200);
  });
});

test.describe('identity admin user administration', () => {
  test('should search users by email fragment and hand back a credential-free detail', async ({ identity }) => {
    const admin = await identity.admin();
    const user = await identity.createUser({ label: 'admin-search' });
    const fragment = user.email.split('@')[0] ?? '';

    const response = await admin.ctx.get(`/api/v1/admin/users?email=${encodeURIComponent(fragment)}&limit=10`);
    expect(response.status(), await response.text()).toBe(200);
    const page = (await response.json()) as { items: { id: string; primaryEmail?: string }[]; total: number; offset: number; limit: number };
    expect({ total: page.total, offset: page.offset, limit: page.limit }).toEqual({ total: 1, offset: 0, limit: 10 });
    expect(page.items.map(item => item.primaryEmail)).toEqual([user.email]);

    const detail = await admin.ctx.get(`/api/v1/admin/users/${user.userId}`);
    expect(detail.status()).toBe(200);
    const body = await detail.text();
    expect(body, 'the admin detail never carries a password hash').not.toContain('$argon2');
    expect((await detail.json()) as UserDetail).toMatchObject({ id: user.userId, status: 'ACTIVE', lockMode: 'NONE', passwordResetRequired: false, activeSessionCount: 0 });
  });

  test('should refuse a user id that is not numeric', async ({ identity }) => {
    const admin = await identity.admin();
    const response = await admin.ctx.get('/api/v1/admin/users/not-a-number');
    expect(response.status()).toBe(422);
    const { fields } = (await response.json()) as { fields: { field: string; msg: string }[] };
    expect(fields).toEqual([{ field: 'params.userId', msg: 'must be a numeric identifier' }]);
  });

  test('should lock a user out of every live session and give the account back on unlock', async ({ identity }) => {
    const admin = await identity.admin();
    const user = await identity.createUser({ label: 'admin-lock' });
    const { session, ctx } = await liveSession(identity, user);

    const locked = await identityMutate(admin.ctx, 'post', `/api/v1/admin/users/${user.userId}/lock`, { mode: 'FULL' });
    expect(locked.status(), await locked.text()).toBe(200);
    expect((await userDetail(admin.ctx, user.userId)).lockMode).toBe('FULL');
    await expectSessionRejected(ctx, 'a FULL lock kills the live session');
    expect(await readSessionStatus(session.sessionId)).toBe('TERMINATED');

    const unlocked = await identityMutate(admin.ctx, 'post', `/api/v1/admin/users/${user.userId}/unlock`);
    expect(unlocked.status()).toBe(200);
    expect(await userDetail(admin.ctx, user.userId)).toMatchObject({ lockMode: 'NONE' });
    expect(await lockedUntilOf(user.userId), 'unlocking clears the lock expiry').toBeNull();

    const reopened = await identity.anonymous();
    const init = await loginInit(reopened, user.email);
    expect(init.status(), 'an unlocked account signs in again').toBe(200);
    const verified = await verifyChallenge(reopened, { flowId: (await flowStepOf(init)).flowId ?? '', password: user.password });
    expect(verified.status(), await verified.text()).toBe(200);
    expectSessionCookie(verified);
  });

  test('should change one account status at a time and leave its neighbours alone', async ({ identity }) => {
    const admin = await identity.admin();
    const [target, bystander] = await Promise.all([identity.createUser({ label: 'admin-status' }), identity.createUser({ label: 'admin-bystander' })]);
    const { session, ctx } = await liveSession(identity, target);
    const bystanderSession = await liveSession(identity, bystander);

    const deactivated = await identityMutate(admin.ctx, 'post', `/api/v1/admin/users/${target.userId}/deactivate`);
    expect(deactivated.status(), await deactivated.text()).toBe(200);
    expect(await userRow(target.userId)).toMatchObject({ status: 'DISABLED' });
    await expectSessionRejected(ctx, 'deactivation kills the live session');
    expect(await readSessionStatus(session.sessionId)).toBe('TERMINATED');

    expect(await identityMutate(admin.ctx, 'post', `/api/v1/admin/users/${target.userId}/reactivate`).then(r => r.status())).toBe(200);
    expect(await userRow(target.userId)).toMatchObject({ status: 'ACTIVE', statusReason: null, statusUntil: null });

    const until = new Date(Date.now() + DAY_MS);
    const suspended = await identityMutate(admin.ctx, 'post', `/api/v1/admin/users/${target.userId}/suspend`, { reason: 'e2e suspension', until: until.toISOString() });
    expect(suspended.status(), await suspended.text()).toBe(200);
    const afterSuspend = await userRow(target.userId);
    expect(afterSuspend).toMatchObject({ status: 'SUSPENDED', statusReason: 'e2e suspension' });
    expect(afterSuspend.statusUntil?.toISOString()).toBe(until.toISOString());

    expect(await identityMutate(admin.ctx, 'post', `/api/v1/admin/users/${target.userId}/reactivate`).then(r => r.status())).toBe(200);
    expect(await userRow(target.userId), 'reactivation clears the hold').toMatchObject({ status: 'ACTIVE', statusReason: null, statusUntil: null });

    const blocked = await identityMutate(admin.ctx, 'post', `/api/v1/admin/users/${target.userId}/block`, { reason: 'e2e block' });
    expect(blocked.status(), await blocked.text()).toBe(200);
    expect(await userRow(target.userId)).toMatchObject({ status: 'BLOCKED', statusReason: 'e2e block', statusUntil: null });

    const backdated = await identityMutate(admin.ctx, 'post', `/api/v1/admin/users/${target.userId}/suspend`, {
      reason: 'e2e',
      until: new Date(Date.now() - DAY_MS).toISOString(),
    });
    expect(backdated.status(), 'a suspension cannot expire in the past').toBe(422);

    expect(await userRow(bystander.userId), 'only the named account was touched').toMatchObject({ status: 'ACTIVE', lockMode: 'NONE' });
    const bystanderProbe = await bystanderSession.ctx.get('/api/v1/me');
    expect(bystanderProbe.status(), "the bystander's session survives").toBe(200);
  });

  test('should scrub a deleted account and link its audit row into the chain', async ({ identity }) => {
    const admin = await identity.admin();
    const user = await identity.createUser({
      label: 'admin-delete',
      firstName: 'Delete',
      lastName: 'Me',
      phone: `+1999${randomBytes(3).readUIntBE(0, 3) % 10_000_000}`,
      phoneVerified: true,
    });

    const deleted = await identityMutate(admin.ctx, 'delete', `/api/v1/admin/users/${user.userId}`);
    expect(deleted.status(), await deleted.text()).toBe(200);

    const detail = await userDetail(admin.ctx, user.userId);
    expect(detail).toMatchObject({ status: 'CLOSED', lockMode: 'FULL' });
    expect(detail.emails, 'every email is removed').toEqual([]);
    expect(detail.phones, 'every phone is removed').toEqual([]);
    const [profile] = await identityDb()<{ firstName: string | null; lastName: string | null }[]>`
      SELECT first_name AS "firstName", last_name AS "lastName" FROM user_profiles WHERE user_id = ${user.userId}
    `;
    expect(profile).toEqual({ firstName: null, lastName: null });

    const [row] = await auditRowsFor('admin.user.deleted', user.userId);
    expect(row, 'the deletion is audited').toBeTruthy();
    expect(row?.prevHash, 'the audit row chains to a predecessor').toBeTruthy();
    const [predecessor] = await identityDb()<{ id: string }[]>`
      SELECT id::text FROM audit_events WHERE hash = ${row?.prevHash ?? ''} AND organisation_id IS NOT DISTINCT FROM ${row?.organisationId ?? null}
    `;
    expect(predecessor, "the row's prev_hash names a row in the same chain").toBeTruthy();
  });

  test('should attribute an administrative action to the acting administrator', async ({ identity }) => {
    const admin = await identity.admin();
    const user = await identity.createUser({ label: 'admin-attribution' });

    expect(await identityMutate(admin.ctx, 'post', `/api/v1/admin/users/${user.userId}/lock`, { mode: 'OTP_ONLY' }).then(r => r.status())).toBe(200);

    const trail = await admin.ctx.get(`/api/v1/admin/users/${user.userId}/audit`);
    expect(trail.status(), await trail.text()).toBe(200);
    const { events } = (await trail.json()) as { events: { action: string; actorId?: string; outcome: string }[] };
    const locked = events.find(event => event.action === 'admin.user.locked');
    expect(locked, 'the lock is on the target’s trail').toBeTruthy();
    expect(locked?.outcome).toBe('SUCCESS');
    expect(locked?.actorId, 'the actor is the administrator, not the target').not.toBe(user.userId);
    expect(locked?.actorId).toBe(admin.session.userId);
  });

  test('should resolve a sign-in to the account holding the identifier, not the first matching row', async ({ identity }) => {
    const suffix = randomBytes(3).toString('hex');
    const [first, second] = await Promise.all([
      identity.createUser({ label: 'ident-first', username: `e2e-first-${suffix}`, phone: `+1998${randomBytes(3).readUIntBE(0, 3) % 10_000_000}`, phoneVerified: true }),
      identity.createUser({ label: 'ident-second', username: `e2e-second-${suffix}` }),
    ]);

    for (const [identifier, expected] of [
      [second.email, second],
      [second.username ?? `e2e-second-${suffix}`, second],
      [first.phone ?? '', first],
    ] as [string, IdentityUser][]) {
      const ctx = await identity.anonymous();
      const init = await loginInit(ctx, identifier);
      expect(init.status(), `login/init for ${identifier}: ${await init.text()}`).toBe(200);
      const verified = await verifyChallenge(ctx, { flowId: (await flowStepOf(init)).flowId ?? '', password: expected.password });
      expect(verified.status(), await verified.text()).toBe(200);
      const row = await findSessionBySecret(expectSessionCookie(verified));
      expect(row?.userId, `${identifier} signs in the account that holds it`).toBe(expected.userId);
    }
  });
});

test.describe('identity admin application administration', () => {
  test('should create, read, patch and delete an application with its provisioned client', async ({ identity }) => {
    const admin = await identity.admin();
    const name = `e2e-app-${randomBytes(4).toString('hex')}`;
    const created = await identityMutate(admin.ctx, 'post', '/api/v1/admin/applications', {
      name,
      subDomain: name,
      displayName: 'E2E App',
      description: 'created by the e2e suite',
    });
    expect(created.status(), await created.text()).toBe(201);
    const application = (await created.json()) as { id: number; clientId: string; audience: string; clientSecret?: string };
    identity.trackApplication(application.id, name);

    expect(application.clientId).toBe(name);
    expect(application.audience).toBe(`api://${name}`);
    expect(application.clientSecret, 'the provisioned client hands back its secret once').toBeTruthy();

    const detail = await admin.ctx.get(`/api/v1/admin/applications/${application.id}`);
    expect(detail.status()).toBe(200);
    expect((await detail.json()) as object).toMatchObject({ id: application.id, name, displayName: 'E2E App', isActive: true, visibility: 'PUBLIC', roles: [] });

    const listed = await admin.ctx.get('/api/v1/admin/applications');
    expect(((await listed.json()) as { items: { id: number }[] }).items.map(item => item.id)).toContain(application.id);

    const duplicate = await identityMutate(admin.ctx, 'post', '/api/v1/admin/applications', { name, subDomain: name });
    expect(duplicate.status(), 'a second application may not take the name').toBe(409);
    const malformed = await identityMutate(admin.ctx, 'post', '/api/v1/admin/applications', { name: 'Not A Slug!', subDomain: 'not-a-slug' });
    expect(malformed.status()).toBe(422);

    const patched = await identityMutate(admin.ctx, 'patch', `/api/v1/admin/applications/${application.id}`, {
      displayName: 'E2E Renamed',
      logoUrl: 'https://cdn.example.test/logo.png',
    });
    expect(patched.status(), await patched.text()).toBe(200);
    expect((await (await admin.ctx.get(`/api/v1/admin/applications/${application.id}`)).json()) as object).toMatchObject({
      displayName: 'E2E Renamed',
      logoUrl: 'https://cdn.example.test/logo.png',
      description: 'created by the e2e suite',
    });

    const removed = await identityMutate(admin.ctx, 'delete', `/api/v1/admin/applications/${application.id}`);
    expect(removed.status(), await removed.text()).toBe(200);
    expect((await admin.ctx.get(`/api/v1/admin/applications/${application.id}`)).status()).toBe(404);
    expect((await admin.ctx.get(`/api/v1/admin/clients/${name}`)).status(), 'the provisioned client goes with it').toBe(401);
  });

  test('should refuse to delete an application that still owns another client', async ({ identity }) => {
    const admin = await identity.admin();
    const application = await identity.createOAuthApp('app-clients');
    await identity.createOAuthClientOn(application, { suffix: 'extra' });

    const refused = await identityMutate(admin.ctx, 'delete', `/api/v1/admin/applications/${application.applicationId}`);
    expect(refused.status()).toBe(409);
    await expectErrorCode(refused, 'APP_005');
    expect((await admin.ctx.get(`/api/v1/admin/applications/${application.applicationId}`)).status(), 'nothing was removed').toBe(200);
  });

  test('should protect the platform application from deletion and deactivation', async ({ identity }) => {
    const admin = await identity.admin();
    const listed = await admin.ctx.get('/api/v1/admin/applications');
    const platform = ((await listed.json()) as { items: { id: number; name: string }[] }).items.find(item => item.name === PLATFORM_APPLICATION_NAME);
    expect(platform, 'the platform application is registered').toBeTruthy();

    const deactivated = await identityMutate(admin.ctx, 'patch', `/api/v1/admin/applications/${platform?.id}`, { isActive: false });
    expect(deactivated.status()).toBe(403);
    await expectErrorCode(deactivated, 'APP_004');

    const deleted = await identityMutate(admin.ctx, 'delete', `/api/v1/admin/applications/${platform?.id}`);
    expect(deleted.status()).toBe(403);
    await expectErrorCode(deleted, 'APP_004');

    const detail = await admin.ctx.get(`/api/v1/admin/applications/${platform?.id}`);
    expect((await detail.json()) as { isActive: boolean }).toMatchObject({ isActive: true });
  });

  test('should normalise public urls and regenerate the relying party redirect uris', async ({ identity }) => {
    const admin = await identity.admin();
    const application = await identity.createOAuthApp('public-urls', { withPublicUrl: true });
    const origin = `https://${application.name}.example.test`;

    const patched = await identityMutate(admin.ctx, 'patch', `/api/v1/admin/applications/${application.applicationId}`, { publicUrls: [origin, `${origin}/`] });
    expect(patched.status(), await patched.text()).toBe(200);

    const detail = await admin.ctx.get(`/api/v1/admin/applications/${application.applicationId}`);
    expect((await detail.json()) as { publicUrls: string[] }).toMatchObject({ publicUrls: [origin] });

    const client = await admin.ctx.get(`/api/v1/admin/clients/${relyingPartyClient(application).clientId}`);
    expect((await client.json()) as { redirectUris: string[] }).toMatchObject({ redirectUris: [`${origin}/api/auth/callback`] });
  });

  test('should list and remove an application member', async ({ identity }) => {
    const admin = await identity.admin();
    const application = await identity.createOAuthApp('members');
    const user = await identity.createUser({ label: 'app-member' });
    await identityDb()`INSERT INTO application_members (application_id, user_id) VALUES (${application.applicationId}, ${user.userId})`;

    const listed = await admin.ctx.get(`/api/v1/admin/applications/${application.applicationId}/members`);
    expect(listed.status(), await listed.text()).toBe(200);
    expect(((await listed.json()) as { items: { userId: string }[] }).items.map(item => item.userId)).toEqual([user.userId]);

    const removed = await identityMutate(admin.ctx, 'delete', `/api/v1/admin/applications/${application.applicationId}/members/${user.userId}`);
    expect(removed.status(), await removed.text()).toBe(200);
    expect(((await (await admin.ctx.get(`/api/v1/admin/applications/${application.applicationId}/members`)).json()) as { items: unknown[] }).items).toEqual([]);
  });

  test('should fence an organisation-owned application from platform administrators', async ({ identity }) => {
    const admin = await identity.admin();
    const team = await identity.createTeam({ label: 'owned-app' });
    const owned = await identity.createOrgOAuthApp(team);

    for (const [method, path, body] of [
      ['patch', `/api/v1/admin/applications/${owned.applicationId}`, { displayName: 'hijacked' }],
      ['patch', `/api/v1/admin/applications/${owned.applicationId}`, { publicUrls: ['https://hijacked.example.test'] }],
      ['delete', `/api/v1/admin/applications/${owned.applicationId}`, undefined],
      ['post', `/api/v1/admin/applications/${owned.applicationId}/organisations`, { organisationId: team.organisationId }],
    ] as ['patch' | 'delete' | 'post', string, unknown][]) {
      const refused = await identityMutate(admin.ctx, method, path, body);
      expect(refused.status(), `${method} ${path}`).toBe(409);
      await expectErrorCode(refused, 'APP_009');
    }

    const member = await identity.createUser({ label: 'owned-app-member' });
    await identityDb()`INSERT INTO application_members (application_id, user_id) VALUES (${owned.applicationId}, ${member.userId})`;
    const removed = await identityMutate(admin.ctx, 'delete', `/api/v1/admin/applications/${owned.applicationId}/members/${member.userId}`);
    expect(removed.status(), 'removing a member of an owned application is still allowed').toBe(200);
  });
});

test.describe('identity admin application release', () => {
  test('should record a visibility change once and release a restricted application to a team', async ({ identity }) => {
    const admin = await identity.admin();
    const application = await identity.createOAuthApp('release');
    const team = await identity.createTeam({ label: 'release' });

    // The application factory sets the visibility it was asked for, so the baseline is not empty.
    const before = (await auditRowsFor('application.visibility.changed', String(application.applicationId))).length;
    const restricted = await identityMutate(admin.ctx, 'patch', `/api/v1/admin/applications/${application.applicationId}`, { visibility: 'RESTRICTED' });
    expect(restricted.status(), await restricted.text()).toBe(200);
    expect((await (await admin.ctx.get(`/api/v1/admin/applications/${application.applicationId}`)).json()) as object).toMatchObject({ visibility: 'RESTRICTED' });
    expect(await auditRowsFor('application.visibility.changed', String(application.applicationId)), 'one visibility change, one audit row').toHaveLength(before + 1);

    const released = await identityMutate(admin.ctx, 'post', `/api/v1/admin/applications/${application.applicationId}/organisations`, { organisationId: team.organisationId });
    expect(released.status(), await released.text()).toBe(200);
    const overview = await admin.ctx.get(`/api/v1/admin/applications/${application.applicationId}/organisations`);
    expect(((await overview.json()) as { items: { organisationId: string; source: string; assignedBy?: string }[] }).items).toEqual([
      expect.objectContaining({ organisationId: team.organisationId, source: 'PLATFORM_RELEASE', assignedBy: admin.session.userId }),
    ]);
    expect(await auditRowsFor('application.release.granted', String(application.applicationId))).toHaveLength(1);

    const again = await identityMutate(admin.ctx, 'post', `/api/v1/admin/applications/${application.applicationId}/organisations`, { organisationId: team.organisationId });
    expect(again.status(), 'a repeated release is idempotent').toBe(200);
    expect(((await (await admin.ctx.get(`/api/v1/admin/applications/${application.applicationId}/organisations`)).json()) as { items: unknown[] }).items).toHaveLength(1);

    const revoked = await identityMutate(admin.ctx, 'delete', `/api/v1/admin/applications/${application.applicationId}/organisations/${team.organisationId}`);
    expect(revoked.status(), await revoked.text()).toBe(200);
    expect(((await (await admin.ctx.get(`/api/v1/admin/applications/${application.applicationId}/organisations`)).json()) as { items: unknown[] }).items).toEqual([]);
    expect(await auditRowsFor('application.release.revoked', String(application.applicationId))).toHaveLength(1);
  });

  test('should refuse a release that names the wrong application or the wrong organisation', async ({ identity }) => {
    const admin = await identity.admin();
    const application = await identity.createOAuthApp('release-refusals');
    const team = await identity.createTeam({ label: 'release-refusals' });

    const notRestricted = await identityMutate(admin.ctx, 'post', `/api/v1/admin/applications/${application.applicationId}/organisations`, { organisationId: team.organisationId });
    expect(notRestricted.status(), 'only a RESTRICTED application is released').toBe(400);
    await expectErrorCode(notRestricted, 'APP_008');

    await updateApplication(admin.ctx, application.applicationId, { visibility: 'RESTRICTED' });

    const unknownOrg = await identityMutate(admin.ctx, 'post', `/api/v1/admin/applications/${application.applicationId}/organisations`, { organisationId: '99999999' });
    expect(unknownOrg.status()).toBe(404);
    await expectErrorCode(unknownOrg, 'ORG_002');

    const personal = await identityMutate(admin.ctx, 'post', `/api/v1/admin/applications/${application.applicationId}/organisations`, { organisationId: team.owner.personalOrgId });
    expect(personal.status(), 'a personal workspace holds no release').toBe(409);
    await expectErrorCode(personal, 'ORG_003');

    const released = await identityMutate(admin.ctx, 'post', `/api/v1/admin/applications/${application.applicationId}/organisations`, { organisationId: team.organisationId });
    expect(released.status(), 'the legitimate release still lands').toBe(200);
  });
});
