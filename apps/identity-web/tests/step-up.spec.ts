/**
 * Importing npm packages
 */
import { expect, type Page, test } from '@playwright/test';

/**
 * The hosted step-up prompt (W-1 / D-19, T-801) is the issuer's `step_up_endpoint`: the SDK redirects a
 * browser here with `client_id`/`resource` so the elevation window it opens names its beneficiary. These
 * specs prove the route gates on a session (preserving the intent through the login bounce) and, when a
 * session is available, that an app-initiated prompt names the grantee while the console's own does not.
 */

const APP_STEP_UP = `/step-up?client_id=shadow-identity&resource=${encodeURIComponent('api://shadow-identity')}&acr_values=AAL2&return_to=%2Faccount`;

/** Best-effort sign-in as the seeded admin; returns false if the account is diverted to reset/MFA/SSO. */
async function signInAsAdmin(page: Page): Promise<boolean> {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('you@company.com').fill('admin@shadow-apps.com');
  await page.getByRole('button', { name: 'Continue' }).click();
  try {
    await page.getByRole('heading', { name: 'Enter your password' }).waitFor({ timeout: 15_000 });
  } catch {
    return false;
  }
  await page.locator('input[type="password"]').first().fill('Password@123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  return page
    .waitForURL(/\/account/, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
}

test.describe('hosted step-up prompt', () => {
  test('should send an unauthenticated console step-up to sign-in, preserving the destination', async ({ page }) => {
    await page.goto('/step-up');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fstep-up/, { timeout: 15_000 });
  });

  test('should send an unauthenticated app-initiated step-up to sign-in, preserving the intent params', async ({ page }) => {
    await page.goto(APP_STEP_UP);
    /** The whole prompt URL — client_id included — round-trips as the returnTo, so the intent survives the login bounce. */
    await expect(page).toHaveURL(/\/login\?returnTo=.*step-up.*client_id/, { timeout: 15_000 });
  });

  test('should name the beneficiary only for an app-initiated step-up', async ({ page }) => {
    const signedIn = await signInAsAdmin(page);
    test.skip(!signedIn, 'scripted admin sign-in unavailable (forced password reset / MFA / SSO on the seeded admin)');

    /** Console-initiated: an ordinary prompt whose window no application can claim — no grantee named. */
    await page.goto('/step-up');
    await expect(page.getByRole('heading', { name: /confirm it.s you/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/approving elevated access for/i)).toHaveCount(0);

    /** App-initiated: the grantee is named against the resource it is being elevated for. */
    await page.goto(APP_STEP_UP);
    await expect(page.getByText(/approving elevated access for/i)).toBeVisible({ timeout: 15_000 });
  });
});
