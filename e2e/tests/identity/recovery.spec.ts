/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { enrollTotp, findSessionBySecret, readSessionStatus, recoverInit, recoverReset, registerInit, signInWithPassword, uniqueEmail, verifyChallenge } from '../../lib';
import { expect, test } from './fixtures';
import { countOutboxRows, expectErrorCode, expectNoSessionCookie, expectSessionCookie, flowChallenges, flowStepOf, pollOtp } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Password recovery: an emailed code, the TOTP when the account has one, then a new password that ends every other session.
 * `recover/init` is limited to five per hour per client address, so every test runs on its own address and spends at most two.
 */

const RECOVERY_OTP_TEMPLATE = 'auth.recovery.otp';
const REGISTER_OTP_TEMPLATE = 'auth.register.otp';
const ME_PATH = '/api/v1/me';

function newPassword(): string {
  return `E2e-Recover-${randomBytes(6).toString('hex')}-9Ab`;
}

/** `recover/init` then the emailed code; the caller asserts on the step the code leads to. */
async function recoverWithEmailCode(ctx: APIRequestContext, email: string): Promise<{ flowId: string; status?: string }> {
  const init = await recoverInit(ctx, email);
  expect(init.status(), await init.text()).toBe(200);
  const { flowId = '' } = await flowStepOf(init);
  const verify = await verifyChallenge(ctx, { flowId, code: await pollOtp(email, RECOVERY_OTP_TEMPLATE) });
  expect(verify.status(), await verify.text()).toBe(200);
  return { flowId, status: (await flowStepOf(verify)).status };
}

/** Registers an account through the real flow, so its credential carries whatever history registration records. */
async function registerAccount(ctx: APIRequestContext, email: string, password: string): Promise<void> {
  const init = await registerInit(ctx, email);
  expect(init.status(), await init.text()).toBe(200);
  const { flowId = '' } = await flowStepOf(init);
  const verify = await verifyChallenge(ctx, { flowId, code: await pollOtp(email, REGISTER_OTP_TEMPLATE) });
  expect(verify.status(), await verify.text()).toBe(200);
  await ctx.post('/api/v1/auth/register/demographics', { data: { flowId } });
  await ctx.post('/api/v1/auth/register/profile', { data: { flowId, firstName: 'Rita', lastName: 'Recover' } });
  const set = await ctx.post('/api/v1/auth/register/password', { data: { flowId, password } });
  expect(set.status(), await set.text()).toBe(200);
}

// Every TOTP activation and recovery-code check is a batch of argon2id hashes, which runs slow while the rest of the suite shares the server.
test.describe.configure({ timeout: 60_000 });

test.describe('identity password recovery', () => {
  test('should reset a forgotten password through the emailed code, end every earlier session and swap which password signs in', async ({ identity }) => {
    const user = await identity.createUser({ label: 'recover' });
    const earlier = [await identity.signIn(user), await identity.signIn(user, { aal: 'AAL2' })];
    expect((await earlier[0]?.ctx.get(ME_PATH))?.status(), 'the earlier session is live and cached').toBe(200);
    const password = newPassword();

    const ctx = await identity.anonymous();
    const init = await recoverInit(ctx, user.email);
    expect(init.status()).toBe(200);
    const initBody = await flowStepOf(init);
    expect(initBody).toEqual({
      flowId: expect.stringMatching(/\S/) as unknown,
      status: 'AWAITING_EMAIL_OTP',
      resendsLeft: 3,
      metadata: { maskedEmail: expect.any(String) as unknown },
    });
    expect(initBody.metadata?.maskedEmail, 'the address must be masked').not.toBe(user.email);
    const flowId = initBody.flowId ?? '';

    const verify = await verifyChallenge(ctx, { flowId, code: await pollOtp(user.email, RECOVERY_OTP_TEMPLATE) });
    expect(verify.status()).toBe(200);
    expect(await flowStepOf(verify)).toEqual({ flowId, status: 'AWAITING_NEW_PASSWORD' });
    expectNoSessionCookie(verify);

    const reset = await recoverReset(ctx, flowId, password);
    expect(reset.status(), await reset.text()).toBe(200);
    expect(await flowStepOf(reset)).toEqual({ flowId, status: 'COMPLETED' });
    expect(await findSessionBySecret(expectSessionCookie(reset))).toMatchObject({ userId: user.userId, status: 'ACTIVE', aal: 'AAL1' });
    expect((await ctx.get(ME_PATH)).status(), 'the recovery session signs the user in').toBe(200);

    for (const { session, ctx: earlierCtx } of earlier) {
      expect(await readSessionStatus(session.sessionId)).toBe('TERMINATED');
      expect((await earlierCtx.get(ME_PATH)).status(), 'an earlier session must stop working at once').toBe(401);
    }
    const replayed = await recoverReset(await identity.anonymous(), flowId, newPassword());
    expect(replayed.status(), 'a completed recovery flow must not reset twice').toBe(410);
    await expectErrorCode(replayed, 'AUTH_001');

    const withOld = await signInWithPassword(await identity.anonymous(), user.email, user.password);
    expect(withOld.response.status()).toBe(401);
    expect(await flowStepOf(withOld.response)).toEqual({ flowId: withOld.flowId, status: 'AWAITING_PASSWORD', attemptsLeft: 2 });

    const withNew = await signInWithPassword(await identity.anonymous(), user.email, password);
    expect(withNew.response.status()).toBe(200);
    expect(await flowStepOf(withNew.response)).toEqual({ flowId: withNew.flowId, status: 'COMPLETED' });
  });

  test('should refuse a recovery reset to a recently used password and keep the flow open for another', async ({ identity }) => {
    const user = await identity.createUser({ label: 'recover-reuse' });
    const reused = newPassword();

    const first = await identity.anonymous();
    const { flowId: firstFlowId } = await recoverWithEmailCode(first, user.email);
    expect((await recoverReset(first, firstFlowId, reused)).status()).toBe(200);

    const second = await identity.anonymous();
    const { flowId, status } = await recoverWithEmailCode(second, user.email);
    expect(status).toBe('AWAITING_NEW_PASSWORD');
    const refused = await recoverReset(second, flowId, reused);
    expect(refused.status(), await refused.text()).toBe(422);
    expectNoSessionCookie(refused);

    const accepted = await recoverReset(second, flowId, newPassword());
    expect(accepted.status(), await accepted.text()).toBe(200);
    expectSessionCookie(accepted);
  });

  test('should refuse a recovery reset to the password the account was registered with', async ({ identity }) => {
    const email = uniqueEmail('recover-current');
    const password = newPassword();
    identity.trackUserByEmail(email);
    const registration = await identity.anonymous();
    await registerAccount(registration, email, password);

    const ctx = await identity.anonymous();
    const { flowId } = await recoverWithEmailCode(ctx, email);
    const refused = await recoverReset(ctx, flowId, password);
    expect(refused.status(), await refused.text()).toBe(422);
    expectNoSessionCookie(refused);

    const accepted = await recoverReset(ctx, flowId, newPassword());
    expect(accepted.status(), await accepted.text()).toBe(200);
    expectSessionCookie(accepted);
  });

  test('should answer an unknown identifier like a real one, send nothing and fail every code', async ({ identity }) => {
    const unknownEmail = `e2e.unknown.${randomBytes(6).toString('hex')}@shadow-apps.test`;
    const ctx = await identity.anonymous();

    const init = await recoverInit(ctx, unknownEmail);
    expect(init.status()).toBe(200);
    const initBody = await flowStepOf(init);
    expect(initBody).toEqual({
      flowId: expect.stringMatching(/\S/) as unknown,
      status: 'AWAITING_EMAIL_OTP',
      resendsLeft: 3,
      metadata: { maskedEmail: expect.any(String) as unknown },
    });
    const flowId = initBody.flowId ?? '';
    expect(await countOutboxRows('email', unknownEmail), 'nothing may be sent to an address with no account').toBe(0);
    expect(await flowChallenges(flowId)).toEqual([]);

    const verify = await verifyChallenge(ctx, { flowId, code: '000000' });
    expect(verify.status()).toBe(401);
    expect(await flowStepOf(verify)).toEqual({ flowId, status: 'AWAITING_EMAIL_OTP', attemptsLeft: 2 });
  });
});

test.describe('identity password recovery with TOTP', () => {
  test('should hold a TOTP account at AWAITING_TOTP until a valid TOTP or an unused recovery code is given', async ({ identity }) => {
    const user = await identity.createUser({ label: 'recover-totp' });
    const { authenticator, recoveryCodes } = await enrollTotp((await identity.signIn(user, { aal: 'AAL2' })).ctx);
    const wrongRecoveryCode = 'ZZZZZ-ZZZZZ';
    expect(recoveryCodes).not.toContain(wrongRecoveryCode);

    const withTotp = await identity.anonymous();
    const { flowId: totpFlowId, status: afterOtp } = await recoverWithEmailCode(withTotp, user.email);
    expect(afterOtp).toBe('AWAITING_TOTP');

    const early = await recoverReset(withTotp, totpFlowId, newPassword());
    expect(early.status()).toBe(409);
    await expectErrorCode(early, 'AUTH_002');
    expectNoSessionCookie(early);

    const wrong = await verifyChallenge(withTotp, { flowId: totpFlowId, recoveryCode: wrongRecoveryCode });
    expect(wrong.status()).toBe(401);
    expect(await flowStepOf(wrong)).toEqual({ flowId: totpFlowId, status: 'AWAITING_TOTP', attemptsLeft: 2 });

    const totp = await verifyChallenge(withTotp, { flowId: totpFlowId, code: await authenticator.nextCode() });
    expect(totp.status(), await totp.text()).toBe(200);
    expect(await flowStepOf(totp)).toEqual({ flowId: totpFlowId, status: 'AWAITING_NEW_PASSWORD' });

    const withRecoveryCode = await identity.anonymous();
    const { flowId: codeFlowId, status: codeAfterOtp } = await recoverWithEmailCode(withRecoveryCode, user.email);
    expect(codeAfterOtp).toBe('AWAITING_TOTP');
    const code = await verifyChallenge(withRecoveryCode, { flowId: codeFlowId, recoveryCode: recoveryCodes[0] ?? '' });
    expect(code.status(), await code.text()).toBe(200);
    expect(await flowStepOf(code)).toEqual({ flowId: codeFlowId, status: 'AWAITING_NEW_PASSWORD' });

    const reset = await recoverReset(withRecoveryCode, codeFlowId, newPassword());
    expect(reset.status(), await reset.text()).toBe(200);
    expect(await flowStepOf(reset)).toEqual({ flowId: codeFlowId, status: 'COMPLETED' });
    expectSessionCookie(reset);
  });
});
