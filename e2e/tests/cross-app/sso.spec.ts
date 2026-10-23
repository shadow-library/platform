import { expect, test } from '@playwright/test';

import { PERSONAS, requireProductUrl } from '../../lib';
import { loginIdentity, scopedMutate } from './helpers';

/**
 * Single sign-on in one fresh browser context: one credential prompt at identity, then every consumer app signs in silently off identity's `__Host-sid` (the OIDC hop
 * auto-completes). It is one `test` because it spends one of identity's 20/hour `login/init`.
 *
 * Logout semantics: identity signout clears `__Host-sid`, so identity's portal bounces to login. Each consumer app's session is an independent opaque handle in its own store
 * (`__Host-shadow-session`) with no back-channel logout from signout, so it survives until its cached identity access token needs refreshing (~59 min for Novel Forge).
 * The assertions run seconds after signout, well inside that window.
 */
const IDENTITY_LOGIN_PATTERN = /identity\.shadow-apps\.test\/login/i;

test.describe('single sign-on across apps', () => {
  test('should sign in once at identity and ride that session silently into every consumer app', async ({ browser }) => {
    // One login, two multi-hop OIDC navigations and a signout exceed the 30s default.
    test.setTimeout(120_000);

    const identityUrl = requireProductUrl('identity');
    const novelForgeUrl = requireProductUrl('novelForge');
    const webNovelUrl = requireProductUrl('webNovel');
    const user2 = PERSONAS.user2;

    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const page = await context.newPage();

      await loginIdentity(page.request, identityUrl, user2.email, user2.password);

      // The web app starts the hop client-side after `goto` resolves (`routes/login.tsx`), so only the callback's response proves it ran; asserting the URL alone passed before
      // it began.
      const forgeCallback = page.waitForResponse(response => response.url().startsWith(`${novelForgeUrl}/api/auth/callback`), { timeout: 30_000 });
      await page.goto(`${novelForgeUrl}/`);
      expect((await forgeCallback).status(), 'the Novel Forge OIDC callback should establish the app session and redirect').toBe(302);
      await expect(page, 'SSO should land back on Novel Forge, not stall on identity login').not.toHaveURL(IDENTITY_LOGIN_PATTERN, { timeout: 30_000 });
      await expect(page, 'expected to end up on the Novel Forge origin after the silent hop').toHaveURL(
        url => url.origin === new URL(novelForgeUrl).origin && !url.pathname.startsWith('/api/auth'),
      );
      const forgeSession = await page.request.get(`${novelForgeUrl}/api/auth/session`);
      expect(forgeSession.status(), 'Novel Forge should now report an authenticated session').toBe(200);

      await page.goto(`${webNovelUrl}/api/auth/login?return_to=/library`);
      await expect(page, 'SSO should complete silently and open /library, never stall on an identity credential prompt').toHaveURL(/\/library/i, { timeout: 30_000 });
      await expect(page, 'the silent SSO hop must not have shown identity a credential prompt').not.toHaveURL(IDENTITY_LOGIN_PATTERN);
      const webNovelSession = await page.request.get(`${webNovelUrl}/api/auth/session`);
      expect(webNovelSession.status(), 'Web Novel should now report an authenticated session').toBe(200);

      // CSRF double-submit scoped to identity's own origin, so a sibling app's token is never sent.
      const signout = await scopedMutate(page.request, identityUrl, 'post', '/api/v1/auth/signout', { seedPath: '/api/v1/me' });
      expect(signout.status(), 'identity signout should succeed (204 No Content)').toBe(204);

      await page.goto(`${identityUrl}/`);
      await expect(page, 'after signout identity must bounce back to its login').toHaveURL(/\/login/i, { timeout: 30_000 });

      // Consumer app sessions survive identity signout until their cached access token next needs a refresh.
      const webNovelAfter = await page.request.get(`${webNovelUrl}/api/auth/session`);
      expect(webNovelAfter.status(), "identity signout must NOT revoke Web Novel's independent app session").toBe(200);
      const forgeAfter = await page.request.get(`${novelForgeUrl}/api/auth/session`);
      expect(forgeAfter.status(), "identity signout must NOT revoke Novel Forge's independent app session").toBe(200);
    } finally {
      await context.close();
    }
  });
});
