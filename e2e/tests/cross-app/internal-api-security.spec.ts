import { type APIResponse, expect, request, test } from '@playwright/test';

import { apiContext, readSeedManifest, requireProductUrl } from '../../lib';
import { cookieFromStorageState, scopedMutate } from './helpers';

/**
 * Service-boundary hardening: the guards that keep a browser principal out of service-to-service surfaces, and the double-submit CSRF. Error codes are asserted
 * because the code is the contract: `IAM_001` (401) / `IAM_002` (403) from `@shadow-library/auth`, `ADM_001` (403) identity's admin guard, `S010` (403) CSRF failure.
 * Health exposure is in `health-not-exposed.spec.ts`. The unlisted-service-client case for pulse is not covered: it needs a service token this suite cannot mint.
 */
const WEB_NOVEL_HANDLE = '__Host-shadow-session';

test.describe('internal api security', () => {
  const { webNovel } = readSeedManifest();

  test.describe("web-novel's forge-only /internal/* surface is not reachable from the public edge", () => {
    /**
     * The public origin does not route `/internal/*` to web-novel-server: those paths fall through to web-novel-web, which answers every unmatched path with its own
     * 404 HTML shell. The forge->web-novel publish surface is therefore unreachable from the internet, so the assertion is that it behaves like that 404 shell, never
     * like the internal JSON API (no 2xx, no `web-novel:*` error contract).
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
      expect(response.status(), 'an internal PUT must not be accepted on the public edge').not.toBe(200);
      expect(response.status(), 'the public edge treats /internal/* as an unknown path').toBe(404);
    });
  });

  test('should 401 IAM_001 an unauthenticated post to pulse notifications', async () => {
    // No pulse session cookie is sent to the pulse origin: the no-token path.
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
        expect(JSON.stringify(body), 'the error body must not carry any account data').not.toContain('@shadow-apps');
        expect(body).not.toHaveProperty('items');
      });
    }

    test('should 403 an admin mutation from a plain user at the step-up gate', async () => {
      // CSRF-correct and a valid `LockUserBody`, so the 403 is a pure authorization decision. The elevation gate runs before the permission gate on
      // `@Auth({ permission: usersManage, elevated: true })`, so an unelevated principal gets AUTH_006 and never reaches ADM_001 (proven on the GET reads above).
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
      const response = await scopedMutate(ctx, webNovelUrl, 'post', '/api/library', { data: { slug: webNovel.publicSlug } });
      expect(response.status()).toBe(204);
    });
  });

  test("should not authenticate on Novel Forge with Web Novel's session handle", async () => {
    // A handle is only meaningful in the store that issued it: user1's Web Novel handle on the Novel Forge origin must resolve to nobody.
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
