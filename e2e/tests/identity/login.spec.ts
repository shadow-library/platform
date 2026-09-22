/**
 * Importing npm packages
 */
import { randomBytes, randomInt } from 'node:crypto';

import { type APIResponse, type Page, type Response } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  changeChallenge,
  enrollTotp,
  findSetCookie,
  type FlowStepBody,
  identityDb,
  loginInit,
  patchAuthFlow,
  PERSONAS,
  requireProductUrl,
  resendChallenge,
  signInWithPassword,
  startLogin,
  useClientIp,
  verifyChallenge,
} from '../../lib';
import { expect, test } from './fixtures';
import { expectErrorCode, maxOutboxId, pollOtp } from './helpers';

/**
 * Defining types
 */

interface ErrorBody {
  code?: string;
  flowId?: string;
  fields?: { field: string; msg: string }[];
}

/**
 * Declaring the constants
 *
 * The UI tests drive identity's hosted multi-step `/login` page; the API tests pin the flow contract behind it. Every test runs
 * under its own client address, so per-IP budgets, failure tallies and IP blocks never leak between tests or into the rest of
 * the suite. Anything that fails a credential does so on a factory user: five failures in fifteen minutes lock an account to
 * OTP-only, which would break every spec that signs in as a persona.
 */

const HAPPY = PERSONAS.user2;
const SUSPENDED = PERSONAS.suspended;
const LOCKED = PERSONAS.locked;
const LOGIN_OTP_TEMPLATE = 'auth.login.otp';
const SESSION_COOKIE = '__Host-sid';
const HOUR_MS = 60 * 60 * 1000;
const MALFORMED_IDENTIFIERS = ['not-an-email@', 'john@doe', 'a@@b.com', 'has space@example.com', '+0123', ''];

async function submitIdentifier(page: Page, identifier: string): Promise<Response> {
  await page.getByLabel('Email or phone').fill(identifier);
  const initResponse = page.waitForResponse(response => response.url().includes('/api/v1/auth/login/init'));
  await page.getByRole('button', { name: 'Continue' }).click();
  return initResponse;
}

async function flowBody(response: APIResponse): Promise<FlowStepBody> {
  return (await response.json()) as FlowStepBody;
}

function expectNoSessionCookie(response: APIResponse): void {
  expect(findSetCookie(response, SESSION_COOKIE), 'no session cookie may be issued').toBeUndefined();
}

function expectSessionCookie(response: APIResponse): void {
  expect(findSetCookie(response, SESSION_COOKIE)?.value, 'a completed login sets __Host-sid').toBeTruthy();
}

async function expectRefusedAtInit(response: APIResponse, status: number, code: string): Promise<void> {
  const body = (await response.json()) as ErrorBody;
  expect(response.status(), JSON.stringify(body)).toBe(status);
  expect(body.code).toBe(code);
  expect(body.flowId, 'a refused login/init must not open a flow').toBeUndefined();
}

async function activeSessionCount(userId: string): Promise<number> {
  const [row] = await identityDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM user_sessions WHERE user_id = ${userId} AND status = 'ACTIVE'`;
  return row?.count ?? 0;
}

async function outboxRowCount(email: string): Promise<number> {
  const [row] = await identityDb()<{ count: number }[]>`
    SELECT count(*)::int AS count FROM notification_outbox WHERE ((recipients #>> '{}')::jsonb) ->> 'email' = ${email}
  `;
  return row?.count ?? 0;
}

async function setLock(userId: string, lockMode: 'NONE' | 'OTP_ONLY' | 'FULL', lockedUntil: Date | null): Promise<void> {
  await identityDb()`UPDATE users SET lock_mode = ${lockMode}::user_lock_mode, locked_until = ${lockedUntil} WHERE id = ${userId}`;
}

test.describe('identity login UI', () => {
  test.beforeEach(async ({ context, identity }) => {
    await useClientIp(context, identity.clientIp);
  });

  test('should sign a user in through the UI and then sign them out', async ({ page }) => {
    const identityUrl = requireProductUrl('identity');

    await page.goto(`${identityUrl}/login`);
    expect((await submitIdentifier(page, HAPPY.email)).status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Enter your password' })).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill(HAPPY.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/account\/?$/);
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    const signedInCookies = await page.context().cookies(identityUrl);
    expect(signedInCookies.find(cookie => cookie.name === 'isLoggedIn')?.value, 'isLoggedIn flag cookie should be set after sign-in').toBe('true');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
    const afterCookies = await page.context().cookies(identityUrl);
    expect(afterCookies.find(cookie => cookie.name === 'isLoggedIn')?.value ?? '', 'isLoggedIn flag should be cleared after sign-out').not.toBe('true');

    await page.goto(`${identityUrl}/account`);
    await expect(page).toHaveURL(/\/login/);
  });

  test('should reject a wrong password and surface the remaining-attempts count', async ({ page, identity }) => {
    const identityUrl = requireProductUrl('identity');
    const user = await identity.createUser({ label: 'ui-wrong-pw' });

    await page.goto(`${identityUrl}/login`);
    expect((await submitIdentifier(page, user.email)).status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Enter your password' })).toBeVisible();

    await page.getByLabel('Password', { exact: true }).fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(/attempts? left/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Enter your password' })).toBeVisible();
    const cookies = await page.context().cookies(identityUrl);
    expect(cookies.find(cookie => cookie.name === 'isLoggedIn')?.value ?? '').not.toBe('true');
  });

  test('should refuse sign-in for a suspended account without prompting for a password', async ({ page }) => {
    const identityUrl = requireProductUrl('identity');

    await page.goto(`${identityUrl}/login`);
    expect((await submitIdentifier(page, SUSPENDED.email)).status(), 'a suspended account must be refused at login/init').toBe(403);

    await expect(page.getByText(/suspended/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Enter your password' })).toHaveCount(0);
  });

  test('should refuse sign-in for a FULL-locked account at the identifier step without prompting for a password', async ({ page }) => {
    const identityUrl = requireProductUrl('identity');

    // identity-web has no dedicated copy for AUTH_012 and shows the server's message.
    await page.goto(`${identityUrl}/login`);
    const init = await submitIdentifier(page, LOCKED.email);
    expect(init.status(), 'a FULL-locked account must be refused at login/init').toBe(403);
    const body = (await init.json()) as ErrorBody;
    expect(body.code).toBe('AUTH_012');
    expect(body.flowId, 'a refused login/init must not open a flow').toBeUndefined();

    await expect(page.getByText('Account is locked')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Enter your password' })).toHaveCount(0);
    const cookies = await page.context().cookies(identityUrl);
    expect(cookies.find(cookie => cookie.name === 'isLoggedIn')?.value ?? '').not.toBe('true');
  });
});

test.describe('identity login API — account state', () => {
  test('should refuse a FULL-locked account at init and at OTP completion, and admit it once the lock lapses', async ({ identity }) => {
    await expectRefusedAtInit(await loginInit(await identity.anonymous(), LOCKED.email), 403, 'AUTH_012');

    const user = await identity.createUser({ label: 'full-lock' });
    const midFlow = await identity.anonymous();
    const flowId = await startLogin(midFlow, user.email);
    expect((await changeChallenge(midFlow, flowId, 'EMAIL_OTP')).status()).toBe(200);
    const code = await pollOtp(user.email, LOGIN_OTP_TEMPLATE);

    await setLock(user.userId, 'FULL', new Date(Date.now() + HOUR_MS));
    const verify = await verifyChallenge(midFlow, { flowId, code });
    expect(verify.status()).toBe(403);
    await expectErrorCode(verify, 'AUTH_012');
    expectNoSessionCookie(verify);
    expect(await activeSessionCount(user.userId), 'a lock applied mid-flow must not let the flow mint a session').toBe(0);

    await setLock(user.userId, 'FULL', new Date(Date.now() - 1000));
    const lapsed = await signInWithPassword(await identity.anonymous(), user.email, user.password);
    expect(lapsed.response.status()).toBe(200);
    expect((await flowBody(lapsed.response)).status).toBe('COMPLETED');
    expectSessionCookie(lapsed.response);
  });

  test('should pin the identifier step contract for valid, malformed, unknown and barred identifiers', async ({ identity }) => {
    const ctx = await identity.anonymous();
    const username = `e2e_${randomBytes(6).toString('hex')}`;
    const user = await identity.createUser({ label: 'init-contract', username });

    const init = await loginInit(ctx, user.email);
    expect(init.status()).toBe(200);
    const initBody = await flowBody(init);
    expect(initBody).toEqual({ flowId: expect.stringMatching(/\S/) as unknown, status: 'AWAITING_PASSWORD', hasAlternativeMethods: true });

    for (const identifier of MALFORMED_IDENTIFIERS) {
      const response = await loginInit(ctx, identifier);
      const body = (await response.json()) as ErrorBody;
      expect(response.status(), `identifier ${JSON.stringify(identifier)}`).toBe(422);
      expect(body.fields, `identifier ${JSON.stringify(identifier)}`).toEqual([{ field: 'body.identifier', msg: 'must be a valid email address, phone number, or username' }]);
      expect(body.flowId).toBeUndefined();
    }

    const byUsername = await loginInit(ctx, username);
    expect(byUsername.status()).toBe(200);
    expect((await flowBody(byUsername)).status).toBe('AWAITING_PASSWORD');

    await expectRefusedAtInit(await loginInit(ctx, `+1999${randomInt(1_000_000, 9_999_999)}`), 404, 'AUTH_008');

    const unknownEmail = `e2e.unknown.${randomBytes(6).toString('hex')}@shadow-apps.test`;
    await expectRefusedAtInit(await loginInit(ctx, unknownEmail), 404, 'AUTH_008');
    expect(await outboxRowCount(unknownEmail), 'nothing may be sent to an address with no account').toBe(0);

    const barred = [
      { status: 'BLOCKED', code: 'AUTH_009' },
      { status: 'DISABLED', code: 'AUTH_011' },
      { status: 'SUSPENDED', code: 'AUTH_010' },
    ] as const;
    for (const { status, code } of barred) {
      const barredUser = await identity.createUser({ label: `init-${status.toLowerCase()}`, status });
      await expectRefusedAtInit(await loginInit(ctx, barredUser.email), 403, code);
    }
  });

  test('should count down password attempts on one flow and kill the flow on the third failure', async ({ identity }) => {
    const ctx = await identity.anonymous();
    const user = await identity.createUser({ label: 'pw-budget' });
    const flowId = await startLogin(ctx, user.email);

    for (const attemptsLeft of [2, 1]) {
      const wrong = await verifyChallenge(ctx, { flowId, password: `Wrong-${randomBytes(4).toString('hex')}-9a` });
      expect(wrong.status()).toBe(401);
      expect(await flowBody(wrong)).toEqual({ flowId, status: 'AWAITING_PASSWORD', attemptsLeft });
      expectNoSessionCookie(wrong);
    }

    const third = await verifyChallenge(ctx, { flowId, password: 'Wrong-final-attempt-9a' });
    expect(third.status()).toBe(410);
    await expectErrorCode(third, 'AUTH_004');

    const correctOnDeadFlow = await verifyChallenge(ctx, { flowId, password: user.password });
    expect(correctOnDeadFlow.status(), 'the right password must not revive a terminated flow').toBe(410);
    expectNoSessionCookie(correctOnDeadFlow);
    expect(await activeSessionCount(user.userId)).toBe(0);
  });

  test('should let a user whose suspension has lapsed sign in and restore the account to ACTIVE', async ({ identity }) => {
    const user = await identity.createUser({ label: 'lapsed-suspension', status: 'SUSPENDED', statusUntil: new Date(Date.now() - 60_000) });

    const signIn = await signInWithPassword(await identity.anonymous(), user.email, user.password);
    expect(signIn.response.status()).toBe(200);
    expect((await flowBody(signIn.response)).status).toBe('COMPLETED');
    expectSessionCookie(signIn.response);

    const [row] = await identityDb()<{ status: string; statusUntil: Date | null }[]>`SELECT status, status_until AS "statusUntil" FROM users WHERE id = ${user.userId}`;
    expect(row).toEqual({ status: 'ACTIVE', statusUntil: null });
  });

  test('should hold an admin-forced reset at AWAITING_PASSWORD_RESET until the current password re-proves and a new one is set', async ({ identity }) => {
    const user = await identity.createUser({ label: 'forced-reset', passwordResetRequired: true });
    const newPassword = `E2e-Reset-${randomBytes(6).toString('hex')}-9Ab`;
    const ctx = await identity.anonymous();

    const { flowId, response: passwordStep } = await signInWithPassword(ctx, user.email, user.password);
    expect(passwordStep.status()).toBe(200);
    expect(await flowBody(passwordStep)).toEqual({ flowId, status: 'AWAITING_PASSWORD_RESET' });
    expectNoSessionCookie(passwordStep);

    const wrongCurrent = await ctx.post('/api/v1/auth/login/reset-password', { data: { flowId, currentPassword: 'Not-The-Current-9a', newPassword } });
    expect(wrongCurrent.status()).toBe(401);
    expect(await flowBody(wrongCurrent)).toEqual({ flowId, status: 'AWAITING_PASSWORD_RESET', attemptsLeft: 2 });
    expectNoSessionCookie(wrongCurrent);
    expect(await activeSessionCount(user.userId)).toBe(0);

    const reset = await ctx.post('/api/v1/auth/login/reset-password', { data: { flowId, currentPassword: user.password, newPassword } });
    expect(reset.status(), await reset.text()).toBe(200);
    expect(await flowBody(reset)).toEqual({ flowId, status: 'COMPLETED' });
    expectSessionCookie(reset);

    const withNewPassword = await signInWithPassword(await identity.anonymous(), user.email, newPassword);
    expect(withNewPassword.response.status()).toBe(200);
    expect((await flowBody(withNewPassword.response)).status, 'the reset requirement must be cleared once a new password is set').toBe('COMPLETED');
    expectSessionCookie(withNewPassword.response);
  });

  test('should refuse even the correct password under an OTP_ONLY lock but complete through the email OTP', async ({ identity }) => {
    const user = await identity.createUser({ label: 'otp-only', lockMode: 'OTP_ONLY', lockedUntil: new Date(Date.now() + HOUR_MS) });
    const ctx = await identity.anonymous();

    const init = await loginInit(ctx, user.email);
    expect(init.status()).toBe(200);
    const flowId = (await flowBody(init)).flowId as string;

    const password = await verifyChallenge(ctx, { flowId, password: user.password });
    expect(password.status()).toBe(401);
    expect(await flowBody(password)).toEqual({ flowId, status: 'AWAITING_PASSWORD', attemptsLeft: 2 });
    expectNoSessionCookie(password);

    expect((await changeChallenge(ctx, flowId, 'EMAIL_OTP')).status()).toBe(200);
    const otp = await verifyChallenge(ctx, { flowId, code: await pollOtp(user.email, LOGIN_OTP_TEMPLATE) });
    expect(otp.status()).toBe(200);
    expect(await flowBody(otp)).toEqual({ flowId, status: 'COMPLETED' });
    expectSessionCookie(otp);
  });
});

test.describe('identity login API — challenges', () => {
  test('should offer the email OTP for an email identifier and complete the login with the emailed code', async ({ identity }) => {
    const user = await identity.createUser({ label: 'email-otp' });
    const ctx = await identity.anonymous();
    const flowId = await startLogin(ctx, user.email);

    const methods = await ctx.get(`/api/v1/auth/challenge/methods?flowId=${encodeURIComponent(flowId)}`);
    expect(methods.status()).toBe(200);
    const { methods: offered } = (await methods.json()) as { methods: { name: string }[] };
    expect(offered.map(method => method.name)).toEqual(['PASSWORD', 'WEBAUTHN', 'EMAIL_OTP']);

    const change = await changeChallenge(ctx, flowId, 'EMAIL_OTP');
    expect(change.status()).toBe(200);
    const changed = await flowBody(change);
    expect(changed).toMatchObject({ flowId, status: 'AWAITING_EMAIL_OTP', resendsLeft: 3 });
    const maskedEmail = changed.metadata?.maskedEmail ?? '';
    expect(maskedEmail).toContain('@');
    expect(maskedEmail, 'the address must be masked').not.toBe(user.email);

    const verify = await verifyChallenge(ctx, { flowId, code: await pollOtp(user.email, LOGIN_OTP_TEMPLATE) });
    expect(verify.status()).toBe(200);
    expect(await flowBody(verify)).toEqual({ flowId, status: 'COMPLETED' });
    expectSessionCookie(verify);
  });

  test('should still demand the enrolled TOTP after an email-OTP first factor', async ({ identity }) => {
    const user = await identity.createUser({ label: 'otp-then-totp' });
    const { ctx: elevated } = await identity.signIn(user, { aal: 'AAL2' });
    await enrollTotp(elevated);

    const ctx = await identity.anonymous();
    const flowId = await startLogin(ctx, user.email);
    expect((await changeChallenge(ctx, flowId, 'EMAIL_OTP')).status()).toBe(200);
    const verify = await verifyChallenge(ctx, { flowId, code: await pollOtp(user.email, LOGIN_OTP_TEMPLATE) });

    expect(verify.status()).toBe(200);
    expect(await flowBody(verify)).toEqual({ flowId, status: 'AWAITING_TOTP' });
    expectNoSessionCookie(verify);
    expect(await activeSessionCount(user.userId), 'only the enrolment session may exist').toBe(1);
  });

  test('should end a cancelled flow and answer 410 for it and for an unknown flow', async ({ identity }) => {
    const user = await identity.createUser({ label: 'cancel-flow' });
    const ctx = await identity.anonymous();
    const flowId = await startLogin(ctx, user.email);

    const cancel = await ctx.post('/api/v1/auth/cancel', { data: { flowId } });
    expect(cancel.status()).toBe(204);

    const afterCancel = await verifyChallenge(ctx, { flowId, password: user.password });
    expect(afterCancel.status()).toBe(410);
    await expectErrorCode(afterCancel, 'AUTH_001');
    expectNoSessionCookie(afterCancel);

    const cancelledFlow = await ctx.get(`/api/v1/auth/flow/${encodeURIComponent(flowId)}`);
    expect(cancelledFlow.status()).toBe(410);

    const unknown = await ctx.get(`/api/v1/auth/flow/flow_auth_${randomBytes(8).toString('hex')}`);
    expect(unknown.status()).toBe(410);
    await expectErrorCode(unknown, 'AUTH_001');
  });

  test('should hold OTP resends to a 60 s cooldown and a per-flow budget', async ({ identity }) => {
    const user = await identity.createUser({ label: 'otp-resend' });
    const ctx = await identity.anonymous();
    const flowId = await startLogin(ctx, user.email);
    expect((await changeChallenge(ctx, flowId, 'EMAIL_OTP')).status()).toBe(200);
    await pollOtp(user.email, LOGIN_OTP_TEMPLATE);

    await patchAuthFlow(flowId, { lastOtpSentAt: Date.now() - 61_000 });
    const beforeResend = await maxOutboxId(user.email, LOGIN_OTP_TEMPLATE);
    const resent = await resendChallenge(ctx, flowId, 'EMAIL_OTP');
    expect(resent.status()).toBe(200);
    expect(await resent.json()).toMatchObject({ status: 'SENT', resendsLeft: 2 });
    expect(await maxOutboxId(user.email, LOGIN_OTP_TEMPLATE), 'a resend must enqueue a new OTP').toBeGreaterThan(beforeResend);

    const cooling = await resendChallenge(ctx, flowId, 'EMAIL_OTP');
    expect(cooling.status()).toBe(429);
    expect(await cooling.json()).toMatchObject({ status: 'LIMITED' });
    const retryAfter = Number(cooling.headers()['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);

    await patchAuthFlow(flowId, { lastOtpSentAt: Date.now() - 61_000, resendsLeft: 0 });
    const beforeExhausted = await maxOutboxId(user.email, LOGIN_OTP_TEMPLATE);
    const exhausted = await resendChallenge(ctx, flowId, 'EMAIL_OTP');
    expect(exhausted.status()).toBe(429);
    expect(await exhausted.json()).toMatchObject({ status: 'LIMITED' });
    expect(Number(exhausted.headers()['retry-after'])).toBeGreaterThan(0);
    expect(await maxOutboxId(user.email, LOGIN_OTP_TEMPLATE), 'an exhausted budget must not send').toBe(beforeExhausted);
  });
});
