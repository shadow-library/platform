import { expect, test } from '@playwright/test';

import { apiContext, requireProductUrl, storageStateFor } from '../../lib';
import { deleteTemplateByKey, uniqueKey } from './helpers';

/**
 * Browser-level coverage of the pulse-web ops console, driven as `admin` (the only persona with a saved pulse session). The app has no `data-testid`s, so selectors come from the
 * component source.
 */
test.use({ storageState: storageStateFor('admin') });

test.describe('console UI', () => {
  let createdTemplateKeys: string[] = [];

  test.beforeEach(() => requireProductUrl('pulse'));

  test.afterEach(async () => {
    for (const templateKey of createdTemplateKeys) await deleteTemplateByKey(templateKey);
    createdTemplateKeys = [];
  });

  test('should load the delivery-health dashboard with the shape-only KPI cards', async ({ page }) => {
    const url = requireProductUrl('pulse');
    await page.goto(url);

    await expect(page.getByRole('heading', { name: 'Delivery health', level: 1 })).toBeVisible();
    // Stats aggregate every job on the shared cluster, so assert the four KPI cards render, never a value. `.first()`: each label also appears further down in the channel cards
    // and trend legend.
    for (const label of ['Total sent', 'Succeeded', 'Failed', 'Pending']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  /** Relies on the baseline seed having run on this deployment (`auth.register.otp` has a PUBLISHED version), so it searches for a real row instead of creating one. */
  test('should find auth.register.otp when searching /templates by key', async ({ page }) => {
    const url = requireProductUrl('pulse');
    await page.goto(`${url}/templates`);
    await page.getByPlaceholder('Search by template key').fill('auth.register.otp');
    await expect(page.getByRole('table', { name: 'Templates' }).getByText('auth.register.otp')).toBeVisible();
  });

  test('should send the typed key as the /templates list filter and narrow the table to it', async ({ page }) => {
    const url = requireProductUrl('pulse');
    await page.goto(`${url}/templates`);
    const table = page.getByRole('table', { name: 'Templates' });
    await page.getByPlaceholder('Search by template key').fill('auth.password.changed');
    await expect(table.getByText('auth.password.changed')).toBeVisible();

    const filtered = page.waitForRequest(request => request.method() === 'GET' && request.url().includes('/api/v1/templates') && request.url().includes('key=auth.register.otp'));
    await page.getByPlaceholder('Search by template key').fill('auth.register.otp');
    await filtered;

    await expect(table.getByText('auth.register.otp')).toBeVisible();
    await expect(table.getByText('auth.password.changed')).toBeHidden();
  });

  test('should create a template via the drawer, edit it from its detail page, and see the change reflected there', async ({ page }) => {
    const templateKey = uniqueKey('console-tpl');
    createdTemplateKeys.push(templateKey);
    const url = requireProductUrl('pulse');
    await page.goto(`${url}/templates`);

    // `FormField`'s `<label htmlFor>` does not reach `@shadow-library/ui`'s `Select` trigger (a `combobox` with no accessible name), so the two selects (Message type, Priority)
    // are addressed positionally within the dialog.
    const dialog = page.getByRole('dialog', { name: 'New template' });
    await page.getByRole('button', { name: 'New template' }).click();
    await dialog.getByLabel('Template key').fill(templateKey);
    await dialog.getByLabel('Name').fill('E2E console template');
    // A plain `.click()` on the option flakes: the drawer's `sh-scrim` sits above the Radix `Select` popover and intercepts the pointer event. Keyboard typeahead sidesteps it.
    await dialog.getByRole('combobox').nth(0).click();
    await page.keyboard.type('Transactional');
    await page.keyboard.press('Enter');
    await dialog.getByRole('combobox').nth(1).click();
    await page.keyboard.type('Medium');
    await page.keyboard.press('Enter');
    await dialog.getByRole('button', { name: 'Create template' }).click();
    await expect(dialog).toBeHidden();

    const ctx = await apiContext('pulse', 'admin');
    const listResponse = await ctx.get(`/api/v1/templates?key=${templateKey}`);
    const listBody = (await listResponse.json()) as { items: { id: string }[] };
    await ctx.dispose();
    const created = listBody.items[0];
    expect(created, `expected ${templateKey} to have been created by the drawer submit`).toBeTruthy();

    await page.goto(`${url}/templates/${created?.id}`);
    await expect(page.getByRole('heading', { name: templateKey })).toBeVisible();
    await page.getByRole('button', { name: 'Edit template' }).click();
    // Scoped to the drawer: an unscoped `getByLabel('Name')` also matches a "firstName"-placeholder input in the app chrome.
    const editDialog = page.getByRole('dialog', { name: 'Edit template' });
    await editDialog.getByLabel('Name').fill('E2E console template (edited)');
    await editDialog.getByRole('button', { name: 'Save changes' }).click();
    // `.first()`: the name renders in both the page subtitle and the metadata list.
    await expect(page.getByText('E2E console template (edited)').first()).toBeVisible();
  });

  test('should show the seeded e2e-dev sender profile in /senders', async ({ page }) => {
    const url = requireProductUrl('pulse');
    await page.goto(`${url}/senders`);
    await expect(page.getByRole('table', { name: 'Sender profiles' }).getByText('e2e-dev')).toBeVisible();
  });

  test('should create and delete an own sender profile via the UI', async ({ page }) => {
    const key = uniqueKey('console-sender');
    const url = requireProductUrl('pulse');
    await page.goto(`${url}/senders`);

    await page.getByRole('button', { name: 'New sender profile' }).click();
    await page.getByLabel('Key').fill(key);
    await page.getByLabel('Display name').fill('E2E console sender');
    await page.getByRole('button', { name: 'Create profile' }).click();

    // No search box: the table defaults to `updatedAt desc`, so the profile just created is the first row.
    const row = page.getByRole('table', { name: 'Sender profiles' }).locator('tr').filter({ hasText: key });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Delete' }).click();
    // "Delete sender profile?" is the alertdialog's heading, not a button; the confirm "Delete" is scoped to the alertdialog to disambiguate it from the row's own.
    await page.getByRole('alertdialog', { name: 'Delete sender profile?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(row).toBeHidden();
  });

  test('should list the seeded catch-all routing rule in /routing', async ({ page }) => {
    const url = requireProductUrl('pulse');
    await page.goto(`${url}/routing`);
    await expect(page.getByRole('table', { name: 'Routing rules' })).toBeVisible();
    // The catch-all's messageType/region/service all render as "Any", so its sender key (e2e-dev) is the one distinguishing cell.
    await expect(page.getByRole('table', { name: 'Routing rules' }).getByText('e2e-dev')).toBeVisible();
  });

  test('should expose navigation, theme toggle, and sign-out from the app chrome', async ({ page }) => {
    const url = requireProductUrl('pulse');
    await page.goto(url);

    for (const label of ['Dashboard', 'Templates', 'Sender Profiles', 'Routing Rules', 'Send Notification']) {
      await expect(page.getByRole('link', { name: label })).toBeVisible();
    }

    const themeButton = page.getByRole('button', { name: /Switch to (dark|light) theme/ });
    await expect(themeButton).toBeVisible();
    const before = await themeButton.getAttribute('aria-label');
    await themeButton.click();
    await expect(themeButton).not.toHaveAttribute('aria-label', before ?? '');

    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
  });
});
