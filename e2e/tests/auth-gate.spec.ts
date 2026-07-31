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
 * any markup ships. Pulse converted from a client-rendered SPA to the same TanStack Start SSR pattern
 * (`.shadowrc.json` `type: "ssr"` — see `apps/pulse-web`), so its `beforeLoad` gate now redirects the
 * same way server-side once a rebuilt image is deployed — but the *currently deployed* pulse-web instance
 * may still be the pre-conversion SPA until the next rollout, where `requireSession`'s redirect only
 * happens once the browser executes the bundle (its static shell answers `/` with a flat `200`
 * regardless of auth state). This spec tolerates either: a real Chromium page (not a bare HTTP client)
 * observes the URL settling on `/login` whether that took a server 307 or a client-side bundle
 * execution. `/login` itself is a client-side shim (`routes/login.tsx`, run in a `useEffect` so it's
 * SSR-safe) that then hands the browser to `/api/auth/login`, bouncing through the backend's OIDC
 * redirect to identity's hosted `/login` — cross-origin, but still a URL containing "/login". The longer
 * timeout accounts for that hydration + multi-hop redirect.
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
