/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  enrollTotp,
  findSessionBySecret,
  identityDb,
  identityMutate,
  type IdentityUser,
  linkFederatedIdentity,
  signInWithPassword,
  stepUp,
  TotpAuthenticator,
  totpCode,
  verifyChallenge,
} from '../../lib';
import { expect, test } from './fixtures';
import { expectErrorCode, expectNoSessionCookie, expectSessionCookie, flowStepOf, maxOutboxId, pollOutboxRowAfter } from './helpers';

/**
 * Defining types
 */

interface MfaSummary {
  enrollments: { type: string; label: string }[];
  recoveryCodesRemaining: number;
}

interface RecoveryCodeRow {
  codeHash: string;
  generation: number;
  used: boolean;
}

/**
 * Declaring the constants
 *
 * TOTP, recovery codes and step-up, driven through identity's API. Users come from the database factory and start on minted
 * sessions; only the logins under test spend `login/init`, on the test's own client address. Every failed factor lands on a
 * factory user, never a persona, because five failures in fifteen minutes lock an account.
 */

const MFA_PATH = '/api/v1/me/mfa';
const RECOVERY_CODE_SHAPE = /^[0-9A-Z]{5}-[0-9A-Z]{5}$/;
const RECOVERY_CODE_USED_TEMPLATE = 'auth.mfa.recovery-code-used';
const HOUR_MS = 60 * 60 * 1000;
const LOCK_WINDOW_MS = 15 * 60 * 1000;

async function mfaSummary(ctx: APIRequestContext): Promise<MfaSummary> {
  const response = await ctx.get(MFA_PATH);
  expect(response.status()).toBe(200);
  return (await response.json()) as MfaSummary;
}

async function enrolmentRows(userId: string): Promise<{ secretCiphertext: string | null; kekVersion: number | null; verified: boolean }[]> {
  return identityDb()<{ secretCiphertext: string | null; kekVersion: number | null; verified: boolean }[]>`
    SELECT secret_ciphertext AS "secretCiphertext", kek_version AS "kekVersion", verified_at IS NOT NULL AS verified FROM mfa_enrollments WHERE user_id = ${userId}
  `;
}

async function recoveryCodeRows(userId: string): Promise<RecoveryCodeRow[]> {
  return identityDb()<RecoveryCodeRow[]>`
    SELECT code_hash AS "codeHash", generation, used_at IS NOT NULL AS used FROM recovery_codes WHERE user_id = ${userId} ORDER BY id
  `;
}

async function failedMfaEvents(userId: string): Promise<number> {
  const [row] = await identityDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM user_sign_in_events WHERE user_id = ${userId} AND status = 'MFA_FAILED'`;
  return row?.count ?? 0;
}

async function activeSessionCount(userId: string): Promise<number> {
  const [row] = await identityDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM user_sessions WHERE user_id = ${userId} AND status = 'ACTIVE'`;
  return row?.count ?? 0;
}

async function lockOf(userId: string): Promise<{ lockMode: string; lockedUntil: Date | null }> {
  const [row] = await identityDb()<{ lockMode: string; lockedUntil: Date | null }[]>`SELECT lock_mode AS "lockMode", locked_until AS "lockedUntil" FROM users WHERE id = ${userId}`;
  if (!row) throw new Error(`user ${userId} vanished`);
  return row;
}

async function isElevated(sessionId: string): Promise<boolean> {
  const [row] = await identityDb()<{ elevated: boolean }[]>`SELECT coalesce(elevated_until > now(), false) AS elevated FROM user_sessions WHERE id = ${sessionId}`;
  return row?.elevated ?? false;
}

/** A password login that stops at the TOTP step, as it must for an account with TOTP enrolled. */
async function passwordToTotpStep(ctx: APIRequestContext, user: IdentityUser): Promise<string> {
  const { flowId, response } = await signInWithPassword(ctx, user.email, user.password);
  expect(response.status(), await response.text()).toBe(200);
  expect(await flowStepOf(response)).toEqual({ flowId, status: 'AWAITING_TOTP' });
  expectNoSessionCookie(response);
  return flowId;
}

async function expectMfaFailure(response: APIResponse, flowId: string, attemptsLeft: number): Promise<void> {
  expect(response.status()).toBe(401);
  expect(await flowStepOf(response)).toEqual({ flowId, status: 'AWAITING_TOTP', attemptsLeft });
  expectNoSessionCookie(response);
}

async function expectRefused(response: APIResponse, status: number, code: string): Promise<void> {
  expect(response.status()).toBe(status);
  await expectErrorCode(response, code);
}

// Every TOTP activation and recovery-code check is a batch of argon2id hashes, which runs slow while the rest of the suite shares the server.
test.describe.configure({ timeout: 60_000 });

test.describe('identity MFA — TOTP enrolment', () => {
  test('should gate TOTP enrolment, activation and removal on a self-service elevation and keep the seed encrypted', async ({ identity }) => {
    const user = await identity.createUser({ label: 'totp-enrol' });
    const { session, ctx } = await identity.signIn(user);
    const { ctx: unelevated } = await identity.signIn(user);

    await expectRefused(await identityMutate(ctx, 'post', `${MFA_PATH}/totp/enroll`), 403, 'AUTH_006');
    expect(await enrolmentRows(user.userId), 'a refused enrolment must provision nothing').toEqual([]);

    const elevation = await stepUp(ctx, { password: user.password });
    expect(elevation.status(), await elevation.text()).toBe(200);
    expect(await isElevated(session.sessionId)).toBe(true);

    const enroll = await identityMutate(ctx, 'post', `${MFA_PATH}/totp/enroll`);
    expect(enroll.status()).toBe(200);
    const { secret, uri } = (await enroll.json()) as { secret: string; uri: string };
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    const [pending] = await enrolmentRows(user.userId);
    expect(pending).toMatchObject({ kekVersion: 1, verified: false });
    expect(pending?.secretCiphertext, 'the seed is stored').toBeTruthy();
    expect(pending?.secretCiphertext, 'the seed must be stored encrypted').not.toContain(secret);

    const authenticator = new TotpAuthenticator(secret);
    await expectRefused(await identityMutate(unelevated, 'post', `${MFA_PATH}/totp/activate`, { code: totpCode(secret) }), 403, 'AUTH_006');
    expect((await mfaSummary(ctx)).enrollments, 'a refused activation must leave the enrolment pending').toEqual([]);

    const wrong = await identityMutate(ctx, 'post', `${MFA_PATH}/totp/activate`, { code: authenticator.wrongCode() });
    expect(wrong.status()).toBe(401);
    await expectErrorCode(wrong, 'MFA_002');

    const activate = await identityMutate(ctx, 'post', `${MFA_PATH}/totp/activate`, { code: await authenticator.nextCode() });
    expect(activate.status(), await activate.text()).toBe(200);
    expect(await activate.json()).toMatchObject({ success: true });
    const summary = await mfaSummary(ctx);
    expect(summary.enrollments).toEqual([expect.objectContaining({ type: 'TOTP', label: 'default' })]);
    expect(summary.recoveryCodesRemaining).toBe(10);
    expect(await enrolmentRows(user.userId)).toEqual([expect.objectContaining({ kekVersion: 1, verified: true })]);
    expect((await (await identity.anonymous()).get(MFA_PATH)).status()).toBe(401);

    await expectRefused(await identityMutate(unelevated, 'delete', `${MFA_PATH}/totp`), 403, 'AUTH_006');
    expect((await mfaSummary(ctx)).enrollments, 'a refused removal must keep the factor').toHaveLength(1);

    const removed = await identityMutate(ctx, 'delete', `${MFA_PATH}/totp`);
    expect(removed.status()).toBe(200);
    expect(await removed.json()).toEqual({ success: true });
    expect((await mfaSummary(ctx)).enrollments).toEqual([]);
    expect(await enrolmentRows(user.userId)).toEqual([]);
  });
});

test.describe('identity MFA — TOTP at login', () => {
  test('should complete a login on the password alone for an account with no factor', async ({ identity }) => {
    const user = await identity.createUser({ label: 'no-factor' });

    const { flowId, response } = await signInWithPassword(await identity.anonymous(), user.email, user.password);
    expect(response.status()).toBe(200);
    expect(await flowStepOf(response)).toEqual({ flowId, status: 'COMPLETED' });
    const row = await findSessionBySecret(expectSessionCookie(response));
    expect(row).toMatchObject({ userId: user.userId, status: 'ACTIVE', aal: 'AAL1', elevatedUntil: null });
  });

  test('should demand the TOTP after the password, count a wrong code, complete at AAL2 and refuse the same code on the next login', async ({ identity }) => {
    const user = await identity.createUser({ label: 'totp-login' });
    const { authenticator } = await enrollTotp((await identity.signIn(user, { aal: 'AAL2' })).ctx);

    const ctx = await identity.anonymous();
    const flowId = await passwordToTotpStep(ctx, user);
    await expectMfaFailure(await verifyChallenge(ctx, { flowId, code: authenticator.wrongCode() }), flowId, 2);
    expect(await failedMfaEvents(user.userId)).toBe(1);

    const code = await authenticator.nextCode();
    const completed = await verifyChallenge(ctx, { flowId, code });
    expect(completed.status(), await completed.text()).toBe(200);
    expect(await flowStepOf(completed)).toEqual({ flowId, status: 'COMPLETED' });
    const row = await findSessionBySecret(expectSessionCookie(completed));
    expect(row).toMatchObject({ userId: user.userId, status: 'ACTIVE', aal: 'AAL2' });
    expect(row?.elevatedUntil?.getTime() ?? 0, 'an MFA login grants a live elevation').toBeGreaterThan(Date.now());

    const replayCtx = await identity.anonymous();
    const replayFlowId = await passwordToTotpStep(replayCtx, user);
    await expectMfaFailure(await verifyChallenge(replayCtx, { flowId: replayFlowId, code }), replayFlowId, 2);
    expect(await activeSessionCount(user.userId), 'a replayed code must not mint a session').toBe(2);
  });

  test('should refuse a valid TOTP with AUTH_012 once an OTP-only lock lands after the password step', async ({ identity }) => {
    const user = await identity.createUser({ label: 'totp-otp-lock' });
    const { authenticator } = await enrollTotp((await identity.signIn(user, { aal: 'AAL2' })).ctx);
    const ctx = await identity.anonymous();
    const flowId = await passwordToTotpStep(ctx, user);

    await identityDb()`UPDATE users SET lock_mode = 'OTP_ONLY', locked_until = ${new Date(Date.now() + HOUR_MS)} WHERE id = ${user.userId}`;
    const verify = await verifyChallenge(ctx, { flowId, code: await authenticator.nextCode() });
    await expectRefused(verify, 403, 'AUTH_012');
    expectNoSessionCookie(verify);
    expect(await activeSessionCount(user.userId), 'only the enrolment session may exist').toBe(1);
  });

  test('should lock the account to OTP-only on the fifth failed MFA flow inside fifteen minutes', async ({ identity }) => {
    const user = await identity.createUser({ label: 'mfa-lockout' });
    const { authenticator } = await enrollTotp((await identity.signIn(user, { aal: 'AAL2' })).ctx);
    const ctx = await identity.anonymous();

    let lastFlowId = '';
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect((await lockOf(user.userId)).lockMode, `still unlocked before failure ${attempt}`).toBe('NONE');
      lastFlowId = await passwordToTotpStep(ctx, user);
      await expectMfaFailure(await verifyChallenge(ctx, { flowId: lastFlowId, code: authenticator.wrongCode() }), lastFlowId, 2);
    }

    const lock = await lockOf(user.userId);
    expect(lock.lockMode).toBe('OTP_ONLY');
    expect(Math.abs((lock.lockedUntil?.getTime() ?? 0) - (Date.now() + LOCK_WINDOW_MS)), 'locked for the fifteen-minute window').toBeLessThan(60_000);

    const afterLock = await verifyChallenge(ctx, { flowId: lastFlowId, code: await authenticator.nextCode() });
    await expectRefused(afterLock, 403, 'AUTH_012');
    expectNoSessionCookie(afterLock);
  });
});

test.describe('identity MFA — step-up', () => {
  test('should offer step-up methods by the factors the account holds', async ({ identity }) => {
    const methodsOf = async (user: IdentityUser): Promise<unknown> => {
      const response = await (await identity.signIn(user)).ctx.get(`${MFA_PATH}/step-up/methods`);
      expect(response.status()).toBe(200);
      return ((await response.json()) as { methods: unknown }).methods;
    };

    const passwordOnly = await identity.createUser({ label: 'stepup-password' });
    expect(await methodsOf(passwordOnly)).toEqual(['PASSWORD']);

    const totp = await identity.createUser({ label: 'stepup-totp' });
    await enrollTotp((await identity.signIn(totp, { aal: 'AAL2' })).ctx);
    expect(await methodsOf(totp)).toEqual(['TOTP']);

    const passwordless = await identity.createUser({ label: 'stepup-none', withPassword: false });
    expect(await methodsOf(passwordless)).toEqual([]);

    const federated = await identity.createUser({ label: 'stepup-federated', withPassword: false });
    await linkFederatedIdentity(federated);
    expect(await methodsOf(federated)).toEqual(['FEDERATED']);
  });

  test('should elevate a TOTP account only with a fresh TOTP, refusing a wrong code and even the correct password', async ({ identity }) => {
    const user = await identity.createUser({ label: 'stepup-totp-only' });
    const { authenticator } = await enrollTotp((await identity.signIn(user, { aal: 'AAL2' })).ctx);
    const { session, ctx } = await identity.signIn(user);

    await expectRefused(await stepUp(ctx, { code: authenticator.wrongCode() }), 401, 'MFA_002');
    await expectRefused(await stepUp(ctx, { password: user.password }), 401, 'MFA_002');
    expect(await isElevated(session.sessionId)).toBe(false);
    await expectRefused(await identityMutate(ctx, 'post', `${MFA_PATH}/recovery-codes`), 403, 'AUTH_006');

    const elevated = await stepUp(ctx, { code: await authenticator.nextCode() });
    expect(elevated.status(), await elevated.text()).toBe(200);
    const body = (await elevated.json()) as { aal: string; elevatedUntil: string };
    expect(body.aal).toBe('AAL2');
    expect(Date.parse(body.elevatedUntil)).toBeGreaterThan(Date.now());
    expect(await isElevated(session.sessionId)).toBe(true);
    expect((await identityMutate(ctx, 'post', `${MFA_PATH}/recovery-codes`)).status(), 'the elevation unlocks elevated routes').toBe(200);
  });

  test('should elevate an account with no factor on its password and refuse a wrong one', async ({ identity }) => {
    const user = await identity.createUser({ label: 'stepup-password-only' });
    const { session, ctx } = await identity.signIn(user);

    await expectRefused(await stepUp(ctx, { password: 'Not-The-Password-9a' }), 401, 'AUTH_003');
    expect(await isElevated(session.sessionId)).toBe(false);

    const elevated = await stepUp(ctx, { password: user.password });
    expect(elevated.status(), await elevated.text()).toBe(200);
    expect(await elevated.json()).toMatchObject({ aal: 'AAL2' });
    expect(await isElevated(session.sessionId)).toBe(true);
  });

  test('should name the application behind a step-up intent without confirming an unknown client', async ({ identity }) => {
    const application = await identity.createOAuthApp('stepup-intent');
    const { ctx } = await identity.signIn(await identity.createUser({ label: 'stepup-intent' }));
    const intentPath = (clientId: string): string => `${MFA_PATH}/step-up/intent?clientId=${encodeURIComponent(clientId)}`;

    const known = await ctx.get(intentPath(application.serviceClient.clientId));
    expect(known.status()).toBe(200);
    expect(await known.json()).toEqual({ applicationName: application.name });

    const unknown = await ctx.get(intentPath(`e2e-unknown-${Date.now().toString(36)}`));
    expect(unknown.status()).toBe(200);
    expect(await unknown.json()).toEqual({});

    expect((await (await identity.anonymous()).get(intentPath(application.serviceClient.clientId))).status()).toBe(401);
  });
});

test.describe('identity MFA — recovery codes', () => {
  test('should issue ten distinct recovery codes on the first activation and keep only argon2id hashes', async ({ identity }) => {
    const user = await identity.createUser({ label: 'recovery-issue' });
    const { recoveryCodes } = await enrollTotp((await identity.signIn(user, { aal: 'AAL2' })).ctx);

    expect(recoveryCodes).toHaveLength(10);
    for (const code of recoveryCodes) expect(code).toMatch(RECOVERY_CODE_SHAPE);
    expect(new Set(recoveryCodes).size).toBe(10);

    const rows = await recoveryCodeRows(user.userId);
    expect(rows).toHaveLength(10);
    for (const row of rows) {
      expect(row).toMatchObject({ generation: 1, used: false });
      expect(row.codeHash).toMatch(/^\$argon2id\$/);
      for (const code of recoveryCodes) expect(row.codeHash).not.toContain(code.replace('-', ''));
    }
  });

  test('should accept a recovery code once at login, notify its use and retire the whole batch on regeneration', async ({ identity }) => {
    const user = await identity.createUser({ label: 'recovery-use' });
    const { ctx: elevated } = await identity.signIn(user, { aal: 'AAL2' });
    const { recoveryCodes } = await enrollTotp(elevated);
    const [firstCode = '', unusedOldCode = ''] = recoveryCodes;
    const notifiedBefore = await maxOutboxId(user.email, RECOVERY_CODE_USED_TEMPLATE);

    const ctx = await identity.anonymous();
    const flowId = await passwordToTotpStep(ctx, user);
    const completed = await verifyChallenge(ctx, { flowId, recoveryCode: firstCode });
    expect(completed.status(), await completed.text()).toBe(200);
    expect(await flowStepOf(completed)).toEqual({ flowId, status: 'COMPLETED' });
    expect(await findSessionBySecret(expectSessionCookie(completed))).toMatchObject({ aal: 'AAL2' });
    const [event] = await identityDb()<{ status: string; mfaModeUsed: string | null }[]>`
      SELECT status, mfa_mode_used AS "mfaModeUsed" FROM user_sign_in_events WHERE id = ${flowId.replace(/^flow_auth_/, '')}
    `;
    expect(event).toEqual({ status: 'SUCCESS', mfaModeUsed: 'RECOVERY_CODE' });
    await pollOutboxRowAfter(user.email, RECOVERY_CODE_USED_TEMPLATE, notifiedBefore);
    expect((await recoveryCodeRows(user.userId)).filter(row => row.used)).toHaveLength(1);

    const retryCtx = await identity.anonymous();
    const retryFlowId = await passwordToTotpStep(retryCtx, user);
    await expectMfaFailure(await verifyChallenge(retryCtx, { flowId: retryFlowId, recoveryCode: firstCode }), retryFlowId, 2);

    const { ctx: unelevated } = await identity.signIn(user);
    await expectRefused(await identityMutate(unelevated, 'post', `${MFA_PATH}/recovery-codes`), 403, 'AUTH_006');
    expect(await recoveryCodeRows(user.userId), 'a refused regeneration must keep the batch').toHaveLength(10);

    const regenerated = await identityMutate(elevated, 'post', `${MFA_PATH}/recovery-codes`);
    expect(regenerated.status(), await regenerated.text()).toBe(200);
    const { recoveryCodes: freshCodes } = (await regenerated.json()) as { recoveryCodes: string[] };
    expect(freshCodes).toHaveLength(10);
    expect(freshCodes.filter(code => recoveryCodes.includes(code))).toEqual([]);
    const rows = await recoveryCodeRows(user.userId);
    expect(rows).toHaveLength(10);
    for (const row of rows) expect(row).toMatchObject({ generation: 2, used: false });

    await expectMfaFailure(await verifyChallenge(retryCtx, { flowId: retryFlowId, recoveryCode: unusedOldCode }), retryFlowId, 1);
    const withFresh = await verifyChallenge(retryCtx, { flowId: retryFlowId, recoveryCode: freshCodes[0] ?? '' });
    expect(withFresh.status(), await withFresh.text()).toBe(200);
    expect(await flowStepOf(withFresh)).toEqual({ flowId: retryFlowId, status: 'COMPLETED' });
    expectSessionCookie(withFresh);
  });
});
