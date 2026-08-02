/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { requireProductUrl } from '../lib';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * All four apps are TanStack Start SSR: a route `loader` prefetches through TanStack Query server-side, the
 * HTML shipped to the browser already contains the fetched data, and the client rehydrates from that
 * dehydrated state instead of refetching on mount. This spec checks that contract at both ends for Web
 * Novel — the public, SEO-relevant app — and complements `auth-gate.spec.ts` with the raw redirect contract
 * for one gated app.
 *
 * `/api/auth/session`, `/api/auth/userinfo` (Web Novel's own auth surface — `session.api.ts`'s `fetchSession`/
 * `fetchUserInfo`) and `/api/v1/me` (the console apps' profile query) are excluded throughout: the suite's own
 * framing already documents the session query as one that intentionally refetches, so it is not evidence of a
 * hydration bug.
 */
const EXCLUDED_API_PATHS = ['/api/auth/session', '/api/auth/userinfo', '/api/v1/me'];

test.describe('ssr hydration', () => {
  /**
   * `apps/web-novel-web/src/routes/_shell/index.tsx`'s loader prefetches the catalog (`catalogQueryOptions`,
   * `apps/web-novel-web/src/lib/apis/novels.api.ts`, resolving to `GET /api/novels`); the shared `Shell`
   * (`packages/ui/src/components/Shell/Shell.tsx`) always renders `<main id="sh-main-content">` regardless of
   * content state, so that landmark alone (the one selector `public-reading.spec.ts` relies on) would not tell
   * a real catalog apart from an empty one. The home screen has no skeleton fallback on this route (unlike
   * Browse), so an empty catalog renders as an empty section, not a loading placeholder — a server-rendered
   * `<Link to="/novels/$slug">` (`apps/web-novel-web/src/components/novel/novel-card.tsx`) in the raw,
   * JS-free response is what actually distinguishes delivered data from an empty shell.
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
   * A real browser this time, so the client actually hydrates. The catalog queries prefetched by the loader
   * carry a `staleTime` long enough that a freshly hydrated client has no reason to refetch them on mount
   * (`novels.api.ts`), so no browser-issued `GET /api/novels` should appear at all in the window from
   * navigation through network-idle — and, more generally, no tracked `/api/*` GET should be seen twice for
   * the identical URL, which would be true of any query that refetches instead of hydrating warm.
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

  /**
   * `auth-gate.spec.ts` already covers the browser-level view for every product — a real page settling on a
   * URL containing `/login` after however many hops that takes. This probes the raw HTTP contract behind Novel
   * Forge's hop specifically: `_app.tsx`'s `beforeLoad` gate (`requireSession` → `@shadow-library/web/router`'s
   * `requireAuth`) is confirmed (per `auth-gate.spec.ts`'s own research) to redirect unauthenticated visitors
   * server-side, before any markup ships — unlike Pulse, whose currently-deployed build may still be the
   * pre-SSR-conversion SPA and would not answer this deterministically. A fresh `request` context starts with
   * no cookies, so this is already an unauthenticated request without needing to clear any.
   */
  test('should redirect an unauthenticated SSR request toward login for Novel Forge', async ({ request }) => {
    const url = requireProductUrl('novelForge');

    const response = await request.get(`${url}/`, { maxRedirects: 0 });
    expect([302, 307]).toContain(response.status());

    const location = response.headers()['location'] ?? '';
    expect(location, `expected a redirect toward /login, got Location: "${location}"`).toMatch(/\/login/i);
  });
});
