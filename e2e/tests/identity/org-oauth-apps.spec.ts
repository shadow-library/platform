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
  auditChain,
  createResourceScope,
  deleteApplicationRows,
  identityDb,
  identityMutate,
  type IdentityUser,
  OAUTH_REDIRECT_URI,
  type OrganisationRole,
  registerOrgOAuthApp,
  releaseApplication,
  seedOwnedApplications,
  updateApplication,
  updateOrganisation,
} from '../../lib';
import { expect, type IdentityHarness, type IdentityTeam, test } from './fixtures';
import { expectErrorCode } from './helpers';

/**
 * Defining types
 */

interface OrganisationApplicationItem {
  id: number;
  name: string;
  visibility: string;
  assigned: boolean;
}

interface OrganisationApplicationsView {
  appAccessMode: string;
  applications: OrganisationApplicationItem[];
}

interface OrgOAuthAppItem {
  applicationId: number;
  clientId: string;
  displayName?: string;
  isActive: boolean;
}

interface OrgOAuthAppDetail extends OrgOAuthAppItem {
  kind: string;
  redirectUris: string[];
  scopes: string[];
  homePageUrl?: string;
  logoUrl?: string;
}

interface OrgOAuthAppScopeItem {
  scopeId: string;
  name: string;
  resourceIdentifier: string;
  applicationDisplayName?: string;
}

interface ClientRow {
  kind: string;
  isFirstParty: boolean;
  authMethod: string;
  grantTypes: string[];
  organisationId: string | null;
}

/**
 * Declaring the constants
 *
 * The two application surfaces an organisation administers: the platform applications it may add to its own allowlist, and
 * the OAuth applications it owns outright. Both are driven through the API as an organisation admin, whose session carries
 * the self-service step-up every mutation needs, and each group of refusals is followed by the legitimate call it must not
 * have closed. The ten-application allowance is filled with bare owned rows rather than ten registrations, and those rows
 * are removed before the harness takes the organisation down.
 */

const APP_PATH = (organisationId: string): string => `/api/v1/organisations/${organisationId}/oauth-apps`;
const HTTPS_URI = 'https://app.example.test/second';

/** Application rows seeded straight into the database, removed before the organisations that own them are. */
const seededApplications: number[] = [];

test.afterEach(async () => {
  await deleteApplicationRows(seededApplications.splice(0));
});

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

async function organisationApplications(ctx: APIRequestContext, organisationId: string): Promise<OrganisationApplicationsView> {
  const response = await ctx.get(`/api/v1/organisations/${organisationId}/applications`);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as OrganisationApplicationsView;
}

function assign(ctx: APIRequestContext, organisationId: string, applicationId: number): Promise<APIResponse> {
  return identityMutate(ctx, 'post', `/api/v1/organisations/${organisationId}/applications`, { applicationId: String(applicationId) });
}

function unassign(ctx: APIRequestContext, organisationId: string, applicationId: number): Promise<APIResponse> {
  return identityMutate(ctx, 'delete', `/api/v1/organisations/${organisationId}/applications/${applicationId}`);
}

function registerApp(ctx: APIRequestContext, organisationId: string, body: Record<string, unknown>): Promise<APIResponse> {
  return identityMutate(ctx, 'post', APP_PATH(organisationId), { kind: 'WEB_CONFIDENTIAL', redirectUris: [OAUTH_REDIRECT_URI], ...body });
}

function registerWebApp(ctx: APIRequestContext, organisationId: string, redirectUris: string[], extra: Record<string, unknown> = {}): Promise<APIResponse> {
  return registerApp(ctx, organisationId, { displayName: `E2E URI ${randomBytes(3).toString('hex')}`, redirectUris, ...extra });
}

async function listApps(ctx: APIRequestContext, organisationId: string): Promise<OrgOAuthAppItem[]> {
  const response = await ctx.get(APP_PATH(organisationId));
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as { apps: OrgOAuthAppItem[] }).apps;
}

async function appDetail(ctx: APIRequestContext, organisationId: string, applicationId: number): Promise<OrgOAuthAppDetail> {
  const response = await ctx.get(`${APP_PATH(organisationId)}/${applicationId}`);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as OrgOAuthAppDetail;
}

function updateApp(ctx: APIRequestContext, organisationId: string, applicationId: number, body: Record<string, unknown>): Promise<APIResponse> {
  return identityMutate(ctx, 'patch', `${APP_PATH(organisationId)}/${applicationId}`, body);
}

function rotateSecret(ctx: APIRequestContext, organisationId: string, applicationId: number): Promise<APIResponse> {
  return identityMutate(ctx, 'post', `${APP_PATH(organisationId)}/${applicationId}/rotate-secret`);
}

async function scopeCatalog(ctx: APIRequestContext, organisationId: string): Promise<OrgOAuthAppScopeItem[]> {
  const response = await ctx.get(`${APP_PATH(organisationId)}/scope-catalog`);
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as { scopes: OrgOAuthAppScopeItem[] }).scopes;
}

function grantScope(ctx: APIRequestContext, organisationId: string, applicationId: number, scopeId: string): Promise<APIResponse> {
  return identityMutate(ctx, 'post', `${APP_PATH(organisationId)}/${applicationId}/scopes`, { scopeId });
}

async function clientRow(clientId: string): Promise<ClientRow | undefined> {
  const [row] = await identityDb()<ClientRow[]>`
    SELECT kind, is_first_party AS "isFirstParty", token_endpoint_auth_method AS "authMethod", grant_types AS "grantTypes", organisation_id::text AS "organisationId"
    FROM oauth_clients WHERE id = ${clientId}
  `;
  return row;
}

/** Gives an organisation-owned application an API resource of its own — the one scope source the catalog must never lend out, and one no API creates. */
async function seedApplicationScope(applicationId: number, name: string): Promise<string> {
  const [row] = await identityDb()<{ id: string }[]>`
    WITH resource AS (
      INSERT INTO api_resources (application_id, identifier, display_name) VALUES (${applicationId}, ${`api://e2e-owned-${applicationId}`}, 'E2E Owned Resource') RETURNING id
    )
    INSERT INTO scopes (api_resource_id, name, principal_type) SELECT id, ${name}, 'USER' FROM resource RETURNING id
  `;
  if (!row) throw new Error(`scope insert for application ${applicationId} returned no row`);
  return row.id;
}

async function applicationRow(applicationId: number): Promise<{ visibility: string; ownerOrganisationId: string | null } | undefined> {
  const [row] = await identityDb()<{ visibility: string; ownerOrganisationId: string | null }[]>`
    SELECT visibility, owner_organisation_id::text AS "ownerOrganisationId" FROM applications WHERE id = ${applicationId}
  `;
  return row;
}

test.describe('identity organisation applications — assignment', () => {
  test('should offer public and released applications with their assignment state, never an organisation-owned one, and audit both sides', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'orgapp-list' });
    const offered = await identity.createOAuthApp('orgapp-public');
    const released = await identity.createOAuthApp('orgapp-released', { visibility: 'RESTRICTED' });
    const withheld = await identity.createOAuthApp('orgapp-withheld', { visibility: 'RESTRICTED' });
    await releaseApplication((await identity.admin()).ctx, released.applicationId, team.organisationId);
    const owned = await registerOrgOAuthApp(team.ownerCtx, team.organisationId);

    const listed = await organisationApplications(team.ownerCtx, team.organisationId);
    expect(listed.appAccessMode).toBe('ALL_APPS');
    expect(listed.applications.find(item => item.id === offered.applicationId)).toMatchObject({ visibility: 'PUBLIC', assigned: false });
    expect(listed.applications.find(item => item.id === released.applicationId)).toMatchObject({ visibility: 'RESTRICTED', assigned: false });
    expect(
      listed.applications.map(item => item.id),
      'an unreleased RESTRICTED application is not offered',
    ).not.toContain(withheld.applicationId);
    expect(
      listed.applications.map(item => item.id),
      'an organisation never sees its own application offered to it',
    ).not.toContain(owned.applicationId);

    const assigned = await assign(team.ownerCtx, team.organisationId, released.applicationId);
    expect(assigned.status(), await assigned.text()).toBe(200);
    expect((await organisationApplications(team.ownerCtx, team.organisationId)).applications.find(item => item.id === released.applicationId)?.assigned).toBe(true);
    const removed = await unassign(team.ownerCtx, team.organisationId, released.applicationId);
    expect(removed.status(), await removed.text()).toBe(200);
    expect((await organisationApplications(team.ownerCtx, team.organisationId)).applications.find(item => item.id === released.applicationId)?.assigned).toBe(false);

    const chain = await auditChain(team.organisationId);
    expect(chain.filter(row => row.action.startsWith('org.application.')).map(row => [row.action, row.targetId])).toEqual([
      ['org.application.assigned', String(released.applicationId)],
      ['org.application.unassigned', String(released.applicationId)],
    ]);
  });

  test('should refuse assigning an internal, unreleased or organisation-owned application and admit only an elevated admin', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'orgapp-assign' });
    const member = await teamMember(identity, team, 'orgapp-assign-member', 'MEMBER');
    const internal = await identity.createOAuthApp('orgapp-internal', { visibility: 'INTERNAL' });
    const restricted = await identity.createOAuthApp('orgapp-restricted', { visibility: 'RESTRICTED' });
    const owned = await registerOrgOAuthApp(team.ownerCtx, team.organisationId);

    await expectRefused(await assign(team.ownerCtx, team.organisationId, internal.applicationId), 400, 'ORG_011', 'an INTERNAL application');
    await expectRefused(await assign(team.ownerCtx, team.organisationId, restricted.applicationId), 400, 'ORG_011', 'a RESTRICTED application with no release');
    await expectRefused(await assign(team.ownerCtx, team.organisationId, owned.applicationId), 409, 'APP_009', 'the organisation’s own application');
    await expectRefused(await assign(member.ctx, team.organisationId, restricted.applicationId), 403, 'ORG_007', 'a plain member');

    await releaseApplication((await identity.admin()).ctx, restricted.applicationId, team.organisationId);
    const assigned = await assign(team.ownerCtx, team.organisationId, restricted.applicationId);
    expect(assigned.status(), 'a released application is assignable by an elevated admin').toBe(200);
  });

  test('should reserve the access mode to an elevated owner while renaming stays with an admin', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'orgapp-mode' });
    const admin = await teamMember(identity, team, 'orgapp-mode-admin', 'ADMIN');
    const unelevated = await identity.signIn(team.owner);
    const patch = (ctx: APIRequestContext, body: Record<string, unknown>): Promise<APIResponse> =>
      identityMutate(ctx, 'patch', `/api/v1/organisations/${team.organisationId}`, body);

    await expectRefused(await patch(admin.ctx, { appAccessMode: 'ASSIGNED_ONLY' }), 403, 'ORG_007', 'an elevated admin is not an owner');
    await expectRefused(await patch(unelevated.ctx, { appAccessMode: 'ASSIGNED_ONLY' }), 403, 'AUTH_006', 'an owner without a step-up');
    const renamed = await patch(admin.ctx, { name: 'E2E Mode Rename' });
    expect(renamed.status(), 'renaming stays an admin operation').toBe(200);

    const changed = await patch(team.ownerCtx, { appAccessMode: 'ASSIGNED_ONLY' });
    expect(changed.status(), await changed.text()).toBe(200);
    expect((await changed.json()) as { appAccessMode: string }).toMatchObject({ appAccessMode: 'ASSIGNED_ONLY' });
    expect((await organisationApplications(team.ownerCtx, team.organisationId)).appAccessMode).toBe('ASSIGNED_ONLY');
    expect((await auditChain(team.organisationId)).map(row => row.action)).toContain('org.app_access_mode.changed');
  });
});

test.describe('identity organisation OAuth apps — access and registration', () => {
  test('should admit an elevated org admin alone, hide another organisation’s app behind a 404 and keep reads open to an unelevated admin', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'orgoauth-access' });
    const neighbour = await identity.createTeam({ label: 'orgoauth-neighbour' });
    const member = await teamMember(identity, team, 'orgoauth-member', 'MEMBER');
    const outsider = await identity.createUser({ label: 'orgoauth-outsider' });
    const outsiderCtx = (await identity.signIn(outsider, { aal: 'AAL2' })).ctx;
    const unelevated = await identity.signIn(team.owner);
    const app = await registerOrgOAuthApp(team.ownerCtx, team.organisationId);

    await expectRefused(await member.ctx.get(APP_PATH(team.organisationId)), 403, 'ORG_007', 'a plain member of the organisation');
    await expectRefused(await outsiderCtx.get(APP_PATH(team.organisationId)), 403, 'ORG_001', 'somebody outside the organisation');
    expect(
      (await listApps(unelevated.ctx, team.organisationId)).map(item => item.applicationId),
      'reads need no step-up',
    ).toEqual([app.applicationId]);
    await expectRefused(
      await updateApp(unelevated.ctx, team.organisationId, app.applicationId, { displayName: 'E2E No Step Up' }),
      403,
      'AUTH_006',
      'a mutation without a step-up',
    );

    for (const [label, response] of [
      ['read', await neighbour.ownerCtx.get(`${APP_PATH(neighbour.organisationId)}/${app.applicationId}`)],
      ['update', await updateApp(neighbour.ownerCtx, neighbour.organisationId, app.applicationId, { displayName: 'E2E Stolen' })],
      ['rotate', await rotateSecret(neighbour.ownerCtx, neighbour.organisationId, app.applicationId)],
      ['delete', await identityMutate(neighbour.ownerCtx, 'delete', `${APP_PATH(neighbour.organisationId)}/${app.applicationId}`)],
    ] as const) {
      await expectRefused(response, 404, 'APP_001', `${label} across organisations`);
    }

    const renamed = await updateApp(team.ownerCtx, team.organisationId, app.applicationId, { displayName: 'E2E Renamed App' });
    expect(renamed.status(), 'its own elevated admin still administers it').toBe(200);
    expect((await appDetail(team.ownerCtx, team.organisationId, app.applicationId)).displayName).toBe('E2E Renamed App');
  });

  test('should register a restricted org-owned app with an authorization-code client and refuse a personal workspace, a suspended org and an eleventh app', async ({
    identity,
  }) => {
    const team = await identity.createTeam({ label: 'orgoauth-register' });
    const personal = await identityMutate(team.ownerCtx, 'post', `/api/v1/organisations/${team.owner.personalOrgId}/oauth-apps`, {
      displayName: 'E2E Personal App',
      kind: 'WEB_CONFIDENTIAL',
      redirectUris: [OAUTH_REDIRECT_URI],
    });
    await expectRefused(personal, 409, 'ORG_003', 'a personal workspace owns no applications');

    const app = await registerOrgOAuthApp(team.ownerCtx, team.organisationId, { displayName: 'E2E Register Me' });
    expect(app.secret, 'a confidential client is handed its secret once').toEqual(expect.any(String));
    expect(await applicationRow(app.applicationId)).toEqual({ visibility: 'RESTRICTED', ownerOrganisationId: team.organisationId });
    expect(await clientRow(app.clientId)).toEqual({
      kind: 'WEB_CONFIDENTIAL',
      isFirstParty: false,
      authMethod: 'client_secret_basic',
      grantTypes: ['authorization_code'],
      organisationId: team.organisationId,
    });
    const offline = await registerOrgOAuthApp(team.ownerCtx, team.organisationId, { displayName: 'E2E Offline App', offlineAccess: true });
    expect((await clientRow(offline.clientId))?.grantTypes, 'offline access adds the refresh grant and nothing else').toEqual(['authorization_code', 'refresh_token']);
    expect((await auditChain(team.organisationId)).filter(row => row.action === 'org.oauth_app.registered').map(row => row.targetId)).toEqual([
      String(app.applicationId),
      String(offline.applicationId),
    ]);

    await updateOrganisation(team.organisationId, { status: 'SUSPENDED' });
    await expectRefused(await registerApp(team.ownerCtx, team.organisationId, { displayName: 'E2E Suspended App' }), 404, 'ORG_002', 'a suspended organisation');
    await updateOrganisation(team.organisationId, { status: 'ACTIVE' });
    const reinstated = await registerApp(team.ownerCtx, team.organisationId, { displayName: 'E2E Reinstated App' });
    expect(reinstated.status(), 'a reinstated organisation registers again').toBe(201);

    seededApplications.push(...(await seedOwnedApplications(team.organisationId, 7)));
    await expectRefused(await registerApp(team.ownerCtx, team.organisationId, { displayName: 'E2E Eleventh App' }), 409, 'APP_011', 'the eleventh application of an organisation');
  });

  test('should derive the client id from the organisation and display name, disambiguate a collision and free the id on delete', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'orgoauth-naming' });
    const displayName = 'Shared Name';

    const first = await registerOrgOAuthApp(team.ownerCtx, team.organisationId, { displayName });
    expect(first.clientId).toBe(`org-${team.organisationId}-shared-name`);
    const second = await registerOrgOAuthApp(team.ownerCtx, team.organisationId, { displayName });
    expect(second.clientId, 'a colliding name is numbered').toBe(`org-${team.organisationId}-shared-name-2`);
    const unslugged = await registerOrgOAuthApp(team.ownerCtx, team.organisationId, { displayName: '###' });
    expect(unslugged.clientId, 'a display name with nothing to slug falls back').toBe(`org-${team.organisationId}-app`);

    const deleted = await identityMutate(team.ownerCtx, 'delete', `${APP_PATH(team.organisationId)}/${first.applicationId}`);
    expect(deleted.status(), await deleted.text()).toBe(200);
    expect(await clientRow(first.clientId), 'the client goes with the application').toBeUndefined();
    expect(await applicationRow(first.applicationId)).toBeUndefined();

    const reused = await registerOrgOAuthApp(team.ownerCtx, team.organisationId, { displayName });
    expect(reused.clientId, 'the freed id is handed out again').toBe(`org-${team.organisationId}-shared-name`);
  });
});

test.describe('identity organisation OAuth apps — URLs, scopes and secrets', () => {
  test('should refuse every unsafe redirect URI and keep the stored set intact after a bad patch', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'orgoauth-uris' });
    const refused = [
      'http://app.example.test/cb',
      'http://localhost/cb',
      'https://*.example.test/cb',
      'https://user:pass@app.example.test/cb',
      'https://app.example.test/cb#fragment',
      'javascript:alert(1)',
      'app.example.test/cb',
      'myapp://callback',
    ];

    for (const uri of refused) {
      await expectRefused(await registerWebApp(team.ownerCtx, team.organisationId, [uri]), 400, 'APP_012', `confidential client redirecting to ${uri}`);
    }
    const tooMany = Array.from({ length: 11 }, (_, index) => `https://app.example.test/cb-${index}`);
    expect((await registerWebApp(team.ownerCtx, team.organisationId, [])).status(), 'no redirect URI at all').toBe(422);
    expect((await registerWebApp(team.ownerCtx, team.organisationId, tooMany)).status(), 'more than ten redirect URIs').toBe(422);
    expect(await listApps(team.ownerCtx, team.organisationId), 'no refused registration left an application behind').toEqual([]);

    const native = await registerWebApp(team.ownerCtx, team.organisationId, ['myapp://callback', 'http://127.0.0.1:8080/cb'], { kind: 'NATIVE_PUBLIC' });
    expect(native.status(), 'a native client may use a custom scheme and loopback').toBe(201);
    const spa = await registerWebApp(team.ownerCtx, team.organisationId, ['http://localhost:3000/cb', OAUTH_REDIRECT_URI], { kind: 'SPA_PUBLIC' });
    expect(spa.status(), 'a browser client may use loopback and https').toBe(201);
    await expectRefused(
      await registerWebApp(team.ownerCtx, team.organisationId, ['myapp://callback'], { kind: 'SPA_PUBLIC' }),
      400,
      'APP_012',
      'a custom scheme on a browser client',
    );

    const app = await registerOrgOAuthApp(team.ownerCtx, team.organisationId, { displayName: 'E2E Patch URIs' });
    await expectRefused(await updateApp(team.ownerCtx, team.organisationId, app.applicationId, { redirectUris: ['http://app.example.test/cb'] }), 400, 'APP_012', 'a bad patch');
    expect((await appDetail(team.ownerCtx, team.organisationId, app.applicationId)).redirectUris, 'a refused patch changes nothing').toEqual([OAUTH_REDIRECT_URI]);
    const patched = await updateApp(team.ownerCtx, team.organisationId, app.applicationId, { redirectUris: [OAUTH_REDIRECT_URI, HTTPS_URI] });
    expect(patched.status(), await patched.text()).toBe(200);
    expect((await appDetail(team.ownerCtx, team.organisationId, app.applicationId)).redirectUris.sort()).toEqual([OAUTH_REDIRECT_URI, HTTPS_URI].sort());
  });

  test('should accept only https for the home page and logo, on registration and on patch', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'orgoauth-urls' });

    for (const url of ['javascript:alert(1)', 'data:text/html,<p>x</p>', 'http://app.example.test']) {
      await expectRefused(await registerApp(team.ownerCtx, team.organisationId, { displayName: 'E2E Home', homePageUrl: url }), 400, 'APP_012', `homePageUrl ${url}`);
      await expectRefused(await registerApp(team.ownerCtx, team.organisationId, { displayName: 'E2E Logo', logoUrl: url }), 400, 'APP_012', `logoUrl ${url}`);
    }
    expect(await listApps(team.ownerCtx, team.organisationId), 'nothing was stored for a refused registration').toEqual([]);

    const created = await registerApp(team.ownerCtx, team.organisationId, {
      displayName: 'E2E Branded',
      homePageUrl: 'https://app.example.test',
      logoUrl: 'https://app.example.test/logo.png',
    });
    expect(created.status(), await created.text()).toBe(201);
    const applicationId = ((await created.json()) as { applicationId: number }).applicationId;
    expect(await appDetail(team.ownerCtx, team.organisationId, applicationId)).toMatchObject({
      homePageUrl: 'https://app.example.test',
      logoUrl: 'https://app.example.test/logo.png',
    });

    await expectRefused(await updateApp(team.ownerCtx, team.organisationId, applicationId, { logoUrl: 'http://app.example.test/logo.png' }), 400, 'APP_012', 'a plain-http patch');
    expect((await appDetail(team.ownerCtx, team.organisationId, applicationId)).logoUrl, 'the refused patch stored nothing').toBe('https://app.example.test/logo.png');
  });

  test('should offer only non-sensitive user scopes of reachable platform applications and grant nothing outside the catalog', async ({ identity }) => {
    const admin = (await identity.admin()).ctx;
    const team = await identity.createTeam({ label: 'orgoauth-scopes' });
    const platform = await identity.createOAuthApp('orgoauth-scopes');
    await updateApplication(admin, platform.applicationId, { displayName: 'E2E Scope Lender' });
    const suffix = randomBytes(3).toString('hex');
    const offered = await createResourceScope(admin, platform.audience, `e2e.orgapp.read.${suffix}`, { principalType: 'USER' });
    const sensitive = await createResourceScope(admin, platform.audience, `e2e.orgapp.sensitive.${suffix}`, { principalType: 'USER', isSensitive: true });
    const serviceOnly = await createResourceScope(admin, platform.audience, `e2e.orgapp.service.${suffix}`, { principalType: 'SERVICE' });
    const dormant = await identity.createOAuthApp('orgoauth-dormant');
    const dormantScope = await createResourceScope(admin, dormant.audience, `e2e.orgapp.dormant.${suffix}`, { principalType: 'USER' });
    await identityDb()`UPDATE api_resources SET is_active = false WHERE identifier = ${dormant.audience}`;
    const app = await registerOrgOAuthApp(team.ownerCtx, team.organisationId);
    const ownScope = await seedApplicationScope(app.applicationId, `e2e.orgapp.own.${suffix}`);

    const catalog = await scopeCatalog(team.ownerCtx, team.organisationId);
    expect(catalog.find(scope => scope.scopeId === offered)).toMatchObject({
      name: `e2e.orgapp.read.${suffix}`,
      resourceIdentifier: platform.audience,
      applicationDisplayName: 'E2E Scope Lender',
    });
    expect(catalog.map(scope => scope.scopeId)).not.toContain(sensitive);
    expect(catalog.map(scope => scope.scopeId)).not.toContain(serviceOnly);
    expect(
      catalog.map(scope => scope.scopeId),
      'a scope of a deactivated resource is not offerable',
    ).not.toContain(dormantScope);
    expect(
      catalog.map(scope => scope.scopeId),
      'an organisation-owned application never lends its own scopes',
    ).not.toContain(ownScope);

    for (const [label, scopeId] of [
      ['sensitive', sensitive],
      ['service-only', serviceOnly],
      ['inactive-resource', dormantScope],
      ['organisation-owned', ownScope],
    ] as const) {
      await expectRefused(await grantScope(team.ownerCtx, team.organisationId, app.applicationId, scopeId), 400, 'APP_010', `granting a ${label} scope`);
    }

    const granted = await grantScope(team.ownerCtx, team.organisationId, app.applicationId, offered);
    expect(granted.status(), await granted.text()).toBe(200);
    expect((await appDetail(team.ownerCtx, team.organisationId, app.applicationId)).scopes).toContain(`e2e.orgapp.read.${suffix}`);
    const revoked = await identityMutate(team.ownerCtx, 'delete', `${APP_PATH(team.organisationId)}/${app.applicationId}/scopes/${offered}`);
    expect(revoked.status(), await revoked.text()).toBe(200);
    expect((await appDetail(team.ownerCtx, team.organisationId, app.applicationId)).scopes).not.toContain(`e2e.orgapp.read.${suffix}`);
  });

  test('should hand out a client secret once, rotate it with an overlap and refuse a public client a secret at all', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'orgoauth-secrets' });
    const confidential = await registerOrgOAuthApp(team.ownerCtx, team.organisationId, { displayName: 'E2E Secret App' });
    const publicApp = await registerOrgOAuthApp(team.ownerCtx, team.organisationId, { displayName: 'E2E Public App', kind: 'SPA_PUBLIC' });
    const secret = confidential.secret ?? '';
    expect(secret).toMatch(/\S{16,}/);

    const listed = await (await team.ownerCtx.get(APP_PATH(team.organisationId))).text();
    const detail = await (await team.ownerCtx.get(`${APP_PATH(team.organisationId)}/${confidential.applicationId}`)).text();
    expect(listed, 'the list never carries a secret').not.toContain(secret);
    expect(detail, 'neither does the detail').not.toContain(secret);
    expect(publicApp.secret, 'a public client is issued none').toBeUndefined();
    expect((await clientRow(publicApp.clientId))?.authMethod).toBe('none');

    const rotated = await rotateSecret(team.ownerCtx, team.organisationId, confidential.applicationId);
    expect(rotated.status(), await rotated.text()).toBe(200);
    const body = (await rotated.json()) as { secret: string; previousSecretsExpireAt: string };
    expect(body.secret).not.toBe(secret);
    expect(new Date(body.previousSecretsExpireAt).getTime(), 'the superseded secret keeps working for a while').toBeGreaterThan(Date.now());
    expect(await (await team.ownerCtx.get(`${APP_PATH(team.organisationId)}/${confidential.applicationId}`)).text()).not.toContain(body.secret);
    await expectRefused(await rotateSecret(team.ownerCtx, team.organisationId, publicApp.applicationId), 400, 'APP_013', 'rotating a public client');
  });
});
