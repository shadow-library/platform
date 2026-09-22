/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

/**
 * Importing user defined packages
 */
import { identityDb, registerInit, requireProductUrl, uniqueEmail, useClientIp, verifyChallenge } from '../../lib';
import { expect, test } from './fixtures';
import { countOutboxRows, expectErrorCode, expectSessionCookie, fillOtp, flowChallenges, flowStepOf, pollOtp, uniqueRegistrationEmail } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The UI tests drive the real `/register` screen (email → email OTP → demographics → profile → password); the API tests pin the
 * step guards behind it. OTPs are read back from identity's `notification_outbox` (identity never sends mail in dev). Each test
 * runs on its own client address, so `register/init`'s five-per-hour budget is never shared, and every account a test registers
 * is removed after it.
 */

/** A password that satisfies identity's policy: ≥12 chars, upper + lower, a number (a symbol too, though only recommended). */
const STRONG_PASSWORD = 'E2eReg#Passw0rd!';

/** Deliberately too short and too simple — the server's password policy must reject it at the password step. */
const WEAK_PASSWORD = 'short';

/** The outbox template identity enqueues the registration OTP under; `pollOtp` reads the code from its payload. */
const REGISTER_OTP_TEMPLATE = 'auth.register.otp';

test.describe('identity registration', () => {
  test.beforeEach(async ({ context, identity }) => {
    await useClientIp(context, identity.clientIp);
  });

  test('should register a brand-new account end to end, rejecting a weak password on the way', async ({ page, identity }) => {
    const identityUrl = requireProductUrl('identity');
    const email = uniqueRegistrationEmail();
    identity.trackUserByEmail(email);

    await page.goto(`${identityUrl}/register`);

    // Step 1 — email.
    await page.getByLabel('Email address').fill(email);
    const initResponsePromise = page.waitForResponse(response => response.url().includes('/api/v1/auth/register/init'));
    await page.getByRole('button', { name: 'Continue' }).click();
    const initResponse = await initResponsePromise;
    expect(initResponse.status(), 'register/init should succeed for a fresh email').toBe(200);

    // Step 2 — email OTP. The code is written to the outbox transactionally with init, so it is readable now.
    await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
    const code = await pollOtp(email, REGISTER_OTP_TEMPLATE);
    await fillOtp(page, code);

    // Step 3 — profile. Both names are required; the flow will not advance without them.
    await expect(page.getByRole('heading', { name: 'Tell us about you' })).toBeVisible();
    await page.getByLabel('First name').fill('Regina');
    await page.getByLabel('Last name').fill('Tester');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 4 — password. First prove the policy bites: a weak password is refused by the server and surfaced
    // inline, and the flow stays on this step (it never consumed the account or the failure budget).
    await expect(page.getByRole('heading', { name: 'Set a password' })).toBeVisible();
    const passwordField = page.getByLabel('Password', { exact: true });
    await passwordField.fill(WEAK_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText(/That didn.t work/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Set a password' })).toBeVisible();

    // Now a compliant password completes registration and mints a session.
    await passwordField.fill(STRONG_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Completion — the success screen, then Continue lands on the signed-in account overview (no returnTo/resumeUrl).
    await expect(page.getByRole('heading', { name: /You.re all set/i })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/account\/?$/);
    // The overview only renders for an authenticated session — reaching it is the end-to-end proof of sign-in.
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
  });

  test('should keep registration enumeration-safe for an email that already has an account', async ({ page }) => {
    const identityUrl = requireProductUrl('identity');
    // A seeded, definitely-existing account. Identity must not reveal that it exists: `register/init` answers
    // with the same 200 → OTP step as a brand-new email, and issues no code. A submitted code therefore fails
    // generically — the account's existence is never disclosed at any step.
    const existingEmail = 'e2e.user2@shadow-apps.test';

    await page.goto(`${identityUrl}/register`);
    await page.getByLabel('Email address').fill(existingEmail);
    const initResponsePromise = page.waitForResponse(response => response.url().includes('/api/v1/auth/register/init'));
    await page.getByRole('button', { name: 'Continue' }).click();
    const initResponse = await initResponsePromise;

    // Enumeration-safety, part one: the response is a normal 200 that advances to the OTP step, identical to a
    // new email — no 409/"already exists" leak at init.
    expect(initResponse.status(), 'register/init must not distinguish an existing email').toBe(200);
    await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
    // The generic, non-disclosing hint identity shows regardless of whether the email exists.
    await expect(page.getByText(/already has an account, we.ll help you sign in/i)).toBeVisible();

    // Enumeration-safety, part two: since no OTP was issued, any code is rejected as an ordinary failed attempt
    // rather than an account-exists disclosure. One wrong code yields the generic retry error (not a lock-out).
    await fillOtp(page, '000000');
    await expect(page.getByText(/didn.t work|couldn.t continue/i)).toBeVisible();
    // The page must never surface that the address is already registered.
    await expect(page.getByText(/already (registered|exists|in use)/i)).toHaveCount(0);
  });
});

test.describe('identity registration API', () => {
  test('should hold registration to its step order, count a wrong code and finish with an active, verified account', async ({ identity }) => {
    const email = uniqueEmail('reg-api');
    identity.trackUserByEmail(email);
    const ctx = await identity.anonymous();

    const init = await registerInit(ctx, email);
    expect(init.status()).toBe(200);
    const initBody = await flowStepOf(init);
    expect(initBody).toEqual({
      flowId: expect.stringMatching(/\S/) as unknown,
      status: 'AWAITING_EMAIL_OTP',
      resendsLeft: 3,
      metadata: { maskedEmail: expect.any(String) as unknown },
    });
    const flowId = initBody.flowId ?? '';

    for (const [step, body] of [
      ['profile', { flowId, firstName: 'Early', lastName: 'Bird' }],
      ['password', { flowId, password: STRONG_PASSWORD }],
    ] as const) {
      const skipped = await ctx.post(`/api/v1/auth/register/${step}`, { data: body });
      expect(skipped.status(), `register/${step} before the OTP`).toBe(409);
      await expectErrorCode(skipped, 'AUTH_002');
    }

    const code = await pollOtp(email, REGISTER_OTP_TEMPLATE);
    const wrongCode = code === '000000' ? '111111' : '000000';
    const wrong = await verifyChallenge(ctx, { flowId, code: wrongCode });
    expect(wrong.status()).toBe(401);
    expect(await flowStepOf(wrong)).toEqual({ flowId, status: 'AWAITING_EMAIL_OTP', attemptsLeft: 2 });

    const verified = await verifyChallenge(ctx, { flowId, code });
    expect(verified.status()).toBe(200);
    expect(await flowStepOf(verified)).toEqual({ flowId, status: 'AWAITING_DEMOGRAPHICS' });
    const demographics = await ctx.post('/api/v1/auth/register/demographics', { data: { flowId } });
    expect(await flowStepOf(demographics)).toEqual({ flowId, status: 'AWAITING_PROFILE' });
    const profile = await ctx.post('/api/v1/auth/register/profile', { data: { flowId, firstName: 'Regina', lastName: 'Tester' } });
    expect(await flowStepOf(profile)).toEqual({ flowId, status: 'AWAITING_PASSWORD_SET' });
    const password = await ctx.post('/api/v1/auth/register/password', { data: { flowId, password: STRONG_PASSWORD } });
    expect(password.status(), await password.text()).toBe(200);
    expect(await flowStepOf(password)).toEqual({ flowId, status: 'COMPLETED' });
    expectSessionCookie(password);
    expect((await ctx.get('/api/v1/me')).status()).toBe(200);

    const [account] = await identityDb()<{ status: string; verified: boolean }[]>`
      SELECT u.status, ue.verified_at IS NOT NULL AS verified FROM users u JOIN user_emails ue ON ue.user_id = u.id WHERE ue.email_id = ${email} AND ue.is_primary
    `;
    expect(account).toEqual({ status: 'ACTIVE', verified: true });
  });

  test('should issue no code for an email that already has an account and fail whatever code comes back', async ({ identity }) => {
    const existing = await identity.createUser({ label: 'reg-existing' });
    const ctx = await identity.anonymous();

    const init = await registerInit(ctx, existing.email);
    expect(init.status()).toBe(200);
    const initBody = await flowStepOf(init);
    expect(initBody).toEqual({
      flowId: expect.stringMatching(/\S/) as unknown,
      status: 'AWAITING_EMAIL_OTP',
      resendsLeft: 3,
      metadata: { maskedEmail: expect.any(String) as unknown },
    });
    const flowId = initBody.flowId ?? '';
    expect(await countOutboxRows('email', existing.email, REGISTER_OTP_TEMPLATE), 'no code may go to an existing account').toBe(0);
    expect(await flowChallenges(flowId)).toEqual([]);

    const guess = String(Number.parseInt(randomBytes(3).toString('hex'), 16) % 1_000_000).padStart(6, '0');
    const verify = await verifyChallenge(ctx, { flowId, code: guess });
    expect(verify.status()).toBe(401);
    expect(await flowStepOf(verify)).toEqual({ flowId, status: 'AWAITING_EMAIL_OTP', attemptsLeft: 2 });
  });
});
