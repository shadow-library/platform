import { expect, test } from '@playwright/test';

import { getProductLabel, type ProductKey, requireProductUrl } from '../lib';

/**
 * One path per product known to sit behind `requireSession` (identity's root chains through `/account` first; web-novel's `/library` is gated in both access
 * modes, while its private shell is covered by `web-novel/private-access.spec.ts`). A real Chromium page observes the URL settling on `/login`, so it
 * tolerates a server-side 307 and a client-side redirect alike. `/login` is a client shim that hands the browser to `/api/auth/login` and on through the
 * backend's OIDC redirect to identity's hosted `/login`, hence the longer timeout for hydration plus a multi-hop, cross-origin redirect.
 */
const LOGIN_REDIRECT_PATHS: Record<ProductKey, string> = {
  identity: '/',
  memoir: '/',
  novelForge: '/',
  pulse: '/',
  webNovel: '/library',
};

test.describe('auth gate', () => {
  for (const product of Object.keys(LOGIN_REDIRECT_PATHS) as ProductKey[]) {
    test(`should send an unauthenticated visitor to a login surface for ${getProductLabel(product)}`, async ({ page }) => {
      const url = requireProductUrl(product);
      await page.goto(`${url}${LOGIN_REDIRECT_PATHS[product]}`);
      await expect(page).toHaveURL(/\/login/i, { timeout: 20_000 });
    });
  }
});
