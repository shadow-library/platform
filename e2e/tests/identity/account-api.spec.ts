/**
 * Importing npm packages
 */
import { randomBytes, randomInt } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  authorizeCode,
  findIdentityUserByEmail,
  findResourceScopeId,
  grantClientScope,
  identityDb,
  identityMutate,
  PLATFORM_AUDIENCE,
  readSessionStatus,
  registerInit,
  relyingPartyClient,
  serviceToken,
  signInWithPassword,
  uniqueEmail,
  verifyChallenge,
} from '../../lib';
import { expect, test } from './fixtures';
import { countOutboxRows, expectErrorCode, expectSessionCookie, flowStepOf, maxOutboxId, pollOtp, pollOutboxRowAfter, pollSmsOtp } from './helpers';

/**
 * Defining types
 */

interface AccountRow {
  status: string;
  lockMode: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}

interface ContactItem {
  value: string;
  isPrimary: boolean;
  verifiedAt?: string;
}

interface StoredPassword {
  hash: string;
  algorithm: string;
  version: number;
}

/**
 * Declaring the constants
 *
 * The self-service account API behind `/api/v1/me` — closure, password rotation, contact emails and phones — plus the
 * tenant-isolation and user-creation rules registration surfaces, and the service-only directory seam. Users come from the
 * database factory, so only the logins under test spend `login/init`, on the test's own client address.
 */

const ME_PATH = '/api/v1/me';
const INTERNAL_PATH = '/api/v1/internal';
const USERS_RESOLVE_SCOPE = 'users:resolve';
const EMAIL_VERIFY_TEMPLATE = 'user.email.verification';
const PHONE_VERIFY_TEMPLATE = 'user.phone.verification';
const PASSWORD_CHANGED_TEMPLATE = 'auth.password.changed';
const REGISTER_OTP_TEMPLATE = 'auth.register.otp';
/** Identity keeps the last five hashes (`PASSWORD_HISTORY_DEPTH`), so the sixth change pushes the first one out of reach. */
const PASSWORD_HISTORY_DEPTH = 5;

function newPassword(): string {
  return `E2e-Account-${randomBytes(6).toString('hex')}-9Ab`;
}

function uniqueUsername(): string {
  return `e2e${randomBytes(6).toString('hex')}`;
}

/** An E.164 number in the +1 999 test range, shaped so `validator.isMobilePhone` accepts it. */
function uniquePhone(): string {
  return `+1999${randomInt(2, 10)}${randomInt(100_000, 1_000_000)}`;
}

async function accountRow(userId: string): Promise<AccountRow> {
  const [row] = await identityDb()<AccountRow[]>`
    SELECT u.status, u.lock_mode AS "lockMode", u.username, p.first_name AS "firstName", p.last_name AS "lastName"
    FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ${userId}
  `;
  if (!row) throw new Error(`user ${userId} vanished`);
  return row;
}

async function storedPassword(userId: string): Promise<StoredPassword> {
  const [row] = await identityDb()<StoredPassword[]>`
    SELECT up.hash, up.algorithm, up.version
    FROM user_passwords up JOIN user_auth_identities uai ON uai.id = up.user_auth_identity_id
    WHERE uai.user_id = ${userId} AND uai.provider = 'PASSWORD'
  `;
  if (!row) throw new Error(`user ${userId} has no password credential`);
  return row;
}

async function passwordHistoryHashes(userId: string): Promise<string[]> {
  const rows = await identityDb()<{ hash: string }[]>`SELECT hash FROM password_history WHERE user_id = ${userId} ORDER BY created_at`;
  return rows.map(row => row.hash);
}

async function organisationStatus(organisationId: string): Promise<string | undefined> {
  const [row] = await identityDb()<{ status: string }[]>`SELECT status FROM organisations WHERE id = ${organisationId}`;
  return row?.status;
}

async function organisationsNamed(name: string): Promise<number> {
  const [row] = await identityDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM organisations WHERE name = ${name}`;
  return row?.count ?? 0;
}

async function expectRefused(response: APIResponse, status: number, code: string): Promise<void> {
  expect(response.status(), await response.text()).toBe(status);
  await expectErrorCode(response, code);
}

/** A 422 that names `field`, so a test can never pass on some unrelated rejection of the same shape. */
async function expectInvalidField(response: APIResponse, field: string): Promise<void> {
  await expectRefused(response, 422, 'VALIDATION_ERROR');
  const { fields } = (await response.json()) as { fields?: { field: string }[] };
  expect(fields?.map(entry => entry.field)).toContain(field);
}

function changePassword(ctx: APIRequestContext, currentPassword: string, newValue: string): Promise<APIResponse> {
  return identityMutate(ctx, 'post', `${ME_PATH}/password`, { currentPassword, newPassword: newValue });
}

/** The contact list as `{value: {isPrimary, verified}}`; identity returns the rows unordered, so a map is what a spec can compare. */
async function contactState(ctx: APIRequestContext, kind: 'emails' | 'phones'): Promise<Record<string, { isPrimary: boolean; verified: boolean }>> {
  const response = await ctx.get(`${ME_PATH}/${kind}`);
  expect(response.status(), await response.text()).toBe(200);
  const { items } = (await response.json()) as { items: ContactItem[] };
  return Object.fromEntries(items.map(item => [item.value, { isPrimary: item.isPrimary, verified: item.verifiedAt !== undefined }]));
}

function yearsAgo(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
}

/** `register/init` plus the emailed code, leaving the flow at the demographics step. */
async function registerToDemographics(ctx: APIRequestContext, email: string): Promise<string> {
  const init = await registerInit(ctx, email);
  expect(init.status(), await init.text()).toBe(200);
  const { flowId = '' } = await flowStepOf(init);
  const verified = await verifyChallenge(ctx, { flowId, code: await pollOtp(email.toLowerCase(), REGISTER_OTP_TEMPLATE) });
  expect(verified.status(), await verified.text()).toBe(200);
  expect(await flowStepOf(verified)).toEqual({ flowId, status: 'AWAITING_DEMOGRAPHICS' });
  return flowId;
}

/** Claims `value` and confirms it with the code identity enqueues, throwing unless both steps answer 200. */
async function addAndVerifyContact(ctx: APIRequestContext, kind: 'emails' | 'phones', value: string): Promise<string> {
  const field = kind === 'emails' ? 'email' : 'phone';
  const added = await identityMutate(ctx, 'post', `${ME_PATH}/${kind}`, { [field]: value });
  expect(added.status(), await added.text()).toBe(200);
  const { verificationId } = (await added.json()) as { verificationId: string };
  const code = kind === 'emails' ? await pollOtp(value, EMAIL_VERIFY_TEMPLATE) : await pollSmsOtp(value, PHONE_VERIFY_TEMPLATE);
  const verified = await identityMutate(ctx, 'post', `${ME_PATH}/${kind}/verify`, { verificationId, code });
  expect(verified.status(), await verified.text()).toBe(200);
  return verificationId;
}

// Every password change is an argon2id hash plus a reuse check over the stored history, which runs slow while the rest of the suite shares the server.
test.describe.configure({ timeout: 120_000 });

test.describe('identity account API — closure', () => {
  test('should close an account only from an elevated session, scrub it and kill every session including the caller’s', async ({ identity }) => {
    const username = uniqueUsername();
    const user = await identity.createUser({ label: 'close', username, firstName: 'Clara', lastName: 'Closer' });
    const { ctx: unelevated } = await identity.signIn(user);
    const { ctx: bystander } = await identity.signIn(user);
    const { ctx } = await identity.signIn(user, { aal: 'AAL2' });

    await expectRefused(await identityMutate(unelevated, 'delete', ME_PATH), 403, 'AUTH_006');
    expect(await accountRow(user.userId), 'a refused closure must leave the account alone').toMatchObject({ status: 'ACTIVE', lockMode: 'NONE', username });
    expect((await identityMutate(await identity.anonymous(), 'delete', ME_PATH)).status(), 'closure needs a session').toBe(401);

    const closed = await identityMutate(ctx, 'delete', ME_PATH);
    expect(closed.status(), await closed.text()).toBe(200);
    expect(await closed.json()).toEqual({ success: true });
    expect(await accountRow(user.userId)).toEqual({ status: 'CLOSED', lockMode: 'FULL', username: null, firstName: null, lastName: null });
    expect(await organisationStatus(user.personalOrgId)).toBe('DELETED');

    for (const [name, dead] of [
      ['the closing session', ctx],
      ['an unelevated session', unelevated],
      ['a bystander session', bystander],
    ] as const) {
      expect((await dead.get(ME_PATH)).status(), `${name} must be dead after closure`).toBe(401);
    }

    const { ctx: again } = await identity.signIn(user, { aal: 'AAL2' });
    expect(await contactState(again, 'emails'), 'the addresses are scrubbed').toEqual({});
    const second = await identityMutate(again, 'delete', ME_PATH);
    expect(second.status(), await second.text()).toBe(200);
    expect(await second.json()).toEqual({ success: true });
  });
});

test.describe('identity account API — password', () => {
  test('should rotate the credential, keep the caller’s session, end every other and swap which password signs in', async ({ identity }) => {
    const user = await identity.createUser({ label: 'password-rotate' });
    const { ctx } = await identity.signIn(user);
    const { session: doomed, ctx: doomedCtx } = await identity.signIn(user);
    const next = newPassword();
    const notifiedBefore = await maxOutboxId(user.email, PASSWORD_CHANGED_TEMPLATE);

    const changed = await changePassword(ctx, user.password, next);
    expect(changed.status(), await changed.text()).toBe(200);
    expect(await changed.json()).toEqual({ success: true });
    await pollOutboxRowAfter(user.email, PASSWORD_CHANGED_TEMPLATE, notifiedBefore);

    expect((await ctx.get(ME_PATH)).status(), 'the session that changed the password survives').toBe(200);
    expect(await readSessionStatus(doomed.sessionId)).toBe('TERMINATED');
    expect((await doomedCtx.get(ME_PATH)).status()).toBe(401);

    const withOld = await signInWithPassword(await identity.anonymous(), user.email, user.password);
    expect(withOld.response.status()).toBe(401);
    expect(await flowStepOf(withOld.response)).toEqual({ flowId: withOld.flowId, status: 'AWAITING_PASSWORD', attemptsLeft: 2 });

    const withNew = await signInWithPassword(await identity.anonymous(), user.email, next);
    expect(withNew.response.status(), await withNew.response.text()).toBe(200);
    expect(await flowStepOf(withNew.response)).toEqual({ flowId: withNew.flowId, status: 'COMPLETED' });
    expectSessionCookie(withNew.response);
  });

  test('should refuse a wrong current password, a weak new one and a reuse, leaving the credential untouched', async ({ identity }) => {
    const user = await identity.createUser({ label: 'password-policy' });
    const { ctx } = await identity.signIn(user);
    const before = await storedPassword(user.userId);

    await expectRefused(await changePassword(ctx, 'Not-The-Password-9a', newPassword()), 401, 'AUTH_003');
    await expectInvalidField(await changePassword(ctx, user.password, 'weak'), 'password');
    await expectInvalidField(await changePassword(ctx, user.password, `E2e-${'a'.repeat(200)}-9A!`), 'password');
    await expectInvalidField(await changePassword(ctx, user.password, user.password), 'password');
    expect(await storedPassword(user.userId), 'every refusal leaves the stored credential alone').toEqual(before);
    expect((await changePassword(await identity.anonymous(), user.password, newPassword())).status()).toBe(401);

    const accepted = await changePassword(ctx, user.password, newPassword());
    expect(accepted.status(), 'the legitimate change still goes through').toBe(200);
  });

  test('should keep only the last five password hashes, freeing the one pushed out for reuse', async ({ identity }) => {
    const user = await identity.createUser({ label: 'password-history' });
    const { ctx } = await identity.signIn(user);
    const original = user.password;
    const originalHash = (await storedPassword(user.userId)).hash;
    expect(await passwordHistoryHashes(user.userId), 'registration records the password it set').toEqual([originalHash]);

    let current = original;
    const used: string[] = [];
    for (let change = 0; change < PASSWORD_HISTORY_DEPTH; change++) {
      const next = newPassword();
      const response = await changePassword(ctx, current, next);
      expect(response.status(), await response.text()).toBe(200);
      used.push(next);
      current = next;
    }

    const history = await passwordHistoryHashes(user.userId);
    expect(history, 'the history is pruned to its depth').toHaveLength(PASSWORD_HISTORY_DEPTH);
    expect(history, 'the oldest hash is the one pushed out').not.toContain(originalHash);

    await expectInvalidField(await changePassword(ctx, current, current), 'password');
    await expectInvalidField(await changePassword(ctx, current, used[0] as string), 'password');

    const reinstated = await changePassword(ctx, current, original);
    expect(reinstated.status(), await reinstated.text()).toBe(200);
    expect((await signInWithPassword(await identity.anonymous(), user.email, original)).response.status()).toBe(200);
  });

  test('should store argon2id hashes at the pinned params version and rehash an outdated one on sign-in', async ({ identity }) => {
    const user = await identity.createUser({ label: 'password-rehash' });
    const { ctx } = await identity.signIn(user);
    const next = newPassword();
    expect((await changePassword(ctx, user.password, next)).status()).toBe(200);

    const fresh = await storedPassword(user.userId);
    expect(fresh.algorithm).toBe('ARGON2ID');
    expect(fresh.version).toBe(1);
    expect(fresh.hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);

    await identityDb()`
      UPDATE user_passwords up SET version = 0 FROM user_auth_identities uai
      WHERE up.user_auth_identity_id = uai.id AND uai.user_id = ${user.userId} AND uai.provider = 'PASSWORD'
    `;
    const signedIn = await signInWithPassword(await identity.anonymous(), user.email, next);
    expect(signedIn.response.status(), await signedIn.response.text()).toBe(200);
    expect(await flowStepOf(signedIn.response)).toEqual({ flowId: signedIn.flowId, status: 'COMPLETED' });

    const rehashed = await storedPassword(user.userId);
    expect(rehashed.version, 'an outdated hash is upgraded on the sign-in that verified it').toBe(1);
    expect(rehashed.hash).not.toBe(fresh.hash);
    expect(rehashed.hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
  });
});

test.describe('identity account API — contacts', () => {
  test('should add, verify and promote a second email, then sign in with it', async ({ identity }) => {
    const user = await identity.createUser({ label: 'contact-email' });
    const { ctx } = await identity.signIn(user);
    const second = uniqueEmail('contact-second');

    expect((await (await identity.anonymous()).get(`${ME_PATH}/emails`)).status()).toBe(401);
    expect(await contactState(ctx, 'emails')).toEqual({ [user.email]: { isPrimary: true, verified: true } });
    await expectInvalidField(await identityMutate(ctx, 'post', `${ME_PATH}/emails`, { email: 'not-an-email' }), 'body.email');

    await expectRefused(await identityMutate(ctx, 'post', `${ME_PATH}/emails/primary`, { email: second }), 409, 'USR_006');
    await addAndVerifyContact(ctx, 'emails', second);
    expect(await contactState(ctx, 'emails')).toEqual({ [user.email]: { isPrimary: true, verified: true }, [second]: { isPrimary: false, verified: true } });

    const login = await signInWithPassword(await identity.anonymous(), second, user.password);
    expect(login.response.status(), 'a verified second address is a login identifier').toBe(200);
    expect(await flowStepOf(login.response)).toEqual({ flowId: login.flowId, status: 'COMPLETED' });

    await expectRefused(await identityMutate(ctx, 'delete', `${ME_PATH}/emails`, { email: user.email }), 409, 'USR_005');
    const promoted = await identityMutate(ctx, 'post', `${ME_PATH}/emails/primary`, { email: second });
    expect(promoted.status(), await promoted.text()).toBe(200);
    expect(await contactState(ctx, 'emails')).toEqual({ [user.email]: { isPrimary: false, verified: true }, [second]: { isPrimary: true, verified: true } });

    const removed = await identityMutate(ctx, 'delete', `${ME_PATH}/emails`, { email: user.email });
    expect(removed.status(), await removed.text()).toBe(200);
    expect(await contactState(ctx, 'emails')).toEqual({ [second]: { isPrimary: true, verified: true } });
  });

  test('should answer neutrally for an address another account has already verified', async ({ identity }) => {
    const owner = await identity.createUser({ label: 'contact-owner' });
    const claimant = await identity.createUser({ label: 'contact-claimant' });
    const { ctx } = await identity.signIn(claimant);

    const claimed = await identityMutate(ctx, 'post', `${ME_PATH}/emails`, { email: owner.email });
    expect(claimed.status(), await claimed.text()).toBe(200);
    const { verificationId } = (await claimed.json()) as { verificationId: string };
    expect(verificationId, 'the answer is shaped exactly like a real claim').toMatch(/^contact_email_[0-9a-f-]{36}$/);
    expect(await countOutboxRows('email', owner.email, EMAIL_VERIFY_TEMPLATE), 'no code may go to the address’ owner').toBe(0);
    expect(await contactState(ctx, 'emails'), 'the address is never attached to the claimant').toEqual({ [claimant.email]: { isPrimary: true, verified: true } });

    const guessed = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await expectRefused(await identityMutate(ctx, 'post', `${ME_PATH}/emails/verify`, { verificationId, code: guessed }), 401, 'MFA_002');

    const own = uniqueEmail('contact-claimant-own');
    await addAndVerifyContact(ctx, 'emails', own);
    expect(await contactState(ctx, 'emails'), 'a genuine claim still works').toEqual({
      [claimant.email]: { isPrimary: true, verified: true },
      [own]: { isPrimary: false, verified: true },
    });
  });

  test('should add, verify and promote a phone and refuse a malformed one', async ({ identity }) => {
    const user = await identity.createUser({ label: 'contact-phone', phone: uniquePhone(), phoneVerified: true });
    const { ctx } = await identity.signIn(user);
    const second = uniquePhone();

    // The schema rejects the shape (`body.phone`); a well-shaped number that is no mobile line only fails the service's own check.
    await expectInvalidField(await identityMutate(ctx, 'post', `${ME_PATH}/phones`, { phone: '12345' }), 'body.phone');
    await expectInvalidField(await identityMutate(ctx, 'post', `${ME_PATH}/phones`, { phone: '+19990000000' }), 'phone');
    expect(await contactState(ctx, 'phones')).toEqual({ [user.phone as string]: { isPrimary: true, verified: true } });

    await addAndVerifyContact(ctx, 'phones', second);
    const promoted = await identityMutate(ctx, 'post', `${ME_PATH}/phones/primary`, { phone: second });
    expect(promoted.status(), await promoted.text()).toBe(200);
    expect(await contactState(ctx, 'phones')).toEqual({
      [user.phone as string]: { isPrimary: false, verified: true },
      [second]: { isPrimary: true, verified: true },
    });
  });
});

test.describe('identity account API — tenants and user creation', () => {
  test('should give every account its own PERSONAL workspace and refuse to list another organisation’s members', async ({ identity }) => {
    const outsider = await identity.createUser({ label: 'tenant-outsider' });
    const { ctx } = await identity.signIn(outsider);
    const team = await identity.createTeam({ label: 'tenant' });

    const own = await ctx.get(`${ME_PATH}/organisations`);
    expect(own.status()).toBe(200);
    expect(((await own.json()) as { organisations: unknown[] }).organisations).toEqual([
      expect.objectContaining({ id: outsider.personalOrgId, type: 'PERSONAL', role: 'OWNER', isDefault: true }) as unknown,
    ]);

    await expectRefused(await ctx.get(`/api/v1/organisations/${team.organisationId}/members`), 403, 'ORG_001');
    const members = await team.ownerCtx.get(`/api/v1/organisations/${team.organisationId}/members`);
    expect(members.status(), 'a member still sees the roster').toBe(200);
    expect(((await members.json()) as { members: { userId: string }[] }).members.map(member => member.userId)).toEqual([team.owner.userId]);
  });

  test('should lowercase a registered email and refuse a weak password or an under-age date of birth', async ({ identity }) => {
    const ctx = await identity.anonymous();
    const mixedCase = `e2e.reg.MiXeD.${Date.now().toString(36)}${randomBytes(3).toString('hex')}@Shadow-Apps.Test`;
    identity.trackUserByEmail(mixedCase.toLowerCase());

    const flowId = await registerToDemographics(ctx, mixedCase);
    expect((await ctx.post('/api/v1/auth/register/demographics', { data: { flowId, dateOfBirth: yearsAgo(30) } })).status()).toBe(200);
    await ctx.post('/api/v1/auth/register/profile', { data: { flowId, firstName: 'Cassie', lastName: 'Case' } });
    await expectInvalidField(await ctx.post('/api/v1/auth/register/password', { data: { flowId, password: 'weak' } }), 'password');
    const completed = await ctx.post('/api/v1/auth/register/password', { data: { flowId, password: newPassword() } });
    expect(completed.status(), await completed.text()).toBe(200);
    expect(await findIdentityUserByEmail(mixedCase.toLowerCase()), 'the address is stored lowercased').toBeDefined();

    // A completed registration leaves `__Host-sid` on the context, and identity enforces CSRF on every later mutation it sends.
    const youngCtx = await identity.anonymous();
    const youngEmail = uniqueEmail('reg-underage');
    identity.trackUserByEmail(youngEmail);
    const youngFlowId = await registerToDemographics(youngCtx, youngEmail);
    expect((await youngCtx.post('/api/v1/auth/register/demographics', { data: { flowId: youngFlowId, dateOfBirth: yearsAgo(8) } })).status()).toBe(200);
    await youngCtx.post('/api/v1/auth/register/profile', { data: { flowId: youngFlowId, firstName: 'Minor', lastName: 'Applicant' } });
    await expectInvalidField(await youngCtx.post('/api/v1/auth/register/password', { data: { flowId: youngFlowId, password: newPassword() } }), 'dateOfBirth');
    expect(await findIdentityUserByEmail(youngEmail), 'a refused registration creates no account').toBeUndefined();
  });

  test('should refuse a duplicate email with USR_003 and leave no orphan personal organisation', async ({ identity }) => {
    const email = uniqueEmail('reg-duplicate');
    const firstName = `Orph${randomBytes(4).toString('hex')}`;
    identity.trackUserByEmail(email);
    const ctx = await identity.anonymous();

    const flowId = await registerToDemographics(ctx, email);
    await ctx.post('/api/v1/auth/register/demographics', { data: { flowId } });
    await ctx.post('/api/v1/auth/register/profile', { data: { flowId, firstName, lastName: 'Tester' } });

    // The address is claimed between the flow's verification and its completion — the one way in to the duplicate-email
    // guard from outside, since `register/init` never discloses an address that already exists.
    const squatter = await identity.createUser({ label: 'reg-duplicate-squatter' });
    await identityDb()`UPDATE user_emails SET email_id = ${email} WHERE user_id = ${squatter.userId} AND is_primary`;

    const refused = await ctx.post('/api/v1/auth/register/password', { data: { flowId, password: newPassword() } });
    await expectRefused(refused, 409, 'USR_003');
    expect(await organisationsNamed(`${firstName} Tester Workspace`), 'the rolled-back transaction leaves no workspace').toBe(0);
  });
});

test.describe('identity directory', () => {
  test('should resolve verified addresses and name only users the calling service holds a consent with', async ({ identity }) => {
    const admin = await identity.admin();
    const application = await identity.createOAuthApp('directory', { withPublicUrl: true });
    await grantClientScope(admin.ctx, application.serviceClient.clientId, await findResourceScopeId(admin.ctx, PLATFORM_AUDIENCE, USERS_RESOLVE_SCOPE));

    const anonymous = await identity.anonymous();
    const token = await serviceToken(anonymous, application.serviceClient, { scope: USERS_RESOLVE_SCOPE });
    const headers = { authorization: `Bearer ${token}` };
    const call = (path: string, data: unknown): Promise<APIResponse> => anonymous.post(`${INTERNAL_PATH}${path}`, { headers, data });

    const consenting = await identity.createUser({ label: 'dir-consent', firstName: 'Dora', lastName: 'Directory' });
    const stranger = await identity.createUser({ label: 'dir-stranger', firstName: 'Stan', lastName: 'Stranger' });
    const unverified = await identity.createUser({ label: 'dir-unverified', emailVerified: false });
    const { ctx: consentingCtx } = await identity.signIn(consenting);
    await authorizeCode(consentingCtx, relyingPartyClient(application));

    const resolved = await call('/users/resolve', { emails: [consenting.email.toUpperCase(), unverified.email, uniqueEmail('dir-absent')] });
    expect(resolved.status(), await resolved.text()).toBe(200);
    expect(await resolved.json(), 'only an exact verified address resolves, echoed as submitted and with no name').toEqual({
      users: [{ email: consenting.email.toUpperCase(), userId: consenting.userId }],
    });

    const named = await call('/users/lookup', { userIds: [consenting.userId, stranger.userId] });
    expect(named.status(), await named.text()).toBe(200);
    expect(await named.json(), 'a user the caller has no consent with is omitted, not refused').toEqual({
      users: [{ userId: consenting.userId, firstName: 'Dora', lastName: 'Directory' }],
    });

    const withdrawn = await identityMutate(consentingCtx, 'delete', `${ME_PATH}/consents/${application.serviceClient.clientId}`);
    expect(withdrawn.status(), await withdrawn.text()).toBe(200);
    expect(await (await call('/users/lookup', { userIds: [consenting.userId] })).json(), 'a withdrawn consent takes the name back').toEqual({ users: [] });

    const team = await identity.createTeam({ label: 'dir' });
    const membership = async (userId: string): Promise<unknown> => {
      const response = await anonymous.get(`${INTERNAL_PATH}/organisations/${team.organisationId}/members/${userId}`, { headers });
      expect(response.status(), await response.text()).toBe(200);
      return response.json();
    };
    expect(await membership(team.owner.userId)).toEqual({ member: true });
    expect(await membership(stranger.userId)).toEqual({ member: false });

    await expectRefused(await anonymous.post(`${INTERNAL_PATH}/users/lookup`, { data: { userIds: [consenting.userId] } }), 401, 'SEC_003');
    await expectRefused(await identityMutate(consentingCtx, 'post', `${INTERNAL_PATH}/users/lookup`, { userIds: [consenting.userId] }), 401, 'SEC_003');
  });
});
