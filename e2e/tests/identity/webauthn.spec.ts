/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  addIdentitySessionCookies,
  type AssertionBody,
  type AuthenticationOptionsLike,
  enrollPasskey,
  findSessionBySecret,
  identityDb,
  identityMutate,
  type IdentityUser,
  type RegistrationOptionsLike,
  requireProductUrl,
  signInWithPassword,
  SoftAuthenticator,
  useClientIp,
  verifyChallenge,
} from '../../lib';
import { expect, type IdentityHarness, test } from './fixtures';
import { expectErrorCode, expectNoSessionCookie, expectSessionCookie, flowStepOf } from './helpers';

/**
 * Defining types
 */

interface CredentialRow {
  credentialId: string;
  signCount: number;
  label: string;
  publicKey: string;
  aaguid: string | null;
}

interface MfaSummary {
  enrollments: { type: string; label: string; credentialId?: string }[];
  recoveryCodesRemaining: number;
}

/**
 * Declaring the constants
 *
 * Passkeys end to end, driven by the software authenticator in `lib/webauthn.ts`: registration behind a self-service
 * elevation, the passkey as the second factor after a password, usernameless sign-in, step-up and removal. Users come from
 * the database factory so only the logins under test spend `login/init`, on the test's own client address.
 */

const WEBAUTHN_PATH = '/api/v1/me/webauthn';
const MFA_PATH = '/api/v1/me/mfa';
const STEP_UP_AUDIT = 'auth.mfa.step_up';
const COUNTER_REGRESSION_AUDIT = 'security.webauthn.counter_regression';

async function credentialRows(userId: string): Promise<CredentialRow[]> {
  return identityDb()<CredentialRow[]>`
    SELECT credential_id AS "credentialId", sign_count::int AS "signCount", label, public_key AS "publicKey", aaguid
    FROM webauthn_credentials WHERE user_id = ${userId} ORDER BY id
  `;
}

/** `detail` is a jsonb string scalar holding the JSON, the shape identity writes everywhere — unwrap it before comparing. */
async function auditDetails(userId: string, action: string): Promise<unknown[]> {
  const rows = await identityDb()<{ detail: string | null }[]>`
    SELECT detail #>> '{}' AS detail FROM audit_events WHERE actor_id = ${userId} AND action = ${action} ORDER BY id
  `;
  return rows.map(row => (row.detail === null ? null : JSON.parse(row.detail)));
}

async function isElevated(sessionId: string): Promise<boolean> {
  const [row] = await identityDb()<{ elevated: boolean }[]>`SELECT coalesce(elevated_until > now(), false) AS elevated FROM user_sessions WHERE id = ${sessionId}`;
  return row?.elevated ?? false;
}

async function elevationIntent(sessionId: string): Promise<{ clientId: string | null; resource: string | null }> {
  const [row] = await identityDb()<{ clientId: string | null; resource: string | null }[]>`
    SELECT elevation_intent_client_id AS "clientId", elevation_intent_resource AS "resource" FROM user_sessions WHERE id = ${sessionId}
  `;
  if (!row) throw new Error(`session ${sessionId} vanished`);
  return row;
}

async function mfaSummary(ctx: APIRequestContext): Promise<MfaSummary> {
  const response = await ctx.get(MFA_PATH);
  expect(response.status()).toBe(200);
  return (await response.json()) as MfaSummary;
}

async function registrationOptions(ctx: APIRequestContext): Promise<RegistrationOptionsLike & { excludeCredentials?: { id: string }[] }> {
  const response = await identityMutate(ctx, 'post', `${WEBAUTHN_PATH}/register/options`);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as RegistrationOptionsLike & { excludeCredentials?: { id: string }[] };
}

/** `POST /api/v1/auth/webauthn/options`: with no flow it opens a usernameless one, with a flow it challenges that flow's user. */
async function loginOptions(ctx: APIRequestContext, flowId?: string): Promise<{ flowId: string; options: AuthenticationOptionsLike & { allowCredentials?: { id: string }[] } }> {
  const response = await ctx.post('/api/v1/auth/webauthn/options', { data: flowId ? { flowId } : {} });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as { flowId: string; options: AuthenticationOptionsLike & { allowCredentials?: { id: string }[] } };
}

async function stepUpOptions(ctx: APIRequestContext): Promise<APIResponse> {
  return identityMutate(ctx, 'post', `${WEBAUTHN_PATH}/step-up/options`);
}

async function passkeyStepUp(ctx: APIRequestContext, assertion: AssertionBody, intent: { clientId?: string; resource?: string } = {}): Promise<APIResponse> {
  return identityMutate(ctx, 'post', `${WEBAUTHN_PATH}/step-up`, { ...assertion, ...intent });
}

async function expectRefused(response: APIResponse, status: number, code: string): Promise<void> {
  expect(response.status(), await response.text()).toBe(status);
  await expectErrorCode(response, code);
}

/** A password login that stops at the passkey step, as it must for an account whose only factor is a passkey. */
async function passwordToPasskeyStep(ctx: APIRequestContext, user: IdentityUser): Promise<string> {
  const { flowId, response } = await signInWithPassword(ctx, user.email, user.password);
  expect(response.status(), await response.text()).toBe(200);
  expect(await flowStepOf(response)).toEqual({ flowId, status: 'AWAITING_MFA_WEBAUTHN' });
  expectNoSessionCookie(response);
  return flowId;
}

/** A user whose only factor is a passkey, with the authenticator holding it. */
async function passkeyUser(identity: IdentityHarness, label: string): Promise<{ user: IdentityUser; authenticator: SoftAuthenticator }> {
  const user = await identity.createUser({ label });
  const authenticator = new SoftAuthenticator();
  await enrollPasskey((await identity.signIn(user, { aal: 'AAL2' })).ctx, authenticator);
  return { user, authenticator };
}

// A first passkey mints ten argon2id-hashed recovery codes, which runs slow while the rest of the suite shares the server.
test.describe.configure({ timeout: 60_000 });

test.describe('identity WebAuthn — registration', () => {
  test('should gate passkey registration on an elevation, refuse a forged challenge and mint the first recovery batch once', async ({ identity }) => {
    const user = await identity.createUser({ label: 'passkey-register' });
    const { ctx } = await identity.signIn(user, { aal: 'AAL2' });
    const { ctx: unelevated } = await identity.signIn(user);
    const first = new SoftAuthenticator();
    const second = new SoftAuthenticator();

    await expectRefused(await identityMutate(unelevated, 'post', `${WEBAUTHN_PATH}/register/options`), 403, 'AUTH_006');
    expect(await credentialRows(user.userId), 'a refused options call must provision nothing').toEqual([]);

    // The elevation guard runs before the challenge is consumed, so the very attestation an un-elevated session was refused
    // still registers on an elevated one.
    const attestation = first.attest(await registrationOptions(ctx), { label: 'first key' });
    await expectRefused(await identityMutate(unelevated, 'post', `${WEBAUTHN_PATH}/register/verify`, attestation), 403, 'AUTH_006');
    expect(await credentialRows(user.userId), 'a refused verify must store no credential').toEqual([]);

    const registered = await identityMutate(ctx, 'post', `${WEBAUTHN_PATH}/register/verify`, attestation);
    expect(registered.status(), await registered.text()).toBe(200);
    const { success, recoveryCodes } = (await registered.json()) as { success: boolean; recoveryCodes?: string[] };
    expect(success).toBe(true);
    expect(recoveryCodes).toHaveLength(10);

    const summary = await mfaSummary(ctx);
    expect(summary.enrollments).toEqual([{ type: 'WEBAUTHN', label: 'first key', credentialId: first.credentialId, createdAt: expect.any(String) as unknown }]);
    expect(summary.recoveryCodesRemaining).toBe(10);
    const [stored] = await credentialRows(user.userId);
    expect(stored).toMatchObject({ credentialId: first.credentialId, signCount: 0, label: 'first key' });
    expect(stored?.publicKey, 'the COSE public key is stored').toBeTruthy();

    const options = await registrationOptions(ctx);
    expect(
      options.excludeCredentials?.map(credential => credential.id),
      'the key already held is excluded',
    ).toEqual([first.credentialId]);
    const forged = second.attest({ ...options, challenge: randomBytes(32).toString('base64url') });
    await expectRefused(await identityMutate(ctx, 'post', `${WEBAUTHN_PATH}/register/verify`, forged), 401, 'MFA_002');
    expect(await credentialRows(user.userId), 'a forged attestation must register nothing').toHaveLength(1);

    const enrolment = await enrollPasskey(ctx, second, 'second key');
    expect(enrolment.recoveryCodes, 'the batch is minted once, not on every factor').toBeUndefined();
    expect((await credentialRows(user.userId)).map(row => row.credentialId)).toEqual([first.credentialId, second.credentialId]);
  });
});

test.describe('identity WebAuthn — second factor at login', () => {
  test('should demand the passkey after the password and refuse another account’s key', async ({ identity }) => {
    const { user, authenticator } = await passkeyUser(identity, 'passkey-mfa');
    const stranger = await passkeyUser(identity, 'passkey-mfa-stranger');

    const ctx = await identity.anonymous();
    const flowId = await passwordToPasskeyStep(ctx, user);
    const challenge = await loginOptions(ctx, flowId);
    expect(challenge.flowId).toBe(flowId);
    expect(challenge.options.allowCredentials?.map(credential => credential.id)).toEqual([authenticator.credentialId]);

    const impostor = await verifyChallenge(ctx, { flowId, webauthn: stranger.authenticator.assert(challenge.options) });
    expect(impostor.status()).toBe(401);
    expect(await flowStepOf(impostor)).toEqual({ flowId, status: 'AWAITING_MFA_WEBAUTHN', attemptsLeft: 2 });
    expectNoSessionCookie(impostor);

    const retry = await loginOptions(ctx, flowId);
    const completed = await verifyChallenge(ctx, { flowId, webauthn: authenticator.assert(retry.options) });
    expect(completed.status(), await completed.text()).toBe(200);
    expect(await flowStepOf(completed)).toEqual({ flowId, status: 'COMPLETED' });
    expect(await findSessionBySecret(expectSessionCookie(completed))).toMatchObject({ userId: user.userId, status: 'ACTIVE', aal: 'AAL2' });
    const [event] = await identityDb()<{ authModeUsed: string; mfaModeUsed: string | null }[]>`
      SELECT auth_mode_used AS "authModeUsed", mfa_mode_used AS "mfaModeUsed" FROM user_sign_in_events WHERE id = ${flowId.replace(/^flow_auth_/, '')}
    `;
    expect(event).toEqual({ authModeUsed: 'PASSWORD', mfaModeUsed: 'WEBAUTHN' });
  });

  test('should refuse a signature-counter regression, audit it and keep accepting a counter above the stored one', async ({ identity }) => {
    const { user, authenticator } = await passkeyUser(identity, 'passkey-counter');
    expect(await auditDetails(user.userId, COUNTER_REGRESSION_AUDIT)).toEqual([]);

    const advance = await identity.anonymous();
    const advanceFlowId = await passwordToPasskeyStep(advance, user);
    const advanceChallenge = await loginOptions(advance, advanceFlowId);
    const advanced = await verifyChallenge(advance, { flowId: advanceFlowId, webauthn: authenticator.assert(advanceChallenge.options, { signCount: 10 }) });
    expect(advanced.status(), await advanced.text()).toBe(200);
    expectSessionCookie(advanced);
    expect((await credentialRows(user.userId))[0]?.signCount).toBe(10);

    const regress = await identity.anonymous();
    const regressFlowId = await passwordToPasskeyStep(regress, user);
    const regressChallenge = await loginOptions(regress, regressFlowId);
    const refused = await verifyChallenge(regress, { flowId: regressFlowId, webauthn: authenticator.assert(regressChallenge.options, { signCount: 3 }) });
    expect(refused.status()).toBe(401);
    expect(await flowStepOf(refused)).toEqual({ flowId: regressFlowId, status: 'AWAITING_MFA_WEBAUTHN', attemptsLeft: 2 });
    expectNoSessionCookie(refused);
    expect(await auditDetails(user.userId, COUNTER_REGRESSION_AUDIT)).toEqual([{ credentialId: authenticator.credentialId }]);
    expect((await credentialRows(user.userId))[0]?.signCount, 'a refused assertion must not move the counter').toBe(10);

    const retry = await loginOptions(regress, regressFlowId);
    const accepted = await verifyChallenge(regress, { flowId: regressFlowId, webauthn: authenticator.assert(retry.options, { signCount: 11 }) });
    expect(accepted.status(), await accepted.text()).toBe(200);
    expect(await flowStepOf(accepted)).toEqual({ flowId: regressFlowId, status: 'COMPLETED' });
    expectSessionCookie(accepted);
    expect((await credentialRows(user.userId))[0]?.signCount).toBe(11);
  });
});

test.describe('identity WebAuthn — usernameless login', () => {
  test('should sign in from a discoverable credential alone, naming no account in the challenge', async ({ identity }) => {
    const { user, authenticator } = await passkeyUser(identity, 'passkey-usernameless');

    const ctx = await identity.anonymous();
    const { flowId, options } = await loginOptions(ctx);
    expect(flowId).toMatch(/\S/);
    expect(options.allowCredentials, 'a usernameless challenge may not name a credential').toEqual([]);

    const completed = await verifyChallenge(ctx, { flowId, webauthn: authenticator.assert(options) });
    expect(completed.status(), await completed.text()).toBe(200);
    expect(await flowStepOf(completed)).toEqual({ flowId, status: 'COMPLETED' });
    expect(await findSessionBySecret(expectSessionCookie(completed))).toMatchObject({ userId: user.userId, status: 'ACTIVE', aal: 'AAL2' });
    const [event] = await identityDb()<{ authModeUsed: string; mfaModeUsed: string | null }[]>`
      SELECT auth_mode_used AS "authModeUsed", mfa_mode_used AS "mfaModeUsed" FROM user_sign_in_events WHERE id = ${flowId.replace(/^flow_auth_/, '')}
    `;
    expect(event).toEqual({ authModeUsed: 'WEBAUTHN', mfaModeUsed: null });
  });
});

test.describe('identity WebAuthn — step-up', () => {
  test('should elevate only on the session owner’s own passkey and record the application intent', async ({ identity }) => {
    const { user, authenticator } = await passkeyUser(identity, 'passkey-stepup');
    const stranger = await passkeyUser(identity, 'passkey-stepup-stranger');
    const application = await identity.createOAuthApp('passkey-stepup');
    const { session, ctx } = await identity.signIn(user);

    const { ctx: keyless } = await identity.signIn(await identity.createUser({ label: 'passkey-stepup-none' }));
    await expectRefused(await stepUpOptions(keyless), 404, 'MFA_001');

    const options = await stepUpOptions(ctx);
    expect(options.status(), await options.text()).toBe(200);
    const { options: challenge } = (await options.json()) as { options: AuthenticationOptionsLike };
    await expectRefused(await passkeyStepUp(ctx, stranger.authenticator.assert(challenge)), 401, 'MFA_002');
    expect(await isElevated(session.sessionId), 'a stranger’s passkey may not elevate the session').toBe(false);

    const retry = (await (await stepUpOptions(ctx)).json()) as { options: AuthenticationOptionsLike };
    const elevated = await passkeyStepUp(ctx, authenticator.assert(retry.options));
    expect(elevated.status(), await elevated.text()).toBe(200);
    expect(await elevated.json()).toMatchObject({ aal: 'AAL2' });
    expect(await isElevated(session.sessionId)).toBe(true);
    expect(await elevationIntent(session.sessionId)).toEqual({ clientId: null, resource: null });
    expect(await auditDetails(user.userId, STEP_UP_AUDIT)).toEqual([{ method: 'WEBAUTHN', intentClientId: null, intentResource: null }]);
    expect((await identityMutate(ctx, 'post', `${MFA_PATH}/recovery-codes`)).status(), 'a self-service elevation unlocks elevated routes').toBe(200);

    const { session: intended, ctx: intendedCtx } = await identity.signIn(user);
    const intentChallenge = (await (await stepUpOptions(intendedCtx)).json()) as { options: AuthenticationOptionsLike };
    const claimed = await passkeyStepUp(intendedCtx, authenticator.assert(intentChallenge.options), {
      clientId: application.serviceClient.clientId,
      resource: application.audience,
    });
    expect(claimed.status(), await claimed.text()).toBe(200);
    expect(await elevationIntent(intended.sessionId)).toEqual({ clientId: application.serviceClient.clientId, resource: application.audience });
    await expectRefused(await identityMutate(intendedCtx, 'post', `${MFA_PATH}/recovery-codes`), 403, 'AUTH_006');
    expect(await auditDetails(user.userId, STEP_UP_AUDIT)).toEqual([
      { method: 'WEBAUTHN', intentClientId: null, intentResource: null },
      { method: 'WEBAUTHN', intentClientId: application.serviceClient.clientId, intentResource: application.audience },
    ]);
  });
});

test.describe('identity WebAuthn — removal', () => {
  test('should remove a passkey only from an elevated session and drop the factor from sign-in', async ({ identity }) => {
    const { user, authenticator } = await passkeyUser(identity, 'passkey-remove');
    const { ctx: elevated } = await identity.signIn(user, { aal: 'AAL2' });
    const { ctx: unelevated } = await identity.signIn(user);
    const path = `${WEBAUTHN_PATH}/${encodeURIComponent(authenticator.credentialId)}`;

    await expectRefused(await identityMutate(unelevated, 'delete', path), 403, 'AUTH_006');
    expect(await credentialRows(user.userId), 'a refused removal must keep the credential').toHaveLength(1);

    const removed = await identityMutate(elevated, 'delete', path);
    expect(removed.status(), await removed.text()).toBe(200);
    expect(await removed.json()).toEqual({ success: true });
    expect(await credentialRows(user.userId)).toEqual([]);
    expect((await mfaSummary(elevated)).enrollments).toEqual([]);
    await expectRefused(await identityMutate(elevated, 'delete', path), 404, 'MFA_001');

    const { flowId, response } = await signInWithPassword(await identity.anonymous(), user.email, user.password);
    expect(response.status(), await response.text()).toBe(200);
    expect(await flowStepOf(response), 'with the passkey gone the password alone signs in').toEqual({ flowId, status: 'COMPLETED' });
    expect(await findSessionBySecret(expectSessionCookie(response))).toMatchObject({ aal: 'AAL1' });
  });

  // App bug: `remove` deletes by credential id and only then checks the owner, so the refused call has already destroyed
  // another account's passkey (apps/identity-server/src/modules/auth/mfa/webauthn.service.ts:301-305).
  test.fixme('should leave another account’s passkey untouched when its credential id is submitted', async ({ identity }) => {
    const victim = await passkeyUser(identity, 'passkey-victim');
    const attacker = await identity.createUser({ label: 'passkey-attacker' });
    const { ctx } = await identity.signIn(attacker, { aal: 'AAL2' });

    await expectRefused(await identityMutate(ctx, 'delete', `${WEBAUTHN_PATH}/${encodeURIComponent(victim.authenticator.credentialId)}`), 404, 'MFA_001');
    expect(await credentialRows(victim.user.userId), 'a refused removal must keep the victim’s credential').toHaveLength(1);
  });
});

test.describe('identity WebAuthn — account UI', () => {
  test('should add a passkey through the account UI on a Chrome virtual authenticator', async ({ context, identity, page }) => {
    const user = await identity.createUser({ label: 'passkey-ui' });
    const { session } = await identity.signIn(user, { aal: 'AAL2' });
    await addIdentitySessionCookies(context, session);
    await useClientIp(context, identity.clientIp);

    // Chrome's own authenticator, driven over CDP: the browser runs the real `navigator.credentials.create` ceremony the
    // node authenticator has to imitate. Resident keys and a pre-verified user, so the page never waits on a gesture.
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    });

    await page.goto(`${requireProductUrl('identity')}/account/security`);
    await expect(page.getByText(/No passkeys yet/i)).toBeVisible();

    // The page is server-rendered, so a click that lands before hydration attaches the handler does nothing at all;
    // retry until the ceremony actually starts. The credential count below is what proves it started exactly once.
    // The first factor an account gains hands back its recovery codes, so the page shows those instead of the passkey list.
    await expect(async () => {
      await page.getByRole('button', { name: 'Add a passkey' }).click();
      await expect(page.getByRole('heading', { name: /Save your recovery codes/i })).toBeVisible({ timeout: 8_000 });
    }).toPass({ timeout: 40_000, intervals: [0] });
    expect(await credentialRows(user.userId), 'the browser ceremony registered exactly one credential').toHaveLength(1);

    await page.reload();
    await expect(page.getByText(/No passkeys yet/i)).toBeHidden();
    await expect(page.getByText(/^Added /)).toBeVisible();
  });
});
