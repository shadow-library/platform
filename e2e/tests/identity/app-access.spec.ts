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
  assignOrganisationApplication,
  authorize,
  type AuthorizeRedirect,
  findPlatformOrganisationId,
  identityDb,
  identityMutate,
  type IdentityUser,
  invalidateAllGrants,
  issueTokens,
  type OAuthTestClient,
  PLATFORM_ORGANISATION_NAME,
  refreshGrant,
  registerOAuthClient,
  registerOrgOAuthApp,
  releaseApplication,
  requireProductUrl,
  revokeApplicationRelease,
  setScimDirectoryEntry,
  unassignOrganisationApplication,
  updateApplication,
  updateOrganisation,
  updateOrganisationMember,
} from '../../lib';
import { expect, type IdentityHarness, test } from './fixtures';

/**
 * Defining types
 */

interface LauncherEntry {
  id: number;
  name: string;
  isActive: boolean;
  firstUsedAt?: string;
  lastUsedAt?: string;
}

interface AuditRow {
  outcome: string;
  actorId: string;
  targetType: string;
}

/**
 * Declaring the constants
 *
 * Which applications a user may sign into, as identity decides at `/oauth2/authorize`: a code (or, for a third-party client,
 * the consent prompt) when access is granted, `access_denied` when the application is visible but not granted, and the
 * unknown-client page when it is hidden. Grants come from the user's organisations — the personal workspace, team
 * organisations in either app-access mode, the platform organisation — and from releases, assignments and ownership. Each test
 * builds its own organisations and applications; states no API reaches (suspensions, SCIM management) are arranged in the database.
 */

const ISSUER = new URL(requireProductUrl('identity')).origin;
const DAY_MS = 24 * 60 * 60 * 1000;

function newState(): string {
  return randomBytes(8).toString('hex');
}

function authorizeFor(ctx: APIRequestContext, client: OAuthTestClient, state = newState()): Promise<AuthorizeRedirect> {
  return authorize(ctx, { clientId: client.clientId, redirectUri: client.redirectUri, scope: 'openid', state });
}

async function expectGranted(ctx: APIRequestContext, client: OAuthTestClient, message?: string): Promise<void> {
  const state = newState();
  const redirect = await authorizeFor(ctx, client, state);
  expect(`${redirect.location?.origin}${redirect.location?.pathname}`, message).toBe(client.redirectUri);
  expect(redirect.location?.searchParams.get('code'), message).toBeTruthy();
  expect(redirect.location?.searchParams.get('state')).toBe(state);
}

/** A first-party client the user may see but not use lands on identity's own error page, never at the client. */
async function expectDenied(ctx: APIRequestContext, client: OAuthTestClient, applicationName: string, message?: string): Promise<void> {
  const redirect = await authorizeFor(ctx, client);
  expect(redirect.status).toBe(302);
  expect(`${redirect.location?.origin}${redirect.location?.pathname}`, message).toBe(`${ISSUER}/error`);
  expect(Object.fromEntries(redirect.location?.searchParams ?? [])).toEqual({ error: 'access_denied', application: applicationName, client_id: client.clientId });
}

/** A hidden application is answered exactly like a client identity has never heard of. */
async function expectHidden(ctx: APIRequestContext, client: OAuthTestClient, message?: string): Promise<void> {
  const redirect = await authorizeFor(ctx, client);
  expect(redirect.status).toBe(302);
  expect(`${redirect.location?.origin}${redirect.location?.pathname}`, message).toBe(`${ISSUER}/invalid-request`);
  expect(Object.fromEntries(redirect.location?.searchParams ?? [])).toEqual({ error: 'invalid_client', client_id: client.clientId, redirect_uri: client.redirectUri });
}

async function expectDeniedAtClient(ctx: APIRequestContext, client: OAuthTestClient, message?: string): Promise<void> {
  const state = newState();
  const redirect = await authorizeFor(ctx, client, state);
  expect(redirect.status).toBe(302);
  expect(`${redirect.location?.origin}${redirect.location?.pathname}`, message).toBe(client.redirectUri);
  expect(Object.fromEntries(redirect.location?.searchParams ?? [])).toEqual({ error: 'access_denied', state });
}

async function expectConsentPrompt(ctx: APIRequestContext, client: OAuthTestClient, message?: string): Promise<void> {
  const redirect = await authorizeFor(ctx, client);
  expect(redirect.status).toBe(302);
  expect(`${redirect.location?.origin}${redirect.location?.pathname}`, message).toBe(`${ISSUER}/login`);
  expect(redirect.location?.searchParams.has('code')).toBe(false);
}

async function deniedAudits(user: IdentityUser, clientId: string): Promise<AuditRow[]> {
  return identityDb()<AuditRow[]>`
    SELECT outcome, actor_id AS "actorId", target_type AS "targetType" FROM audit_events WHERE action = 'oauth.authorize.denied' AND target_id = ${clientId} AND actor_id = ${user.userId}
  `;
}

async function launcher(ctx: APIRequestContext): Promise<LauncherEntry[]> {
  const response = await ctx.get('/api/v1/me/applications');
  expect(response.status()).toBe(200);
  return ((await response.json()) as { applications: LauncherEntry[] }).applications;
}

async function member(identity: IdentityHarness, label: string, ...organisationIds: string[]): Promise<{ user: IdentityUser; ctx: APIRequestContext }> {
  const user = await identity.createUser({ label });
  for (const organisationId of organisationIds) await addOrganisationMember(organisationId, user.userId);
  return { user, ctx: (await identity.signIn(user)).ctx };
}

async function firstPartyApp(
  identity: IdentityHarness,
  label: string,
  visibility: 'PUBLIC' | 'RESTRICTED' | 'INTERNAL',
): Promise<{ name: string; applicationId: number; client: OAuthTestClient }> {
  const application = await identity.createOAuthApp(label, { visibility });
  const client = await registerOAuthClient((await identity.admin()).ctx, application, { grantTypes: ['authorization_code', 'refresh_token'] });
  return { name: application.name, applicationId: application.applicationId, client };
}

test.describe('identity app access — authorize enforcement', () => {
  test('should deny an org-owned app to outsiders at its redirect URI and send members to consent, never to a silent code', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'owned' });
    const app = await registerOrgOAuthApp(team.ownerCtx, team.organisationId);
    const inside = await member(identity, 'owned-member', team.organisationId);
    const outside = await member(identity, 'owned-outsider');

    await expectDeniedAtClient(outside.ctx, app, 'a non-member is refused at the registered redirect URI');
    expect(await deniedAudits(outside.user, app.clientId)).toEqual([{ outcome: 'DENIED', actorId: outside.user.userId, targetType: 'oauth_client' }]);

    await expectConsentPrompt(inside.ctx, app, 'a member of the owning organisation is asked for consent');
    const approved = await identityMutate(inside.ctx, 'post', '/api/v1/auth/consent', { clientId: app.clientId, scopeNames: ['openid'], decision: 'APPROVE' });
    expect(approved.status()).toBe(200);
    await expectGranted(inside.ctx, app, 'the member gets a code once consent is recorded');
    await expectDeniedAtClient(outside.ctx, app, 'the member’s consent opens nothing for the outsider');
  });

  test('should deny an unassigned first-party app under ASSIGNED_ONLY, admit a member after release and assignment, and kill refresh on unassignment', async ({ identity }) => {
    const admin = (await identity.admin()).ctx;
    const team = await identity.createTeam({ label: 'assigned', appAccessMode: 'ASSIGNED_ONLY' });
    const app = await firstPartyApp(identity, 'assigned', 'RESTRICTED');
    const { user, ctx } = await member(identity, 'assigned-member', team.organisationId);
    const tokenCtx = await identity.anonymous();

    await expectDenied(ctx, app.client, app.name, 'neither released nor assigned');
    expect(await deniedAudits(user, app.client.clientId)).toEqual([{ outcome: 'DENIED', actorId: user.userId, targetType: 'oauth_client' }]);
    await releaseApplication(admin, app.applicationId, team.organisationId);
    await expectDenied(ctx, app.client, app.name, 'a release alone does not grant under ASSIGNED_ONLY');

    await assignOrganisationApplication(team.ownerCtx, team.organisationId, app.applicationId);
    await expectGranted(ctx, app.client, 'released and assigned');
    const { refreshToken } = await issueTokens(ctx, tokenCtx, app.client);

    await unassignOrganisationApplication(team.ownerCtx, team.organisationId, app.applicationId);
    await expectDenied(ctx, app.client, app.name, 'unassigned again');
    const refused = await refreshGrant(tokenCtx, app.client, refreshToken);
    expect(refused.status()).toBe(400);
    expect(((await refused.json()) as { code?: string }).code).toBe('invalid_grant');

    await assignOrganisationApplication(team.ownerCtx, team.organisationId, app.applicationId);
    await expectGranted(ctx, app.client, 'the member is admitted again after reassignment');
    const families = await identityDb()<{ status: string; revokeReason: string | null; activeTokens: number }[]>`
      SELECT f.status, f.revoke_reason AS "revokeReason", count(t.id) FILTER (WHERE t.status = 'ACTIVE')::int AS "activeTokens"
      FROM refresh_token_families f LEFT JOIN refresh_tokens t ON t.family_id = f.id
      WHERE f.client_id = ${app.client.clientId} AND f.user_id = ${user.userId}
      GROUP BY f.id
    `;
    expect(families, 'the family revoked on unassignment is not revived by reassignment').toEqual([{ status: 'REVOKED', revokeReason: 'ADMIN', activeTokens: 0 }]);
    await expect(refreshGrant(tokenCtx, app.client, refreshToken).then(response => response.status())).resolves.toBe(400);
  });

  test('should hide an INTERNAL app from everyone outside the platform organisation', async ({ identity }) => {
    const app = await firstPartyApp(identity, 'internal', 'INTERNAL');
    const outsider = await member(identity, 'internal-outsider');
    const insider = await member(identity, 'internal-insider', await findPlatformOrganisationId());

    await expectHidden(outsider.ctx, app.client, 'an ungranted INTERNAL app is indistinguishable from an unknown client');
    expect(await deniedAudits(outsider.user, app.client.clientId), 'hiding is not a recorded denial').toEqual([]);
    await expectGranted(insider.ctx, app.client, 'a platform-organisation member is granted INTERNAL apps');
  });

  test.fixme('should not treat a user-created team that borrows the platform organisation’s name as the platform organisation', async ({ identity }) => {
    // ApplicationAccessService.computePlatformGrants matches the platform org by name, and team names are neither unique nor reserved.
    const app = await firstPartyApp(identity, 'namesake', 'INTERNAL');
    const { user, ctx } = await member(identity, 'namesake');
    const created = await identityMutate(ctx, 'post', '/api/v1/organisations', { name: PLATFORM_ORGANISATION_NAME, slug: `e2e-namesake-${randomBytes(4).toString('hex')}` });
    expect(created.status()).toBe(201);
    identity.trackOrganisation(((await created.json()) as { id: string }).id, user.userId);

    await expectHidden(ctx, app.client, 'a namesake team must not unlock INTERNAL apps');
  });
});

test.describe('identity app access — grant resolution', () => {
  test('should grant a personal workspace PUBLIC apps only', async ({ identity }) => {
    const publicApp = await firstPartyApp(identity, 'personal-public', 'PUBLIC');
    const restricted = await firstPartyApp(identity, 'personal-restricted', 'RESTRICTED');
    const internal = await firstPartyApp(identity, 'personal-internal', 'INTERNAL');
    const { ctx } = await member(identity, 'personal');

    await expectGranted(ctx, publicApp.client, 'PUBLIC');
    await expectDenied(ctx, restricted.client, restricted.name, 'RESTRICTED is visible but not granted');
    await expectHidden(ctx, internal.client, 'INTERNAL is hidden');
  });

  test('should grant a released RESTRICTED app to an ALL_APPS team without assignment and never an unreleased one', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'all-apps' });
    const released = await firstPartyApp(identity, 'all-released', 'RESTRICTED');
    const unreleased = await firstPartyApp(identity, 'all-unreleased', 'RESTRICTED');
    await releaseApplication((await identity.admin()).ctx, released.applicationId, team.organisationId);
    const { ctx } = await member(identity, 'all-apps', team.organisationId);

    await expectGranted(ctx, released.client, 'released to an ALL_APPS team');
    await expectDenied(ctx, unreleased.client, unreleased.name, 'not released');
  });

  test('should grant nothing through a suspended membership or organisation, count a lapsed suspension as active, and hide an inactive app', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'suspended' });
    const app = await firstPartyApp(identity, 'suspended', 'RESTRICTED');
    await releaseApplication((await identity.admin()).ctx, app.applicationId, team.organisationId);
    const { user, ctx } = await member(identity, 'suspended', team.organisationId);
    await expectGranted(ctx, app.client, 'baseline');

    await updateOrganisationMember(team.organisationId, user.userId, { status: 'SUSPENDED', statusUntil: new Date(Date.now() + DAY_MS) });
    await expectDenied(ctx, app.client, app.name, 'membership suspended until tomorrow');
    await updateOrganisationMember(team.organisationId, user.userId, { status: 'SUSPENDED', statusUntil: new Date(Date.now() - 60_000) });
    await expectGranted(ctx, app.client, 'a lapsed suspension counts as active');

    await updateOrganisationMember(team.organisationId, user.userId, { status: 'ACTIVE', statusUntil: null });
    await updateOrganisation(team.organisationId, { status: 'SUSPENDED' });
    await expectDenied(ctx, app.client, app.name, 'organisation suspended');
    await updateOrganisation(team.organisationId, { status: 'ACTIVE' });
    await expectGranted(ctx, app.client, 'organisation reinstated');

    await updateApplication((await identity.admin()).ctx, app.applicationId, { isActive: false });
    await expectHidden(ctx, app.client, 'an inactive application is hidden, not denied');
  });

  test('should grant an org-owned app only to active members of an active owning organisation, whatever its visibility or access mode', async ({ identity }) => {
    const owner = await identity.createTeam({ label: 'owner-org', appAccessMode: 'ASSIGNED_ONLY' });
    const other = await identity.createTeam({ label: 'other-org' });
    const app = await registerOrgOAuthApp(owner.ownerCtx, owner.organisationId);
    const inside = await member(identity, 'owned-inside', owner.organisationId);
    const neighbour = await member(identity, 'owned-neighbour', other.organisationId);

    await expectConsentPrompt(inside.ctx, app, 'the owning org grants its app to members with no assignment, even under ASSIGNED_ONLY');
    await expectDeniedAtClient(neighbour.ctx, app, 'another ALL_APPS organisation never gets an org-owned app');

    await identityDb()`UPDATE applications SET visibility = 'PUBLIC' WHERE id = ${app.applicationId}`;
    await invalidateAllGrants();
    await expectDeniedAtClient(neighbour.ctx, app, 'an org-owned PUBLIC app is still never granted outside its owner');

    await updateOrganisationMember(owner.organisationId, inside.user.userId, { status: 'SUSPENDED', statusUntil: new Date(Date.now() + DAY_MS) });
    await expectDeniedAtClient(inside.ctx, app, 'suspended membership in the owning org');
    await updateOrganisationMember(owner.organisationId, inside.user.userId, { status: 'ACTIVE', statusUntil: null });
    await expectConsentPrompt(inside.ctx, app, 'membership reinstated');

    await updateOrganisation(owner.organisationId, { status: 'SUSPENDED' });
    await expectDeniedAtClient(inside.ctx, app, 'the owning organisation is suspended');
  });

  test('should fence a SCIM-managed account to its managing organisation’s grants while an adopted account keeps them all', async ({ identity }) => {
    const admin = (await identity.admin()).ctx;
    const managing = await identity.createTeam({ label: 'scim', appAccessMode: 'ASSIGNED_ONLY' });
    const otherTeam = await identity.createTeam({ label: 'scim-other' });
    const publicApp = await firstPartyApp(identity, 'scim-public', 'PUBLIC');
    const teamApp = await firstPartyApp(identity, 'scim-team', 'RESTRICTED');
    await releaseApplication(admin, teamApp.applicationId, otherTeam.organisationId);
    const { user, ctx } = await member(identity, 'scim', managing.organisationId, otherTeam.organisationId);

    await expectGranted(ctx, publicApp.client, 'PUBLIC through the personal workspace');
    await expectGranted(ctx, teamApp.client, 'RESTRICTED through the other team');

    await setScimDirectoryEntry(managing.organisationId, user.userId, false);
    await expectGranted(ctx, publicApp.client, 'an adopted account keeps its personal workspace');
    await expectGranted(ctx, teamApp.client, 'an adopted account keeps its other memberships');

    await setScimDirectoryEntry(managing.organisationId, user.userId, true);
    await expectDenied(ctx, publicApp.client, publicApp.name, 'a managed account loses its personal PUBLIC grants');
    await expectDenied(ctx, teamApp.client, teamApp.name, 'a managed account loses its other organisations’ grants');

    await assignOrganisationApplication(managing.ownerCtx, managing.organisationId, publicApp.applicationId);
    await expectGranted(ctx, publicApp.client, 'an ASSIGNED_ONLY organisation grants even a PUBLIC app only once assigned');
  });
});

test.describe('identity app access — grant cache', () => {
  test('should apply every admin access mutation to the very next authorization', async ({ identity }) => {
    const admin = (await identity.admin()).ctx;
    const team = await identity.createTeam({ label: 'cache', appAccessMode: 'ASSIGNED_ONLY' });
    const app = await firstPartyApp(identity, 'cache', 'RESTRICTED');
    const { ctx } = await member(identity, 'cache', team.organisationId);

    await expectDenied(ctx, app.client, app.name, 'warm the cache with a denial');
    await releaseApplication(admin, app.applicationId, team.organisationId);
    await assignOrganisationApplication(team.ownerCtx, team.organisationId, app.applicationId);
    await expectGranted(ctx, app.client, 'after assign');
    await unassignOrganisationApplication(team.ownerCtx, team.organisationId, app.applicationId);
    await expectDenied(ctx, app.client, app.name, 'after unassign');
    await assignOrganisationApplication(team.ownerCtx, team.organisationId, app.applicationId);
    await expectGranted(ctx, app.client, 'after reassign');
    await revokeApplicationRelease(admin, app.applicationId, team.organisationId);
    await expectDenied(ctx, app.client, app.name, 'after the release is revoked');
    await releaseApplication(admin, app.applicationId, team.organisationId);
    await expectGranted(ctx, app.client, 'after the release is restored');

    await updateApplication(admin, app.applicationId, { visibility: 'INTERNAL' });
    await expectHidden(ctx, app.client, 'after the app turns INTERNAL');
    await updateApplication(admin, app.applicationId, { visibility: 'RESTRICTED' });
    await expectGranted(ctx, app.client, 'after the app turns RESTRICTED again');

    await updateApplication(admin, app.applicationId, { isActive: false });
    await expectHidden(ctx, app.client, 'after deactivation');
  });

  test.fixme('should drop a deactivated app from the launcher at once', async ({ identity }) => {
    // The admin application PATCH invalidates the grant cache only for a visibility change, so the launcher keeps a deactivated app for up to 5 minutes.
    const app = await firstPartyApp(identity, 'cache-deactivate', 'PUBLIC');
    const { ctx } = await member(identity, 'cache-deactivate');
    expect(
      (await launcher(ctx)).map(entry => entry.id),
      'warm the cache',
    ).toContain(app.applicationId);

    await updateApplication((await identity.admin()).ctx, app.applicationId, { isActive: false });
    expect((await launcher(ctx)).map(entry => entry.id)).not.toContain(app.applicationId);
  });
});

test.describe('identity app access — launcher', () => {
  test('should list reachable apps, stamp usage once used, and drop an app whose release is revoked', async ({ identity }) => {
    const admin = (await identity.admin()).ctx;
    const team = await identity.createTeam({ label: 'launcher' });
    const publicApp = await firstPartyApp(identity, 'launch-public', 'PUBLIC');
    const unreachable = await firstPartyApp(identity, 'launch-hidden', 'RESTRICTED');
    const teamApp = await firstPartyApp(identity, 'launch-team', 'RESTRICTED');
    await releaseApplication(admin, teamApp.applicationId, team.organisationId);
    const { ctx } = await member(identity, 'launcher', team.organisationId);
    const entry = async (applicationId: number): Promise<LauncherEntry | undefined> => (await launcher(ctx)).find(item => item.id === applicationId);

    const before = await launcher(ctx);
    expect(
      before.map(item => item.name),
      'identity never lists itself',
    ).not.toContain('shadow-identity');
    expect(before.map(item => item.id)).not.toContain(unreachable.applicationId);
    const unused = before.find(item => item.id === publicApp.applicationId);
    expect(unused).toMatchObject({ name: publicApp.name, isActive: true });
    expect(unused).not.toHaveProperty('firstUsedAt');
    expect(unused).not.toHaveProperty('lastUsedAt');

    await expectGranted(ctx, publicApp.client);
    const used = await entry(publicApp.applicationId);
    expect(used?.firstUsedAt).toEqual(expect.any(String));
    expect(used?.lastUsedAt).toEqual(expect.any(String));

    await expectGranted(ctx, teamApp.client);
    expect((await entry(teamApp.applicationId))?.firstUsedAt).toEqual(expect.any(String));
    await revokeApplicationRelease(admin, teamApp.applicationId, team.organisationId);
    expect(await entry(teamApp.applicationId), 'a used app is dropped once it is no longer reachable').toBeUndefined();
    expect(await entry(unreachable.applicationId)).toBeUndefined();
  });
});
