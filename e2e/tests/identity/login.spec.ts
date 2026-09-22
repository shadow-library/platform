/**
 * Importing npm packages
 */
import { expect, type Page, type Response, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { PERSONAS, requireProductUrl } from '../../lib';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * These specs drive identity's hosted multi-step `/login` UI (identifier → password → signed in) against the
 * deployed cluster. Every test that spends a credential mints its **own** session by logging in fresh, rather
 * than reusing a saved `storageState` — so the sign-out test can revoke a session without collaterally killing
 * the shared persona sessions that `account`/`security` specs depend on. `login/init` is rate-limited 20/hour
 * per IP; this file spends it ~4 times, well inside budget, and never loops failed attempts (the
 * server escalates to an OTP-only lock after 5 failures in 15 minutes — see `sign-in-event.service.ts`).
 */

/** Personas addressed by these specs — the happy path avoids the negative personas so a lock/suspension can never bleed into it. */
const HAPPY = PERSONAS.user2;
const WRONG_PASSWORD_PERSONA = PERSONAS.user1;
const SUSPENDED = PERSONAS.suspended;
const LOCKED = PERSONAS.locked;

/**
 * Submits the identifier step and returns the `login/init` response. `login/init` is rate-limited per IP, so a
 * caller skips (never fails) on 429 — an exhausted shared bucket is an environment condition. The status also
 * lets a negative-path test distinguish the account-state refusal (403) it is asserting from a rate-limit refusal.
 */
async function submitIdentifier(page: Page, identifier: string): Promise<Response> {
  await page.getByLabel('Email or phone').fill(identifier);
  const initResponse = page.waitForResponse(response => response.url().includes('/api/v1/auth/login/init'));
  await page.getByRole('button', { name: 'Continue' }).click();
  return initResponse;
}

test.describe('identity login', () => {
  test('should sign a user in through the UI and then sign them out', async ({ page }) => {
    const identityUrl = requireProductUrl('identity');

    await page.goto(`${identityUrl}/login`);

    // Identifier step, then password step — the two-screen split identity uses so it can route an identifier to
    // SSO or passkeys before ever prompting for a secret.
    const initStatus = (await submitIdentifier(page, HAPPY.email)).status();
    test.skip(initStatus === 429, 'login/init hit the per-IP rate limit — skipping rather than failing on a shared budget');
    await expect(page.getByRole('heading', { name: 'Enter your password' })).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill(HAPPY.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Completion lands on the account overview (no returnTo), and the readable session flag cookie is set.
    await expect(page).toHaveURL(/\/account\/?$/);
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    const signedInCookies = await page.context().cookies(identityUrl);
    expect(signedInCookies.find(cookie => cookie.name === 'isLoggedIn')?.value, 'isLoggedIn flag cookie should be set after sign-in').toBe('true');

    // Sign out from the overview: it clears the session cookies and drops back to /login.
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
    const afterCookies = await page.context().cookies(identityUrl);
    expect(afterCookies.find(cookie => cookie.name === 'isLoggedIn')?.value ?? '', 'isLoggedIn flag should be cleared after sign-out').not.toBe('true');

    // The session is really gone: a protected route now bounces an unauthenticated visitor back to login (SSR gate).
    await page.goto(`${identityUrl}/account`);
    await expect(page).toHaveURL(/\/login/);
  });

  test('should reject a wrong password and surface the remaining-attempts count', async ({ page }) => {
    const identityUrl = requireProductUrl('identity');

    await page.goto(`${identityUrl}/login`);
    const initStatus = (await submitIdentifier(page, WRONG_PASSWORD_PERSONA.email)).status();
    test.skip(initStatus === 429, 'login/init hit the per-IP rate limit — skipping rather than failing on a shared budget');
    await expect(page.getByRole('heading', { name: 'Enter your password' })).toBeVisible();

    // A single wrong attempt (never looped — 5 in 15 min would trigger an OTP-only lock). The server answers the
    // same AWAITING_PASSWORD status carrying `attemptsLeft`, which the UI renders as a remaining-attempts message.
    await page.getByLabel('Password', { exact: true }).fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(/attempts? left/i)).toBeVisible();
    // Still on the password step — a rejected proof does not advance or sign anyone in.
    await expect(page.getByRole('heading', { name: 'Enter your password' })).toBeVisible();
    const cookies = await page.context().cookies(identityUrl);
    expect(cookies.find(cookie => cookie.name === 'isLoggedIn')?.value ?? '').not.toBe('true');
  });

  test('should refuse sign-in for a suspended account without prompting for a password', async ({ page }) => {
    const identityUrl = requireProductUrl('identity');

    // A SUSPENDED account is rejected at `login/init` (AUTH_010) — before any credential is asked for — so the
    // identifier step surfaces the block inline and never advances to the password screen.
    await page.goto(`${identityUrl}/login`);
    const initStatus = (await submitIdentifier(page, SUSPENDED.email)).status();
    test.skip(initStatus === 429, 'login/init hit the per-IP rate limit — skipping rather than failing on a shared budget');
    expect(initStatus, 'a suspended account must be refused at login/init').toBe(403);

    await expect(page.getByText(/suspended/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Enter your password' })).toHaveCount(0);
  });

  test('should refuse sign-in for a FULL-locked account at the identifier step without prompting for a password', async ({ page }) => {
    const identityUrl = requireProductUrl('identity');

    // A FULL lock (`lock_mode = 'FULL'`, `locked_until` in the future) is refused at `login/init` with AUTH_012 before a
    // flow exists, so no credential is ever asked for. identity-web has no dedicated copy for AUTH_012 and shows the server's message.
    await page.goto(`${identityUrl}/login`);
    const init = await submitIdentifier(page, LOCKED.email);
    test.skip(init.status() === 429, 'login/init hit the per-IP rate limit — skipping rather than failing on a shared budget');
    expect(init.status(), 'a FULL-locked account must be refused at login/init').toBe(403);
    const body = (await init.json()) as { code?: string; flowId?: string };
    expect(body.code).toBe('AUTH_012');
    expect(body.flowId, 'a refused login/init must not open a flow').toBeUndefined();

    await expect(page.getByText('Account is locked')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Enter your password' })).toHaveCount(0);
    const cookies = await page.context().cookies(identityUrl);
    expect(cookies.find(cookie => cookie.name === 'isLoggedIn')?.value ?? '').not.toBe('true');
  });
});
