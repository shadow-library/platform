import { expect, test } from '@playwright/test';

import { requireProductUrl, storageStateFor } from '../lib';

/**
 * TanStack Start SSR contract for Web Novel (signed in as `viewer`, since the private reader renders nothing anonymously): a route `loader` prefetches through TanStack Query,
 * the HTML already contains the data, and the client rehydrates instead of refetching. `/api/auth/session`, `/api/auth/userinfo` and `/api/v1/me` are excluded
 * throughout because the session query intentionally refetches.
 */
const EXCLUDED_API_PATHS = ['/api/auth/session', '/api/auth/userinfo', '/api/v1/me'];

test.describe('ssr hydration', () => {
  test.describe('web novel (signed in)', () => {
    test.use({ storageState: storageStateFor('viewer') });

    /**
     * The `_shell/index.tsx` loader prefetches the catalog (`GET /api/novels`) but `Shell` always renders `<main id="sh-main-content">`, so that landmark cannot tell a
     * real catalog from an empty one, and this route has no skeleton fallback. A server-rendered `<Link to="/novels/$slug">` in the raw, JS-free response is what
     * proves delivered data.
     */
    test('should deliver rendered catalog markup in the raw SSR response for Web Novel', async ({ request }) => {
      const url = requireProductUrl('webNovel');

      const response = await request.get(url);
      expect(response.status()).toBe(200);

      const body = await response.text();
      expect(body).toContain('id="sh-main-content"');

      const novelLinkCount = (body.match(/href="\/novels\//g) ?? []).length;
      expect(novelLinkCount, 'expected at least one server-rendered novel card link in the raw SSR HTML').toBeGreaterThan(0);
    });

    /**
     * A real browser, so the client hydrates. The prefetched catalog queries carry a `staleTime` long enough that no browser-issued `GET /api/novels` should appear
     * between navigation and network-idle, and no tracked `/api/*` GET should be seen twice for the identical URL (what a query that refetches instead of hydrating does).
     */
    test('should not refetch SSR-hydrated queries after the client takes over on Web Novel', async ({ page }) => {
      const url = requireProductUrl('webNovel');

      const seenApiRequests: string[] = [];
      page.on('request', req => {
        if (req.method() !== 'GET') return;
        const { pathname, href } = new URL(req.url());
        if (!pathname.startsWith('/api/')) return;
        if (EXCLUDED_API_PATHS.some(excluded => pathname.startsWith(excluded))) return;
        seenApiRequests.push(href);
      });

      await page.goto(url, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle');

      const catalogRefetches = seenApiRequests.filter(href => new URL(href).pathname === '/api/novels');
      expect(catalogRefetches, `expected no client refetch of the SSR-prefetched catalog, saw: ${catalogRefetches.join(', ')}`).toHaveLength(0);

      const duplicates = seenApiRequests.filter((href, index) => seenApiRequests.indexOf(href) !== index);
      expect(duplicates, `expected no duplicate API GET requests after hydration, saw: ${duplicates.join(', ')}`).toHaveLength(0);
    });
  });

  /**
   * The raw HTTP contract behind Novel Forge's hop, complementing the browser-level `auth-gate.spec.ts`: the `_app.tsx` `beforeLoad` gate redirects unauthenticated
   * visitors server-side before any markup ships. A fresh `request` context carries no cookies, so it is already unauthenticated.
   */
  test('should redirect an unauthenticated SSR request toward login for Novel Forge', async ({ request }) => {
    const url = requireProductUrl('novelForge');

    const response = await request.get(`${url}/`, { maxRedirects: 0 });
    expect([302, 307]).toContain(response.status());

    const location = response.headers()['location'] ?? '';
    expect(location, `expected a redirect toward /login, got Location: "${location}"`).toMatch(/\/login/i);
  });
});
