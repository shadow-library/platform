/**
 * Importing npm packages
 */
import { type APIResponse, expect, request, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, readSeedManifest, requireProductUrl } from '../../lib';
import { cookieFromStorageState, scopedMutate } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Request-level coverage of the platform's service-boundary hardening — the guards that keep an ordinary browser
 * principal out of the service-to-service surfaces, and the double-submit CSRF that keeps a cross-site page from
 * riding a victim's session. Error *codes* are asserted, not just statuses, because the code is the contract:
 *  - `IAM_001` (401) unauthenticated, `IAM_002` (403) principal-not-permitted — both from `@shadow-library/auth`.
 *  - `ADM_001` (403) insufficient administrative privilege — identity's admin guard.
 *  - `S010`   (403) CSRF double-submit failure — the shared `@shadow-library/fastify` security policy.
 *
 * The health-endpoint exposure sub-check is deliberately absent here: `tests/health-not-exposed.spec.ts` already
 * probes `/health/live` AND `/health/ready` across all four products for the raw internal contract, so repeating
 * it would only duplicate. The unlisted-service-client case for pulse is also skipped — it needs a real service
 * token this suite cannot mint — and is called out in the run report instead.
 */
const WEB_NOVEL_HANDLE = '__Host-shadow-session';

test.describe('internal api security', () => {
  const { webNovel } = readSeedManifest();

  test.describe("web-novel's forge-only /internal/* surface is not reachable from the public edge", () => {
    /**
     * Observed against the deployed k3d ingress: the public origin routes `/api/*` to web-novel-server but does
     * NOT route `/internal/*` to it at all — those paths fall through to the web-novel-web SSR app, which answers
     * every unmatched path with its own `404` HTML shell (title "Shadow Webnovel"). So the forge→web-novel publish
     * surface is unreachable from the internet even before its `@RequireScope('web-novel:publish')` +
     * InternalServiceGuard would speak; those guards defend the in-cluster `svc://` path, which no browser can
     * take. This is the strongest posture — an unrouted surface can't leak a contract — so the assertion is that
     * these paths behave like the app's 404 shell, never like the internal JSON API (no 2xx, no `web-novel:*`
     * error contract).
     */
    const assertNotInternalApi = async (response: APIResponse): Promise<void> => {
      expect(response.status(), 'the internal surface must not answer on the public edge').toBe(404);
      const contentType = response.headers()['content-type'] ?? '';
      expect(contentType, 'a public probe of /internal/* should get the web app shell, not the internal JSON API').toContain('html');
    };

    test('should not serve an internal GET manifest to an unauthenticated caller', async () => {
      const ctx = await apiContext('webNovel');
      await assertNotInternalApi(await ctx.get(`/internal/novels/${webNovel.publicSlug}/manifest`));
    });

    test('should not serve an internal GET manifest to a user-kind browser session', async () => {
      const ctx = await apiContext('webNovel', 'user1');
      await assertNotInternalApi(await ctx.get(`/internal/novels/${webNovel.publicSlug}/manifest`));
    });

    test('should not process an internal PUT bearing a token', async () => {
      const ctx = await apiContext('webNovel');
      const response = await ctx.put(`/internal/novels/${webNovel.publicSlug}`, {
        headers: { authorization: 'Bearer not-a-real-token' },
        data: { title: 'x', visibility: 'PUBLIC', revision: 1 },
      });
      // A PUT the frontend never handles must not become an applied write — the internal API is simply not here.
      expect(response.status(), 'an internal PUT must not be accepted on the public edge').not.toBe(200);
      expect(response.status(), 'the public edge treats /internal/* as an unknown path').toBe(404);
    });
  });

  test('should 401 IAM_001 an unauthenticated post to pulse notifications', async () => {
    // user1 cannot obtain a pulse session (INTERNAL app), so its identity cookies are simply not sent to the pulse
    // origin — this is the no-token path. (The unlisted-service-client → IAM_002 case needs a mintable service
    // token and is documented in the report rather than tested here.)
    const ctx = await apiContext('pulse', 'user1');
    const response = await ctx.post('/api/v1/notifications', { data: { templateKey: 'auth.login.otp', recipients: { email: 'nobody@shadow-apps.test' } } });
    expect(response.status()).toBe(401);
    expect(((await response.json()) as { code?: string }).code).toBe('IAM_001');
  });

  test.describe('identity admin API refuses a plain user without leaking data', () => {
    const adminReads = ['/api/v1/admin/users', '/api/v1/admin/clients'] as const;
    for (const path of adminReads) {
      test(`should 403 ADM_001 on GET ${path}`, async () => {
        const ctx = await apiContext('identity', 'user2');
        const response = await ctx.get(path);
        expect(response.status()).toBe(403);
        const body = (await response.json()) as { code?: string };
        expect(body.code).toBe('ADM_001');
        // A denial must not itself become a data leak — no user records, no other accounts' emails in the body.
        expect(JSON.stringify(body), 'the error body must not carry any account data').not.toContain('@shadow-apps');
        expect(body).not.toHaveProperty('items');
      });
    }

    test('should 403 an admin mutation from a plain user at the step-up gate', async () => {
      // CSRF-correct (double-submit satisfied) AND a valid `LockUserBody` (`mode` is required — an empty body is
      // rejected at DTO validation with 422 before any guard runs), so the 403 is a pure authorization decision.
      // Observed order on `@Auth({ permission: usersManage, elevated: true })`: the *elevation* gate is evaluated
      // before the permission gate, so an unelevated principal — plain user or admin alike — is turned away with
      // AUTH_006 (step-up required) and never reaches the ADM_001 permission check. Either way the mutation is
      // refused; the ADM_001 permission denial itself is already proven on the GET admin reads above.
      const identityUrl = requireProductUrl('identity');
      const ctx = await apiContext('identity', 'user2');
      const response = await scopedMutate(ctx, identityUrl, 'post', '/api/v1/admin/users/2/lock', { seedPath: '/api/v1/me', data: { mode: 'FULL' } });
      expect(response.status()).toBe(403);
      expect(((await response.json()) as { code?: string }).code).toBe('AUTH_006');
    });
  });

  test.describe('web-novel CSRF double-submit on a consumer mutation', () => {
    test('should reject a POST /api/library with no CSRF token', async () => {
      const ctx = await apiContext('webNovel', 'user1');
      // The session cookie is present, so CSRF is enforced; no `x-csrf-token` header ⇒ S010.
      const response = await ctx.post('/api/library', { data: { slug: webNovel.publicSlug } });
      expect(response.status()).toBe(403);
      expect(((await response.json()) as { code?: string }).code).toBe('S010');
    });

    test('should reject a POST /api/library with a mismatched CSRF token', async () => {
      const ctx = await apiContext('webNovel', 'user1');
      await ctx.get('/api/auth/session');
      const response = await ctx.post('/api/library', { headers: { 'x-csrf-token': 'deadbeef-not-the-real-token' }, data: { slug: webNovel.publicSlug } });
      expect(response.status()).toBe(403);
      expect(((await response.json()) as { code?: string }).code).toBe('S010');
    });

    test('should accept a POST /api/library with the correct double-submit token', async () => {
      const webNovelUrl = requireProductUrl('webNovel');
      const ctx = await apiContext('webNovel', 'user1');
      // Adding the seeded public novel is idempotent (204 whether or not it was already in user1's library), so this
      // leaves the seeded library state intact for other specs.
      const response = await scopedMutate(ctx, webNovelUrl, 'post', '/api/library', { data: { slug: webNovel.publicSlug } });
      expect(response.status()).toBe(204);
    });
  });

  test("should not authenticate on Novel Forge with Web Novel's session handle", async () => {
    // An opaque app-session handle is only meaningful in the store that issued it. Copy user1's Web Novel handle
    // onto the Novel Forge origin and it must resolve to nobody there — proving the handles aren't portable.
    const novelForgeUrl = requireProductUrl('novelForge');
    const handle = cookieFromStorageState('user1', WEB_NOVEL_HANDLE, 'webnovel.shadow-apps.test');
    const ctx = await request.newContext({
      ignoreHTTPSErrors: true,
      storageState: {
        cookies: [{ name: WEB_NOVEL_HANDLE, value: handle, domain: 'novelforge.shadow-apps.test', path: '/', httpOnly: true, secure: true, sameSite: 'Lax', expires: -1 }],
        origins: [],
      },
    });
    try {
      const response = await ctx.get(`${novelForgeUrl}/api/auth/session`);
      expect(response.status(), "a foreign app's opaque handle must not authenticate on Novel Forge").toBe(401);
    } finally {
      await ctx.dispose();
    }
  });
});
