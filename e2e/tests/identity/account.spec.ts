/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { PERSONAS, readSeedManifest, requireProductUrl, storageStateFor } from '../../lib';
import { capturePasswordCredential, maxOutboxId, pollOutboxRowAfter, restorePasswordCredential } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The self-service account portal, driven through the real UI while authenticated by a saved persona session
 * (each persona's `storageState` carries identity's `__Host-sid`). Two personas by design: the read-only and
 * profile flows run as **user2** (the login spec's happy persona is spent through a *separate*, freshly-minted
 * session, so nothing here collides with it), while the destructive password-change flow runs as **user1** — no
 * other identity spec logs in as user1 with its password, so a brief in-test rotation cannot race anyone. Every
 * mutation restores the seeded state before it ends, keeping the suite rerunnable.
 */

/** The password-changed notification identity enqueues on a successful self-service change. */
const PASSWORD_CHANGED_TEMPLATE = 'auth.password.changed';

test.describe('identity account portal (user2)', () => {
  test.use({ storageState: storageStateFor('user2') });
  // Serial: the profile-update test mutates (then restores) user2's name, and the overview/profile-render test
  // reads it — with `fullyParallel` on they would otherwise race across workers on the shared account.
  test.describe.configure({ mode: 'serial' });

  test('should render the account overview and profile for the signed-in user', async ({ page }) => {
    const identityUrl = requireProductUrl('identity');

    await page.goto(`${identityUrl}/account`);
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(page.getByText(PERSONAS.user2.email)).toBeVisible();

    await page.goto(`${identityUrl}/account/profile`);
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    // The profile form is seeded from the live session, so the current names are shown in their fields.
    await expect(page.getByLabel('First name')).toHaveValue(PERSONAS.user2.firstName);
  });

  test('should update the profile name and persist it across a reload', async ({ page }) => {
    const identityUrl = requireProductUrl('identity');
    const newFirst = 'Userdos';
    const newLast = 'Renamed';

    await page.goto(`${identityUrl}/account/profile`);
    await expect(page.getByLabel('First name')).toHaveValue(PERSONAS.user2.firstName);

    await page.getByLabel('First name').fill(newFirst);
    await page.getByLabel('Last name').fill(newLast);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Profile saved')).toBeVisible();

    // Persistence is the real assertion: a fresh load re-seeds the form from the server, so the new names must survive it.
    await page.reload();
    await expect(page.getByLabel('First name')).toHaveValue(newFirst);
    await expect(page.getByLabel('Last name')).toHaveValue(newLast);

    // Restore the seeded names so the account (and this spec on its next run) starts clean.
    await page.getByLabel('First name').fill(PERSONAS.user2.firstName);
    await page.getByLabel('Last name').fill(PERSONAS.user2.lastName);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Profile saved')).toBeVisible();
  });

  test('should list active sessions and mark the current device', async ({ page }) => {
    const identityUrl = requireProductUrl('identity');

    await page.goto(`${identityUrl}/account/sessions`);
    await expect(page.getByRole('heading', { name: 'Sessions & devices' })).toBeVisible();
    // The session making this very request must be flagged as the current device. Revoking a *non-current*
    // session is intentionally not exercised here: it is gated behind a step-up (re-auth) dialog, and a fresh
    // persona session typically has no other session to revoke — asserting the current-device marker is the
    // stable, meaningful contract.
    await expect(page.getByText('This device')).toBeVisible();
  });
});

test.describe('identity account security (user1)', () => {
  test.use({ storageState: storageStateFor('user1') });

  test('should reject a password change when the current password is wrong', async ({ page }) => {
    const identityUrl = requireProductUrl('identity');

    await page.goto(`${identityUrl}/account/security`);
    await page.getByRole('button', { name: 'Change password' }).click();

    // A wrong current password is re-proved server-side and comes back as a 401, which the dialog renders as a
    // specific "current password is incorrect" message — never a generic failure.
    await page.getByLabel('Current password').fill('not-my-current-password');
    await page.getByLabel('New password', { exact: true }).fill('BrandNew#Passw0rd!');
    await page.getByLabel('Confirm new password').fill('BrandNew#Passw0rd!');
    await page.getByRole('button', { name: 'Update password' }).click();

    await expect(page.getByText(/current password is incorrect/i)).toBeVisible();
  });

  test('should change the password, enqueue a notification, and restore the seeded credential', async ({ page }) => {
    const identityUrl = requireProductUrl('identity');
    const persona = PERSONAS.user1;
    const userId = readSeedManifest().users.user1.userId;
    // Unique so it can never collide with a recent password in history (identity refuses to reuse the last five).
    const temporaryPassword = `TmpChg#${Date.now()}aB`;

    // Snapshot the seeded credential up front so we can put it back byte-for-byte afterwards — a UI "change it
    // back" would be blocked by the reuse guard on reruns.
    const snapshot = await capturePasswordCredential(userId);
    const outboxBaseline = await maxOutboxId(persona.email, PASSWORD_CHANGED_TEMPLATE);

    try {
      await page.goto(`${identityUrl}/account/security`);
      await page.getByRole('button', { name: 'Change password' }).click();
      await page.getByLabel('Current password').fill(persona.password);
      await page.getByLabel('New password', { exact: true }).fill(temporaryPassword);
      await page.getByLabel('Confirm new password').fill(temporaryPassword);
      await page.getByRole('button', { name: 'Update password' }).click();

      // Success closes the dialog with a toast that also states the side effect (other devices signed out).
      await expect(page.getByText(/Password updated/i)).toBeVisible();

      // The change must enqueue the owner-notification outbox row — proof the server ran the full change path,
      // not just rotated the hash. Newer than the baseline so a stale row from a prior run can't pass it.
      await pollOutboxRowAfter(persona.email, PASSWORD_CHANGED_TEMPLATE, outboxBaseline);
    } finally {
      // Always restore, even if an assertion above failed mid-flight, so the seeded password keeps working.
      await restorePasswordCredential(userId, snapshot);
    }
  });
});
