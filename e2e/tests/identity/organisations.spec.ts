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
  assignApplicationRole,
  changeChallenge,
  createApplicationRole,
  createAuthzApi,
  expireOrganisationInvitation,
  identityMutate,
  type IdentityUser,
  issueTokens,
  markOrganisationDomainVerified,
  type OAuthTestClient,
  type OrganisationRole,
  rateLimitKey,
  readOrganisationDomain,
  readRateLimit,
  redisDel,
  registerInit,
  registerOAuthClient,
  releaseApplication,
  relyingPartyClient,
  spendRateLimit,
  startLogin,
  stepUp,
  unresolvableDomain,
  updateOrganisationMember,
  verifyChallenge,
} from '../../lib';
import { expect, type IdentityHarness, type IdentityTeam, test } from './fixtures';
import { countOutboxRows, expectErrorCode, expectSessionCookie, flowStepOf, pollInviteToken, pollOtp } from './helpers';

/**
 * Defining types
 */

interface MemberItem {
  userId: string;
  role: string;
  status: string;
  statusReason?: string;
  statusUntil?: string;
  email?: string;
}

interface MyOrganisationItem {
  id: string;
  type: string;
  role: string;
}

interface InvitationItem {
  id: string;
  email: string;
  role: string;
}

interface DomainItem {
  id: string;
  domain: string;
  status: string;
  txtRecordName: string;
  txtRecordValue: string;
  lastCheckError?: string;
}

interface PolicyItem {
  key: string;
  type: string;
  defaultValue?: number;
  effectiveValue?: number;
  configuredValue?: number;
  defaultEnabled?: boolean;
  effectiveEnabled?: boolean;
  configuredEnabled?: boolean;
}

/**
 * Declaring the constants
 *
 * Team organisations as their members drive them: creation, roles and ownership, member holds, invitations, domain ownership
 * challenges and the per-organisation policies that shorten a token's life. Organisations and memberships come from the factory,
 * every role-changing call goes through the API under test, and the states no API reaches — a lapsed suspension, an expired
 * invitation, a VERIFIED domain — are written straight to the database. Each test runs on its own client address and builds
 * its own organisations, so nothing it does is visible to another.
 */

const ACCESS_TOKEN_TTL = 'auth.access_token.ttl';
const EMAIL_OTP_FALLBACK = 'mfa.email_otp_fallback.enabled';
const REGISTER_OTP_TEMPLATE = 'auth.register.otp';
const LOGIN_OTP_TEMPLATE = 'auth.login.otp';
const STRONG_PASSWORD = 'E2eOrg#Passw0rd!';
const DAY_MS = 24 * 60 * 60 * 1000;
/** The per-organisation invitation budget (`InvitationService.INVITE_BUDGET`): 20 an hour, so the 21st is refused. */
const INVITE_BUDGET = { bucket: 'org-invite', limit: 20, windowSeconds: 3_600 };

function uniqueSlug(label: string): string {
  return `e2e-${label}-${randomBytes(4).toString('hex')}`;
}

async function expectRefused(response: APIResponse, status: number, code: string, message?: string): Promise<void> {
  expect(response.status(), message ?? (await response.text())).toBe(status);
  await expectErrorCode(response, code);
}

async function members(ctx: APIRequestContext, organisationId: string): Promise<MemberItem[]> {
  const response = await ctx.get(`/api/v1/organisations/${organisationId}/members`);
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as { members: MemberItem[] }).members;
}

async function myOrganisations(ctx: APIRequestContext): Promise<MyOrganisationItem[]> {
  const response = await ctx.get('/api/v1/me/organisations');
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as { organisations: MyOrganisationItem[] }).organisations;
}

function setRole(ctx: APIRequestContext, organisationId: string, userId: string, role: string): Promise<APIResponse> {
  return identityMutate(ctx, 'patch', `/api/v1/organisations/${organisationId}/members/${userId}`, { role });
}

function setStatus(ctx: APIRequestContext, organisationId: string, userId: string, body: Record<string, unknown>): Promise<APIResponse> {
  return identityMutate(ctx, 'patch', `/api/v1/organisations/${organisationId}/members/${userId}/status`, body);
}

function removeMember(ctx: APIRequestContext, organisationId: string, userId: string): Promise<APIResponse> {
  return identityMutate(ctx, 'delete', `/api/v1/organisations/${organisationId}/members/${userId}`);
}

function invite(ctx: APIRequestContext, organisationId: string, email: string, role = 'MEMBER'): Promise<APIResponse> {
  return identityMutate(ctx, 'post', `/api/v1/organisations/${organisationId}/invitations`, { email, role });
}

function acceptInvitation(ctx: APIRequestContext, token: string): Promise<APIResponse> {
  return identityMutate(ctx, 'post', '/api/v1/me/invitations/accept', { token });
}

async function pendingInvitations(ctx: APIRequestContext, organisationId: string): Promise<InvitationItem[]> {
  const response = await ctx.get(`/api/v1/organisations/${organisationId}/invitations`);
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as { invitations: InvitationItem[] }).invitations;
}

function registerDomain(ctx: APIRequestContext, organisationId: string, domain: string): Promise<APIResponse> {
  return identityMutate(ctx, 'post', `/api/v1/organisations/${organisationId}/domains`, { domain });
}

function verifyDomain(ctx: APIRequestContext, organisationId: string, domainId: string): Promise<APIResponse> {
  return identityMutate(ctx, 'post', `/api/v1/organisations/${organisationId}/domains/${domainId}/verify`);
}

async function domains(ctx: APIRequestContext, organisationId: string): Promise<DomainItem[]> {
  const response = await ctx.get(`/api/v1/organisations/${organisationId}/domains`);
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as { domains: DomainItem[] }).domains;
}

async function policy(ctx: APIRequestContext, organisationId: string, key: string): Promise<PolicyItem> {
  const response = await ctx.get(`/api/v1/organisations/${organisationId}/policies`);
  expect(response.status(), await response.text()).toBe(200);
  const item = ((await response.json()) as { policies: PolicyItem[] }).policies.find(entry => entry.key === key);
  expect(item, `policy ${key} is listed`).toBeDefined();
  return item as PolicyItem;
}

function setPolicy(ctx: APIRequestContext, organisationId: string, key: string, body: Record<string, unknown>): Promise<APIResponse> {
  return identityMutate(ctx, 'put', `/api/v1/organisations/${organisationId}/policies/${key}`, body);
}

function clearPolicy(ctx: APIRequestContext, organisationId: string, key: string): Promise<APIResponse> {
  return identityMutate(ctx, 'delete', `/api/v1/organisations/${organisationId}/policies/${key}`);
}

/** A member of `team` on a session at the requested assurance; AAL2 carries the self-service step-up, so a refusal is about the role alone. */
async function teamMember(
  identity: IdentityHarness,
  team: IdentityTeam,
  label: string,
  role: OrganisationRole,
  aal: 'AAL1' | 'AAL2' = 'AAL2',
): Promise<{ user: IdentityUser; ctx: APIRequestContext }> {
  const user = await identity.createUser({ label });
  await addOrganisationMember(team.organisationId, user.userId, { role });
  const { ctx } = await identity.signIn(user, { aal });
  return { user, ctx };
}

/** A first-party client on a RESTRICTED application released to `team` alone, so every token it mints resolves that organisation as the user's. */
async function teamOnlyClient(identity: IdentityHarness, team: IdentityTeam, label: string, accessTokenTtl?: number): Promise<OAuthTestClient> {
  const application = await identity.createOAuthApp(label, { visibility: 'RESTRICTED' });
  await releaseApplication((await identity.admin()).ctx, application.applicationId, team.organisationId);
  return registerOAuthClient((await identity.admin()).ctx, application, accessTokenTtl ? { accessTokenTtl } : {});
}

async function tokenLifetime(ctx: APIRequestContext, tokenCtx: APIRequestContext, client: OAuthTestClient): Promise<number | undefined> {
  return (await issueTokens(ctx, tokenCtx, client)).body.expires_in;
}

test.describe('identity organisations — roles and ownership', () => {
  test('should seat the creator as the only owner and refuse a duplicate slug', async ({ identity }) => {
    const user = await identity.createUser({ label: 'org-create' });
    const { ctx } = await identity.signIn(user);
    const slug = uniqueSlug('create');

    const created = await identityMutate(ctx, 'post', '/api/v1/organisations', { name: 'E2E Created Team', slug });
    expect(created.status(), await created.text()).toBe(201);
    const organisation = (await created.json()) as { id: string; slug: string; name: string; type: string; status: string };
    identity.trackOrganisation(organisation.id, user.userId);
    expect(organisation).toMatchObject({ slug, name: 'E2E Created Team', type: 'TEAM', status: 'ACTIVE' });
    expect(await members(ctx, organisation.id)).toEqual([expect.objectContaining({ userId: user.userId, role: 'OWNER', status: 'ACTIVE' })]);

    const duplicate = await identityMutate(ctx, 'post', '/api/v1/organisations', { name: 'E2E Duplicate Slug', slug });
    await expectRefused(duplicate, 409, 'ORG_006', 'a taken slug is refused');
  });

  test('should answer a non-member identically for an organisation that exists and one that does not', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'org-oracle' });
    const outsider = await identity.createUser({ label: 'org-oracle-outsider' });
    const { ctx } = await identity.signIn(outsider, { aal: 'AAL2' });
    const absent = `${BigInt(team.organisationId) + 10_000_000n}`;

    const existing = await ctx.get(`/api/v1/organisations/${team.organisationId}`);
    const missing = await ctx.get(`/api/v1/organisations/${absent}`);
    expect(existing.status(), 'a real organisation a stranger is not in').toBe(403);
    expect(missing.status(), 'an organisation that does not exist').toBe(existing.status());
    await expectErrorCode(existing, 'ORG_001');
    await expectErrorCode(missing, 'ORG_001');
  });

  test('should let an admin rename and promote to admin, and reserve owner promotion to an elevated owner', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'org-roles' });
    const admin = await teamMember(identity, team, 'org-roles-admin', 'ADMIN');
    const plain = await teamMember(identity, team, 'org-roles-member', 'MEMBER');

    const renamed = await identityMutate(admin.ctx, 'patch', `/api/v1/organisations/${team.organisationId}`, { name: 'E2E Renamed By Admin' });
    expect(renamed.status(), await renamed.text()).toBe(200);
    expect((await renamed.json()) as { name: string }).toMatchObject({ name: 'E2E Renamed By Admin' });
    await expectRefused(await identityMutate(plain.ctx, 'patch', `/api/v1/organisations/${team.organisationId}`, { name: 'E2E Renamed By Member' }), 403, 'ORG_007');

    const promoted = await setRole(admin.ctx, team.organisationId, plain.user.userId, 'ADMIN');
    expect(promoted.status(), 'an admin may promote a member to admin').toBe(200);
    await expectRefused(await setRole(admin.ctx, team.organisationId, plain.user.userId, 'OWNER'), 403, 'ORG_007', 'an admin may not hand out ownership');

    const handedOver = await setRole(team.ownerCtx, team.organisationId, plain.user.userId, 'OWNER');
    expect(handedOver.status(), 'an elevated owner may hand out ownership').toBe(200);
    expect((await members(team.ownerCtx, team.organisationId)).filter(member => member.role === 'OWNER').map(member => member.userId)).toEqual(
      expect.arrayContaining([team.owner.userId, plain.user.userId]),
    );
  });

  test('should refuse owner operations to an app-scoped step-up and admit them after a console step-up', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'org-intent' });
    const second = await teamMember(identity, team, 'org-intent-owner', 'OWNER');
    const plain = await teamMember(identity, team, 'org-intent-member', 'MEMBER');
    const application = await identity.createOAuthApp('org-intent', { withPublicUrl: true });
    const owner = await identity.signIn(team.owner);

    const claimed = await stepUp(owner.ctx, { password: team.owner.password, clientId: relyingPartyClient(application).clientId });
    expect(claimed.status(), await claimed.text()).toBe(200);

    await expectRefused(await setRole(owner.ctx, team.organisationId, plain.user.userId, 'OWNER'), 403, 'AUTH_006', 'promotion to owner');
    await expectRefused(await setRole(owner.ctx, team.organisationId, second.user.userId, 'MEMBER'), 403, 'AUTH_006', 'demoting an owner');
    await expectRefused(await removeMember(owner.ctx, team.organisationId, second.user.userId), 403, 'AUTH_006', 'removing an owner');

    const selfService = await stepUp(owner.ctx, { password: team.owner.password });
    expect(selfService.status(), await selfService.text()).toBe(200);
    const demoted = await setRole(owner.ctx, team.organisationId, second.user.userId, 'MEMBER');
    expect(demoted.status(), 'a console step-up opens the same operation').toBe(200);
  });

  test('should keep the last owner against demotion and departure', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'org-last-owner' });
    await teamMember(identity, team, 'org-last-owner-admin', 'ADMIN');

    await expectRefused(await setRole(team.ownerCtx, team.organisationId, team.owner.userId, 'MEMBER'), 409, 'ORG_004', 'the only owner may not be demoted');
    await expectRefused(await identityMutate(team.ownerCtx, 'delete', `/api/v1/me/organisations/${team.organisationId}`), 409, 'ORG_004', 'the only owner may not leave');
    expect((await members(team.ownerCtx, team.organisationId)).find(member => member.userId === team.owner.userId)?.role).toBe('OWNER');
  });

  test('should drop a removed member from the list, deny their organisation grants and refuse an admin removing an owner', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'org-remove' });
    const admin = await teamMember(identity, team, 'org-remove-admin', 'ADMIN');
    const target = await teamMember(identity, team, 'org-remove-target', 'MEMBER');
    const application = await identity.createOAuthApp('org-remove');
    const role = await createApplicationRole(application.applicationId, { label: 'OrgRemove', permissions: ['e2e:org:read'] });
    await assignApplicationRole({ type: 'USER', id: target.user.userId }, role.roleId, team.organisationId);
    const authz = await createAuthzApi((await identity.admin()).ctx, await identity.anonymous(), application);
    const decision = { principalType: 'USER' as const, principalId: target.user.userId, organisationId: team.organisationId, action: 'e2e:org:read' };

    expect((await authz.decide(decision)).decision, 'the assignment grants the permission').toBe('PERMIT');
    await expectRefused(await removeMember(admin.ctx, team.organisationId, team.owner.userId), 403, 'ORG_007', 'an admin may not remove an owner');

    const removed = await removeMember(admin.ctx, team.organisationId, target.user.userId);
    expect(removed.status(), await removed.text()).toBe(200);
    expect((await members(admin.ctx, team.organisationId)).map(member => member.userId)).not.toContain(target.user.userId);
    expect((await authz.decide(decision)).decision, 'removal revokes the organisation-scoped grant').toBe('DENY');
  });

  test('should refuse membership operations on a personal workspace and drop a left organisation from the caller list', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'org-leave' });
    const member = await teamMember(identity, team, 'org-leave-member', 'MEMBER');

    await expectRefused(await setRole(member.ctx, member.user.personalOrgId, member.user.userId, 'ADMIN'), 409, 'ORG_003', 'role change on a personal workspace');
    await expectRefused(await invite(member.ctx, member.user.personalOrgId, 'e2e.personal.invite@shadow-apps.test'), 409, 'ORG_003', 'invite into a personal workspace');
    await expectRefused(await identityMutate(member.ctx, 'delete', `/api/v1/me/organisations/${member.user.personalOrgId}`), 409, 'ORG_003', 'leaving a personal workspace');

    expect(await myOrganisations(member.ctx)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: member.user.personalOrgId, type: 'PERSONAL', role: 'OWNER' }),
        expect.objectContaining({ id: team.organisationId, type: 'TEAM', role: 'MEMBER' }),
      ]),
    );

    const left = await identityMutate(member.ctx, 'delete', `/api/v1/me/organisations/${team.organisationId}`);
    expect(left.status(), await left.text()).toBe(200);
    expect((await myOrganisations(member.ctx)).map(organisation => organisation.id)).not.toContain(team.organisationId);
  });

  test('should let only an elevated owner soft-delete the organisation and close it to its own owner', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'org-delete' });
    const admin = await teamMember(identity, team, 'org-delete-admin', 'ADMIN');
    const unelevated = await identity.signIn(team.owner);

    await expectRefused(await identityMutate(admin.ctx, 'delete', `/api/v1/organisations/${team.organisationId}`), 403, 'ORG_007', 'an elevated admin is still not an owner');
    await expectRefused(await identityMutate(unelevated.ctx, 'delete', `/api/v1/organisations/${team.organisationId}`), 403, 'AUTH_006', 'an owner without a step-up');

    const deleted = await identityMutate(team.ownerCtx, 'delete', `/api/v1/organisations/${team.organisationId}`);
    expect(deleted.status(), await deleted.text()).toBe(200);
    const afterwards = await team.ownerCtx.get(`/api/v1/organisations/${team.organisationId}`);
    await expectRefused(afterwards, 403, 'ORG_001', 'a deleted organisation is closed even to its owner');
    expect((await myOrganisations(team.ownerCtx)).map(organisation => organisation.id)).not.toContain(team.organisationId);
  });
});

test.describe('identity organisations — member holds', () => {
  test('should lock a suspended member out of the organisation alone and restore access on reinstatement and on lapse', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'org-hold' });
    const member = await teamMember(identity, team, 'org-hold-member', 'MEMBER');
    const until = new Date(Date.now() + DAY_MS);

    const suspended = await setStatus(team.ownerCtx, team.organisationId, member.user.userId, { status: 'SUSPENDED', reason: 'e2e hold', until: until.toISOString() });
    expect(suspended.status(), await suspended.text()).toBe(200);
    await expectRefused(await member.ctx.get(`/api/v1/organisations/${team.organisationId}/members`), 403, 'ORG_001', 'a suspended member is out of the organisation');
    expect((await member.ctx.get('/api/v1/me')).status(), 'the account itself is untouched').toBe(200);
    expect((await members(team.ownerCtx, team.organisationId)).find(entry => entry.userId === member.user.userId)).toMatchObject({
      status: 'SUSPENDED',
      statusReason: 'e2e hold',
      statusUntil: until.toISOString(),
    });

    const reinstated = await setStatus(team.ownerCtx, team.organisationId, member.user.userId, { status: 'ACTIVE' });
    expect(reinstated.status(), await reinstated.text()).toBe(200);
    expect((await member.ctx.get(`/api/v1/organisations/${team.organisationId}/members`)).status(), 'reinstatement restores access').toBe(200);

    const blocked = await setStatus(team.ownerCtx, team.organisationId, member.user.userId, { status: 'BLOCKED', reason: 'e2e block' });
    expect(blocked.status(), await blocked.text()).toBe(200);
    await expectRefused(await member.ctx.get(`/api/v1/organisations/${team.organisationId}/members`), 403, 'ORG_001', 'a blocked member is out too');
    expect(await setStatus(team.ownerCtx, team.organisationId, member.user.userId, { status: 'BLOCKED', until: until.toISOString() }).then(r => r.status())).toBe(422);

    await updateOrganisationMember(team.organisationId, member.user.userId, { status: 'SUSPENDED', statusUntil: new Date(Date.now() - 60_000) });
    expect((await member.ctx.get(`/api/v1/organisations/${team.organisationId}/members`)).status(), 'a lapsed suspension restores itself').toBe(200);
    expect((await members(team.ownerCtx, team.organisationId)).find(entry => entry.userId === member.user.userId)).toMatchObject({ status: 'ACTIVE' });
  });

  test('should refuse a hold on anyone of equal or higher rank and by anyone below admin', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'org-hold-rank' });
    const admin = await teamMember(identity, team, 'org-rank-admin', 'ADMIN');
    const peer = await teamMember(identity, team, 'org-rank-peer', 'ADMIN');
    const plain = await teamMember(identity, team, 'org-rank-member', 'MEMBER');
    const hold = { status: 'SUSPENDED', reason: 'e2e rank' };

    await expectRefused(await setStatus(admin.ctx, team.organisationId, team.owner.userId, hold), 403, 'ORG_007', 'an admin may not hold an owner');
    await expectRefused(await setStatus(admin.ctx, team.organisationId, peer.user.userId, hold), 403, 'ORG_007', 'an admin may not hold another admin');
    await expectRefused(await setStatus(team.ownerCtx, team.organisationId, team.owner.userId, hold), 403, 'ORG_007', 'an owner may not hold themselves');
    await expectRefused(await setStatus(plain.ctx, team.organisationId, peer.user.userId, hold), 403, 'ORG_007', 'a member may hold nobody');

    const held = await setStatus(admin.ctx, team.organisationId, plain.user.userId, hold);
    expect(held.status(), 'an admin still holds a plain member').toBe(200);
  });
});

test.describe('identity organisations — invitations', () => {
  test('should answer identically whether the invitee has an account and seat them on accept', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'org-invite' });
    const registered = await identity.createUser({ label: 'org-invite-known' });
    const strangerEmail = `e2e.invite.${randomBytes(4).toString('hex')}@shadow-apps.test`;

    const known = await invite(team.ownerCtx, team.organisationId, registered.email, 'ADMIN');
    const unknown = await invite(team.ownerCtx, team.organisationId, strangerEmail, 'ADMIN');
    expect(known.status(), await known.text()).toBe(200);
    expect(unknown.status()).toBe(known.status());
    expect(await unknown.json(), 'the body never varies with account existence').toEqual(await known.json());
    expect((await pendingInvitations(team.ownerCtx, team.organisationId)).map(item => item.email).sort()).toEqual([registered.email, strangerEmail].sort());

    const { ctx } = await identity.signIn(registered);
    const accepted = await acceptInvitation(ctx, await pollInviteToken(registered.email));
    expect(accepted.status(), await accepted.text()).toBe(200);
    expect(await accepted.json()).toMatchObject({ id: team.organisationId, name: team.name });
    expect((await members(team.ownerCtx, team.organisationId)).find(member => member.userId === registered.userId)).toMatchObject({ role: 'ADMIN', status: 'ACTIVE' });
    expect(
      (await pendingInvitations(team.ownerCtx, team.organisationId)).map(item => item.email),
      'an accepted invitation stops being pending',
    ).toEqual([strangerEmail]);
  });

  test('should resolve an invitation issued before the invitee had an account', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'org-invite-signup' });
    const email = `e2e.invite.signup.${randomBytes(4).toString('hex')}@shadow-apps.test`;
    identity.trackUserByEmail(email);
    const ctx = await identity.anonymous();

    const invited = await invite(team.ownerCtx, team.organisationId, email);
    expect(invited.status(), await invited.text()).toBe(200);
    const token = await pollInviteToken(email);

    const init = await registerInit(ctx, email);
    expect(init.status(), await init.text()).toBe(200);
    const flowId = ((await init.json()) as { flowId: string }).flowId;
    expect((await verifyChallenge(ctx, { flowId, code: await pollOtp(email, REGISTER_OTP_TEMPLATE) })).status()).toBe(200);
    expect((await ctx.post('/api/v1/auth/register/demographics', { data: { flowId } })).status()).toBe(200);
    expect((await ctx.post('/api/v1/auth/register/profile', { data: { flowId, firstName: 'Invited', lastName: 'Later' } })).status()).toBe(200);
    const completed = await ctx.post('/api/v1/auth/register/password', { data: { flowId, password: STRONG_PASSWORD } });
    expect(completed.status(), await completed.text()).toBe(200);
    expectSessionCookie(completed);

    const accepted = await acceptInvitation(ctx, token);
    expect(accepted.status(), 'the invitation outlives the signup it was waiting for').toBe(200);
    expect((await members(team.ownerCtx, team.organisationId)).map(member => member.email)).toContain(email);
  });

  test('should refuse an invitation the caller does not hold, an expired, revoked, superseded or declined one, and still accept a fresh one', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'org-invite-refuse' });
    const invitee = await identity.createUser({ label: 'org-invite-invitee' });
    const bystander = await identity.createUser({ label: 'org-invite-bystander' });
    const inviteeCtx = (await identity.signIn(invitee)).ctx;
    const bystanderCtx = (await identity.signIn(bystander)).ctx;
    const issue = async (): Promise<string> => {
      const response = await invite(team.ownerCtx, team.organisationId, invitee.email);
      expect(response.status(), await response.text()).toBe(200);
      return pollInviteToken(invitee.email);
    };

    const wrongAccount = await issue();
    await expectRefused(await acceptInvitation(bystanderCtx, wrongAccount), 404, 'ORG_005', 'an invitation is bound to its address');

    await expireOrganisationInvitation((await pendingInvitations(team.ownerCtx, team.organisationId))[0]?.id ?? '');
    await expectRefused(await acceptInvitation(inviteeCtx, wrongAccount), 404, 'ORG_005', 'an expired invitation');

    const revoked = await issue();
    const pending = await pendingInvitations(team.ownerCtx, team.organisationId);
    const revocation = await identityMutate(team.ownerCtx, 'delete', `/api/v1/organisations/${team.organisationId}/invitations/${pending[0]?.id}`);
    expect(revocation.status(), await revocation.text()).toBe(200);
    await expectRefused(await acceptInvitation(inviteeCtx, revoked), 404, 'ORG_005', 'a revoked invitation');

    const superseded = await issue();
    const reissued = await issue();
    await expectRefused(await acceptInvitation(inviteeCtx, superseded), 404, 'ORG_005', 're-inviting kills the previous token');

    const declined = await identityMutate(inviteeCtx, 'post', '/api/v1/me/invitations/decline', { token: reissued });
    expect(declined.status(), await declined.text()).toBe(200);
    await expectRefused(await acceptInvitation(inviteeCtx, reissued), 404, 'ORG_005', 'a declined invitation');

    const fresh = await issue();
    const accepted = await acceptInvitation(inviteeCtx, fresh);
    expect(accepted.status(), 'a fresh invitation still seats the invitee').toBe(200);
    expect((await members(team.ownerCtx, team.organisationId)).map(member => member.userId)).toContain(invitee.userId);
  });

  test('should refuse a plain member and cap invitations per organisation', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'org-invite-cap' });
    const other = await identity.createTeam({ label: 'org-invite-spare' });
    const member = await teamMember(identity, team, 'org-invite-member', 'MEMBER');
    const address = (): string => `e2e.invite.cap.${randomBytes(4).toString('hex')}@shadow-apps.test`;

    await expectRefused(await invite(member.ctx, team.organisationId, address()), 403, 'ORG_007', 'a plain member cannot invite');

    const first = await invite(team.ownerCtx, team.organisationId, address());
    expect(first.status(), await first.text()).toBe(200);
    expect(await readRateLimit(INVITE_BUDGET.bucket, team.organisationId), 'the budget is counted against the organisation, not the caller').toBe(1);

    await spendRateLimit(INVITE_BUDGET.bucket, team.organisationId, INVITE_BUDGET.limit, INVITE_BUDGET.windowSeconds);
    await expectRefused(await invite(team.ownerCtx, team.organisationId, address()), 429, 'RATE_LIMITED', 'the invitation past the budget');
    const neighbour = await invite(other.ownerCtx, other.organisationId, address());
    expect(neighbour.status(), 'another organisation keeps its own budget').toBe(200);
    await redisDel(rateLimitKey(INVITE_BUDGET.bucket, team.organisationId), rateLimitKey(INVITE_BUDGET.bucket, other.organisationId));
  });
});

test.describe('identity organisations — domains', () => {
  test('should register a domain as pending with its TXT challenge and refuse a malformed or duplicate one', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'org-domain' });
    const domain = unresolvableDomain('register');

    const registered = await registerDomain(team.ownerCtx, team.organisationId, domain);
    expect(registered.status(), await registered.text()).toBe(201);
    const body = (await registered.json()) as DomainItem;
    expect(body).toMatchObject({ domain, status: 'PENDING', txtRecordName: `_shadow-identity.${domain}` });
    expect(body.txtRecordValue).toMatch(/^shadow-identity-verification=[0-9a-f]{32}$/);
    expect(await domains(team.ownerCtx, team.organisationId)).toEqual([expect.objectContaining({ id: body.id, status: 'PENDING' })]);

    await expectRefused(await registerDomain(team.ownerCtx, team.organisationId, 'not a domain'), 400, 'ORG_008', 'a malformed domain');
    await expectRefused(await registerDomain(team.ownerCtx, team.organisationId, domain), 409, 'ORG_009', 'the same domain twice');
  });

  test('should fail verification for a name that does not resolve and keep a verified domain verified', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'org-domain-verify' });
    const pending = (await (await registerDomain(team.ownerCtx, team.organisationId, unresolvableDomain('pending'))).json()) as DomainItem;

    const failed = await verifyDomain(team.ownerCtx, team.organisationId, pending.id);
    expect(failed.status(), await failed.text()).toBe(200);
    expect((await failed.json()) as DomainItem).toMatchObject({ status: 'FAILED', lastCheckError: expect.stringContaining('ENOTFOUND') as unknown });
    expect(await readOrganisationDomain(pending.id)).toMatchObject({ status: 'FAILED', verifiedAt: null });

    const verified = (await (await registerDomain(team.ownerCtx, team.organisationId, unresolvableDomain('verified'))).json()) as DomainItem;
    await markOrganisationDomainVerified(verified.id);
    const rechecked = await verifyDomain(team.ownerCtx, team.organisationId, verified.id);
    expect(rechecked.status(), await rechecked.text()).toBe(200);
    expect((await rechecked.json()) as DomainItem).toMatchObject({ status: 'VERIFIED', lastCheckError: expect.stringContaining('ENOTFOUND') as unknown });
    expect(await readOrganisationDomain(verified.id), 'a failed re-check never strips a tenant of its domain').toMatchObject({ status: 'VERIFIED' });
  });

  test('should admit domain mutations only to an elevated admin and never through another organisation', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'org-domain-guard' });
    const neighbour = await identity.createTeam({ label: 'org-domain-neighbour' });
    const member = await teamMember(identity, team, 'org-domain-member', 'MEMBER');
    const unelevated = await identity.signIn(team.owner);
    const domain = unresolvableDomain('guard');

    await expectRefused(await registerDomain(member.ctx, team.organisationId, domain), 403, 'ORG_007', 'a member may not register a domain');
    await expectRefused(await registerDomain(unelevated.ctx, team.organisationId, domain), 403, 'AUTH_006', 'an owner without a step-up may not either');

    const registered = (await (await registerDomain(team.ownerCtx, team.organisationId, domain)).json()) as DomainItem;
    expect(
      (await domains(member.ctx, team.organisationId)).map(item => item.id),
      'a member still reads the list',
    ).toEqual([registered.id]);

    const foreign = await identityMutate(neighbour.ownerCtx, 'delete', `/api/v1/organisations/${neighbour.organisationId}/domains/${registered.id}`);
    await expectRefused(foreign, 404, 'ORG_010', "another organisation's domain is not reachable through its own path");
    expect(await readOrganisationDomain(registered.id), 'the domain survives the foreign delete').toBeDefined();

    const removed = await identityMutate(team.ownerCtx, 'delete', `/api/v1/organisations/${team.organisationId}/domains/${registered.id}`);
    expect(removed.status(), 'its own elevated admin still removes it').toBe(200);
    expect(await readOrganisationDomain(registered.id)).toBeUndefined();
  });
});

test.describe('identity organisations — policies', () => {
  test('should apply an override below the default, clamp one above it, fold in the client value and restore the default when cleared', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'org-policy' });
    const member = await teamMember(identity, team, 'org-policy-member', 'MEMBER', 'AAL1');
    const tokenCtx = await identity.anonymous();
    const plain = await teamOnlyClient(identity, team, 'policy-plain');
    const capped = await teamOnlyClient(identity, team, 'policy-capped', 1_200);

    expect(await policy(team.ownerCtx, team.organisationId, ACCESS_TOKEN_TTL)).toMatchObject({ type: 'integer', defaultValue: 3_600, effectiveValue: 3_600 });
    expect(await policy(team.ownerCtx, team.organisationId, ACCESS_TOKEN_TTL)).not.toHaveProperty('configuredValue');
    expect(await tokenLifetime(member.ctx, tokenCtx, plain), 'the platform default').toBe(3_600);
    expect(await tokenLifetime(member.ctx, tokenCtx, capped), 'a shorter client lifetime wins on its own').toBe(1_200);

    expect((await setPolicy(team.ownerCtx, team.organisationId, ACCESS_TOKEN_TTL, { value: 300 })).status()).toBe(200);
    expect(await policy(team.ownerCtx, team.organisationId, ACCESS_TOKEN_TTL)).toMatchObject({ configuredValue: 300, effectiveValue: 300 });
    expect(await tokenLifetime(member.ctx, tokenCtx, plain), 'an override below the default applies').toBe(300);
    expect(await tokenLifetime(member.ctx, tokenCtx, capped), 'and is stricter than the client value').toBe(300);

    expect((await setPolicy(team.ownerCtx, team.organisationId, ACCESS_TOKEN_TTL, { value: 7_200 })).status()).toBe(200);
    expect(await policy(team.ownerCtx, team.organisationId, ACCESS_TOKEN_TTL)).toMatchObject({ configuredValue: 7_200, effectiveValue: 3_600 });
    expect(await tokenLifetime(member.ctx, tokenCtx, plain), 'an organisation may tighten a lifetime, never extend it').toBe(3_600);
    expect(await tokenLifetime(member.ctx, tokenCtx, capped), 'the client value still caps it').toBe(1_200);

    expect((await clearPolicy(team.ownerCtx, team.organisationId, ACCESS_TOKEN_TTL)).status()).toBe(200);
    expect(await policy(team.ownerCtx, team.organisationId, ACCESS_TOKEN_TTL)).not.toHaveProperty('configuredValue');
    expect(await tokenLifetime(member.ctx, tokenCtx, plain), 'clearing restores the default').toBe(3_600);
  });

  test('should reject an unknown key, an out-of-range or fractional value and the wrong wire field', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'org-policy-refuse' });

    expect((await setPolicy(team.ownerCtx, team.organisationId, 'auth.made_up.ttl', { value: 300 })).status(), 'an unknown key never reaches the registry').toBe(422);
    await expectRefused(await setPolicy(team.ownerCtx, team.organisationId, ACCESS_TOKEN_TTL, { value: 59 }), 400, 'POL_002', 'below the minimum');
    await expectRefused(await setPolicy(team.ownerCtx, team.organisationId, ACCESS_TOKEN_TTL, { value: 86_401 }), 400, 'POL_002', 'above the maximum');
    await expectRefused(await setPolicy(team.ownerCtx, team.organisationId, ACCESS_TOKEN_TTL, { value: 300.5 }), 400, 'POL_002', 'a fractional duration');
    await expectRefused(await setPolicy(team.ownerCtx, team.organisationId, ACCESS_TOKEN_TTL, { enabled: true }), 400, 'POL_002', 'a switch sent for a duration');
    await expectRefused(await setPolicy(team.ownerCtx, team.organisationId, EMAIL_OTP_FALLBACK, { value: 1 }), 400, 'POL_002', 'a duration sent for a switch');
    expect(await policy(team.ownerCtx, team.organisationId, ACCESS_TOKEN_TTL), 'nothing was stored').not.toHaveProperty('configuredValue');
  });

  test('should round-trip a boolean policy as enabled flags alone', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'org-policy-boolean' });

    const initial = await policy(team.ownerCtx, team.organisationId, EMAIL_OTP_FALLBACK);
    expect(initial).toMatchObject({ type: 'boolean', defaultEnabled: true, effectiveEnabled: true });
    expect(initial).not.toHaveProperty('configuredEnabled');
    expect(initial).not.toHaveProperty('effectiveValue');

    expect((await setPolicy(team.ownerCtx, team.organisationId, EMAIL_OTP_FALLBACK, { enabled: false })).status()).toBe(200);
    expect(await policy(team.ownerCtx, team.organisationId, EMAIL_OTP_FALLBACK)).toMatchObject({ defaultEnabled: true, effectiveEnabled: false, configuredEnabled: false });

    expect((await clearPolicy(team.ownerCtx, team.organisationId, EMAIL_OTP_FALLBACK)).status()).toBe(200);
    expect(await policy(team.ownerCtx, team.organisationId, EMAIL_OTP_FALLBACK)).not.toHaveProperty('configuredEnabled');
  });

  // `mfa.email_otp_fallback.enabled` (policy.registry.ts:87) is resolved only to render itself (policy.service.ts:100); no enforcement path reads it, so the switch is stored and reported only.
  test.fixme('should stop issuing emailed codes to a member whose organisation has turned them off', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'org-policy-veto' });
    const member = await teamMember(identity, team, 'org-policy-veto-member', 'MEMBER', 'AAL1');
    expect((await setPolicy(team.ownerCtx, team.organisationId, EMAIL_OTP_FALLBACK, { enabled: false })).status()).toBe(200);

    const ctx = await identity.anonymous();
    const changed = await changeChallenge(ctx, await startLogin(ctx, member.user.email), 'EMAIL_OTP');
    expect(await flowStepOf(changed), 'a vetoed organisation gets no emailed code').not.toMatchObject({ status: 'AWAITING_EMAIL_OTP' });
    expect(await countOutboxRows('email', member.user.email, LOGIN_OTP_TEMPLATE), 'and none is enqueued').toBe(0);
  });
});
