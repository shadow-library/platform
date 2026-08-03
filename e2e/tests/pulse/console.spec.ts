/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, requireProductUrl, storageStateFor } from '../../lib';
import { uniqueKey } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Browser-level coverage of the pulse-web ops console, driven as `admin` (the only persona with a saved pulse
 * session — `.auth/admin.json`). Selectors are read straight off the component source
 * (`apps/pulse-web/src/features/**`, `apps/pulse-web/src/components/Layout/index.tsx`) since the app carries
 * no `data-testid`s anywhere: `Table[aria-label=...]`, `Input[placeholder=...]`, and visible button/role text.
 */
test.use({ storageState: storageStateFor('admin') });

test.describe('console UI', () => {
  test.beforeEach(() => requireProductUrl('pulse'));

  test('should load the delivery-health dashboard with the shape-only KPI cards', async ({ page }) => {
    const url = requireProductUrl('pulse');
    await page.goto(url);

    await expect(page.getByRole('heading', { name: 'Delivery health', level: 1 })).toBeVisible();
    // `GET /api/v1/dashboard/stats` is hardcoded mock data (dashboard.controller.ts:20-46) — assert the four
    // KPI cards render with *a* value, never a specific seeded number.
    // `.first()`: each label also appears inside the per-channel breakdown cards and the trend legend further
    // down the page — the KPI `Statistic` is the first occurrence in DOM order for all four labels.
    for (const label of ['Total sent', 'Succeeded', 'Failed', 'Pending']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  /**
   * The task brief asked to search for the baseline `auth.register.otp` template. This deployment's pulse
   * database currently has zero rows in `templates` — the baseline seed was never run (see
   * `send-delivery.spec.ts`'s file-level doc comment for the full evidence trail: a live `GET
   * /api/v1/templates` returns `{"total":0}` and a real identity notification 404s `TPL_001`).
   */
  test.fixme('should find auth.register.otp when searching /templates by key (pulse baseline seed was never run for this deployment)', async ({ page }) => {
    const url = requireProductUrl('pulse');
    await page.goto(`${url}/templates`);
    await page.getByPlaceholder('Search by template key').fill('auth.register.otp');
    await expect(page.getByRole('table', { name: 'Templates' }).getByText('auth.register.otp')).toBeVisible();
  });

  /**
   * A second, independent app bug found while writing the test above: the `/templates` search box never
   * actually filters. `TemplateList.tsx` writes the typed value to the URL via `useDebouncedParam` →
   * `appendSearch` (`features/shared/pagination.ts:60-71`, `packages/web/src/router/use-search-params.ts:39`)
   * and the address bar does update (`?key=...&offset=...`), but the outgoing `GET /api/v1/templates` request
   * `useListTemplatesQuery` fires carries **no query string at all** — confirmed by listening for the request
   * in a real browser: typing a just-created template's exact key into the search box updates the URL, yet the
   * network request is bare `GET /api/v1/templates` and the table keeps showing every template, unfiltered.
   * The backend's own `key` filter works correctly in isolation (`curl .../api/v1/templates?key=...` returns
   * exactly the one match) — the break is client-side, somewhere between `appendSearch`'s `router.navigate`
   * and `useListTemplatesQuery(search)` reading the resulting search params back out. The same
   * `useDebouncedParam`/`appendSearch` pair backs the Sender Profiles and Routing Rules search/filter inputs
   * too, so this is very likely not template-search-specific.
   */
  test.fixme('the /templates search box should filter the table (app bug: the debounced search value reaches the URL but never reaches the outgoing GET /api/v1/templates request — see file-level doc comment)', async ({
    page,
  }) => {
    const templateKey = uniqueKey('console-search-probe');
    const ctx = await apiContext('pulse', 'admin');
    await ctx.post('/api/v1/templates', { data: { templateKey, name: 'Search probe', messageType: 'TRANSACTIONAL' } });

    const requests: string[] = [];
    page.on('request', request => {
      if (request.method() === 'GET' && request.url().includes('/api/v1/templates')) requests.push(request.url());
    });

    const url = requireProductUrl('pulse');
    await page.goto(`${url}/templates`);
    await page.getByPlaceholder('Search by template key').fill(templateKey);
    await page.waitForTimeout(500);

    const filtered = requests.find(u => u.includes('key='));
    expect(filtered, `expected a GET /api/v1/templates request carrying the typed key filter; saw: ${requests.join(', ')}`).toBeTruthy();
  });

  test('should create a template via the drawer, edit it from its detail page, and see the change reflected there', async ({ page }) => {
    const templateKey = uniqueKey('console-tpl');
    const url = requireProductUrl('pulse');
    await page.goto(`${url}/templates`);

    // `FormField`'s `<label htmlFor>` doesn't reach `@shadow-library/ui`'s `Select` trigger (a `combobox` with no
    // accessible name — confirmed against a page snapshot: `getByLabel('Message type')` finds nothing), so the
    // two `select`-type fields in this drawer (Message type, Priority) are addressed positionally within the
    // dialog instead of by label.
    const dialog = page.getByRole('dialog', { name: 'New template' });
    await page.getByRole('button', { name: 'New template' }).click();
    await dialog.getByLabel('Template key').fill(templateKey);
    await dialog.getByLabel('Name').fill('E2E console template');
    // A plain `.click()` on the option flakes here — the drawer's own scrim intercepts the pointer event even
    // though the option itself reports visible/enabled/stable (`sh-scrim` sits above the Select popover, a
    // z-index layering wrinkle when a Radix `Select` opens from inside a `FormDrawer`) — keyboard selection
    // (Radix's built-in typeahead) sidesteps it entirely.
    await dialog.getByRole('combobox').nth(0).click();
    await page.keyboard.type('Transactional');
    await page.keyboard.press('Enter');
    await dialog.getByRole('combobox').nth(1).click();
    await page.keyboard.type('Medium');
    await page.keyboard.press('Enter');
    await dialog.getByRole('button', { name: 'Create template' }).click();
    await expect(dialog).toBeHidden();

    // The search box doesn't actually filter (see the fixme above) — go straight to the detail page by id
    // instead of hunting the table for the new row.
    const ctx = await apiContext('pulse', 'admin');
    const listResponse = await ctx.get(`/api/v1/templates?key=${templateKey}`);
    const listBody = (await listResponse.json()) as { items: { id: string }[] };
    const created = listBody.items[0];
    expect(created, `expected ${templateKey} to have been created by the drawer submit`).toBeTruthy();

    await page.goto(`${url}/templates/${created?.id}`);
    await expect(page.getByRole('heading', { name: templateKey })).toBeVisible();
    await page.getByRole('button', { name: 'Edit template' }).click();
    // Scoped to the drawer: an unscoped `getByLabel('Name')` also matches an unrelated "firstName"-placeholder
    // input elsewhere in the app chrome (the account/org form), so it's ambiguous page-wide.
    const editDialog = page.getByRole('dialog', { name: 'Edit template' });
    await editDialog.getByLabel('Name').fill('E2E console template (edited)');
    await editDialog.getByRole('button', { name: 'Save changes' }).click();
    // `.first()`: the new name renders both in the page subtitle and in the metadata description list.
    await expect(page.getByText('E2E console template (edited)').first()).toBeVisible();

    // Cleanup: no DELETE route for templates — deactivate via the API instead of a second UI round trip.
    if (created) await ctx.patch(`/api/v1/templates/${created.id}`, { data: { isActive: false } });
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

    // Not using the search box: it shares the same broken filtering as /templates' (see console.spec.ts's
    // template-search fixme) — the table defaults to `updatedAt desc`, so the profile just created is
    // reliably the first row without needing to filter for it.
    const row = page.getByRole('table', { name: 'Sender profiles' }).locator('tr').filter({ hasText: key });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Delete' }).click();
    // "Delete sender profile?" is the alertdialog's title (a heading), not a button — the confirm action itself
    // is just "Delete", scoped to the alertdialog to disambiguate it from the row's own "Delete" button.
    await page.getByRole('alertdialog', { name: 'Delete sender profile?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(row).toBeHidden();
  });

  test('should list the seeded catch-all routing rule in /routing', async ({ page }) => {
    const url = requireProductUrl('pulse');
    await page.goto(`${url}/routing`);
    await expect(page.getByRole('table', { name: 'Routing rules' })).toBeVisible();
    // The all-NULL catch-all's messageType/region/service all render as "Any" (AnyOrValue), and its sender key
    // (e2e-dev) is the one distinguishing cell — assert on that rather than the ambiguous "Any" text.
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
