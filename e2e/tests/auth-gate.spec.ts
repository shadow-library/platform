/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { getProductLabel, type ProductKey, PRODUCTS, requireProductUrl } from '../lib';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The one path per product that's known, read-only from each app's route source, to sit behind a session
 * gate: identity's `/`, novel-forge's `/`, and pulse's `/` all redirect through `requireSession`
 * unconditionally (identity's root even chains through `/account` first — see
 * `apps/identity-web/src/routes/index.tsx`), while web-novel is a public reader whose only gated route
 * among the ones checked here is `/library` (`apps/web-novel-web/src/routes/_shell/library.tsx`).
 *
 * Every gate lands on a URL containing "/login": identity and web-novel render a local login screen
 * directly; novel-forge and pulse's `/login` is a client-side shim (`routes/login.tsx`) that immediately
 * hands the browser to `/api/auth/login`, which bounces through the backend's OIDC redirect to identity's
 * hosted `/login` — cross-origin, but still a URL containing "/login". The longer timeout accounts for
 * that multi-hop redirect over a live network.
 */
const PROTECTED_PATHS: Record<ProductKey, string> = {
  identity: '/',
  novelForge: '/',
  pulse: '/',
  webNovel: '/library',
};

test.describe('auth gate', () => {
  for (const product of PRODUCTS) {
    test(`should send an unauthenticated visitor to a login surface for ${getProductLabel(product)}`, async ({ page }) => {
      const url = requireProductUrl(product);
      await page.goto(`${url}${PROTECTED_PATHS[product]}`);
      await expect(page).toHaveURL(/\/login/i, { timeout: 20_000 });
    });
  }
});
