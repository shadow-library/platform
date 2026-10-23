import { PERSONAS, readSeedManifest, requireProductUrl, storageStateFor, useClientIp } from '../../lib';
import { expect, test } from './fixtures';
import { capturePasswordCredential, deleteNotificationsAfter, maxOutboxId, pollOutboxRowAfter, restorePasswordCredential } from './helpers';

/**
 * The self-service account portal through the real UI, authenticated by a saved persona session. Read-only and profile flows run as **user2** (the login spec's happy persona
 * uses a separate, freshly minted session);
 * the destructive password-change flow runs as **user1**, since no other identity spec logs in as user1 with its password, so a brief rotation cannot race anyone. Every mutation
 * restores the seeded state.
 */

/** The password-changed notification identity enqueues on a successful self-service change. */
const PASSWORD_CHANGED_TEMPLATE = 'auth.password.changed';

test.beforeEach(async ({ context, identity }) => {
  await useClientIp(context, identity.clientIp);
});

test.describe('identity account portal (user2)', () => {
  test.use({ storageState: storageStateFor('user2') });
  // Serial: the profile-update test mutates (then restores) user2's name and the overview test reads it; `fullyParallel` would race them on the shared account.
  test.describe.configure({ mode: 'serial' });

  test('should render the account overview and profile for the signed-in user', async ({ page }) => {
    const identityUrl = requireProductUrl('identity');

    await page.goto(`${identityUrl}/account`);
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(page.getByText(PERSONAS.user2.email)).toBeVisible();

    await page.goto(`${identityUrl}/account/profile`);
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
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

    await page.reload();
    await expect(page.getByLabel('First name')).toHaveValue(newFirst);
    await expect(page.getByLabel('Last name')).toHaveValue(newLast);

    await page.getByLabel('First name').fill(PERSONAS.user2.firstName);
    await page.getByLabel('Last name').fill(PERSONAS.user2.lastName);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Profile saved')).toBeVisible();
  });

  test('should list active sessions and mark the current device', async ({ page }) => {
    const identityUrl = requireProductUrl('identity');

    await page.goto(`${identityUrl}/account/sessions`);
    await expect(page.getByRole('heading', { name: 'Sessions & devices' })).toBeVisible();
    // The session making this request must be flagged as the current device. Revoking a non-current session is not exercised: it needs a step-up dialog and a fresh persona
    // session has no other session to revoke.
    await expect(page.getByText('This device')).toBeVisible();
  });
});

test.describe('identity account security (user1)', () => {
  test.use({ storageState: storageStateFor('user1') });

  test('should reject a password change when the current password is wrong', async ({ page }) => {
    const identityUrl = requireProductUrl('identity');

    await page.goto(`${identityUrl}/account/security`);
    await page.getByRole('button', { name: 'Change password' }).click();

    // A wrong current password is re-proved server-side as a 401, which the dialog renders as a specific "current password is incorrect" message, never a generic failure.
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
    // Unique, as identity refuses to reuse the last five passwords.
    const temporaryPassword = `TmpChg#${Date.now()}aB`;

    // Snapshot the seeded credential to restore it byte-for-byte: a UI "change it back" would hit the reuse guard on reruns.
    const snapshot = await capturePasswordCredential(userId);
    const outboxBaseline = await maxOutboxId(persona.email, PASSWORD_CHANGED_TEMPLATE);

    try {
      await page.goto(`${identityUrl}/account/security`);
      await page.getByRole('button', { name: 'Change password' }).click();
      await page.getByLabel('Current password').fill(persona.password);
      await page.getByLabel('New password', { exact: true }).fill(temporaryPassword);
      await page.getByLabel('Confirm new password').fill(temporaryPassword);
      await page.getByRole('button', { name: 'Update password' }).click();

      await expect(page.getByText(/Password updated/i)).toBeVisible();

      // The owner-notification outbox row proves the server ran the full change path, not just rotated the hash; newer than the baseline so a stale row cannot pass.
      await pollOutboxRowAfter(persona.email, PASSWORD_CHANGED_TEMPLATE, outboxBaseline);
    } finally {
      // Always restore, even if an assertion failed mid-flight, so the seeded password keeps working.
      await restorePasswordCredential(userId, snapshot);
      await deleteNotificationsAfter(persona.email, PASSWORD_CHANGED_TEMPLATE, outboxBaseline);
    }
  });
});
