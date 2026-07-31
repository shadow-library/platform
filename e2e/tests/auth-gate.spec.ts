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
 * Confirmed against the local k3d ingress: identity's `/`, novel-forge's `/`, and web-novel's `/library`
 * are all server-rendered (TanStack Start SSR) and 307-redirect straight to `/login?returnTo=...` before
 * any markup ships. Pulse is a plain client-rendered SPA (`.shadowrc.json` `type: "spa"`, no SSR) — its
 * static `index.html` answers `/` with a flat `200` regardless of auth state, and `requireSession`'s
 * redirect to `/login` only happens once the browser executes the bundle, which is exactly what this spec
 * (a real Chromium page, not a bare HTTP client) observes. `/login` itself is a client-side shim
 * (`routes/login.tsx`) that then hands the browser to `/api/auth/login`, bouncing through the backend's
 * OIDC redirect to identity's hosted `/login` — cross-origin, but still a URL containing "/login". The
 * longer timeout accounts for that hydration + multi-hop redirect.
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
