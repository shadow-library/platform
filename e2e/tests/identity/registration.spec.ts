/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { requireProductUrl } from '../../lib';
import { fillOtp, pollOtp, uniqueRegistrationEmail } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The registration UI is a four-step flow (email → email OTP → profile → password) that ends in a live
 * session. These specs drive the real `/register` screen against the deployed identity, reading the OTP back
 * out of the identity `notification_outbox` (identity never sends mail in dev). `register/init` is rate-limited
 * to **5 per hour per IP** and that budget is sticky, so this file spends it at most twice per run: one full
 * happy registration (which folds the weak-password rejection into its own password step rather than paying a
 * second flow for it) and one duplicate-email probe. On an unexpected 429 a test skips with a reason instead of
 * failing — a poisoned rate-limit bucket is an environment condition, not a product regression.
 */

/** A password that satisfies identity's policy: ≥12 chars, upper + lower, a number (a symbol too, though only recommended). */
const STRONG_PASSWORD = 'E2eReg#Passw0rd!';

/** Deliberately too short and too simple — the server's password policy must reject it at the password step. */
const WEAK_PASSWORD = 'short';

/** The outbox template identity enqueues the registration OTP under; `pollOtp` reads the code from its payload. */
const REGISTER_OTP_TEMPLATE = 'auth.register.otp';

// Serial so the two register/init spends never overlap in time — it keeps this file's footprint on the sticky
// per-IP budget predictable (and readable in the report) rather than racing two inits into the same window.
test.describe.configure({ mode: 'serial' });

test.describe('identity registration', () => {
  test('should register a brand-new account end to end, rejecting a weak password on the way', async ({ page }) => {
    const identityUrl = requireProductUrl('identity');
    const email = uniqueRegistrationEmail();

    await page.goto(`${identityUrl}/register`);

    // Step 1 — email. Capture the init response so a poisoned rate-limit bucket skips cleanly instead of
    // failing a step later when the OTP never arrives.
    await page.getByLabel('Email address').fill(email);
    const initResponsePromise = page.waitForResponse(response => response.url().includes('/api/v1/auth/register/init'));
    await page.getByRole('button', { name: 'Continue' }).click();
    const initResponse = await initResponsePromise;
    test.skip(initResponse.status() === 429, 'register/init hit the 5/hour rate limit — skipping rather than failing on a shared budget');
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
    // generically — the account's existence is never disclosed at any step (design decision D-12).
    const existingEmail = 'e2e.user2@shadow-apps.test';

    await page.goto(`${identityUrl}/register`);
    await page.getByLabel('Email address').fill(existingEmail);
    const initResponsePromise = page.waitForResponse(response => response.url().includes('/api/v1/auth/register/init'));
    await page.getByRole('button', { name: 'Continue' }).click();
    const initResponse = await initResponsePromise;
    test.skip(initResponse.status() === 429, 'register/init hit the 5/hour rate limit — skipping rather than failing on a shared budget');

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
