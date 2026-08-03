/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { PERSONAS, requireProductUrl } from '../../lib';
import { loginIdentity, scopedMutate } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The platform's single-sign-on contract, exercised end to end in one fresh browser context with no saved state:
 * a single credential prompt at identity, then every consumer app signs the user in silently off identity's
 * central `__Host-sid` session (the OIDC hop auto-completes — `/oauth2/authorize` sees the session and never
 * shows a prompt). One login is spent here against identity's 20/hour `login/init` limit, so this whole flow is a
 * single `test` rather than several, and it does not run in the parallel persona pool the other specs reuse.
 *
 * The second half asserts the platform's real *logout* semantics. Identity-side signout clears the central
 * `__Host-sid`, so identity's own portal must bounce to login again. Each consumer app's session is a separate
 * opaque handle in that app's own store (`__Host-shadow-session`), with no back-channel logout wired to identity
 * signout (identity's `terminateAllForUser` only touches its own session table + Redis) — so those app sessions
 * are expected to *survive* an identity signout. This spec records that behaviour precisely rather than assuming
 * it: whichever way the deployed platform behaves, the assertions below are the observed truth.
 */
const IDENTITY_LOGIN_PATTERN = /identity\.shadow-apps\.test\/login/i;

test.describe('single sign-on across apps', () => {
  test('should sign in once at identity and ride that session silently into every consumer app', async ({ browser }) => {
    // One login + two multi-hop OIDC navigations + a signout dance comfortably exceed the 30s default.
    test.setTimeout(120_000);

    const identityUrl = requireProductUrl('identity');
    const novelForgeUrl = requireProductUrl('novelForge');
    const webNovelUrl = requireProductUrl('webNovel');
    const user2 = PERSONAS.user2;

    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const page = await context.newPage();

      // The single credential prompt. `page.request` shares the browser context's cookie jar, so `__Host-sid`
      // lands where the subsequent navigations will read it.
      await loginIdentity(page.request, identityUrl, user2.email, user2.password);

      // Novel Forge: hitting a gated route with no app session kicks off the OIDC hop, which finds `__Host-sid`
      // and completes without a prompt — the browser is expected to settle back on Novel Forge's own origin.
      await page.goto(`${novelForgeUrl}/`);
      await expect(page, 'SSO should land back on Novel Forge, not stall on identity login').not.toHaveURL(IDENTITY_LOGIN_PATTERN, { timeout: 30_000 });
      expect(new URL(page.url()).origin, 'expected to end up on the Novel Forge origin after the silent hop').toBe(new URL(novelForgeUrl).origin);
      const forgeSession = await page.request.get(`${novelForgeUrl}/api/auth/session`);
      expect(forgeSession.status(), 'Novel Forge should now report an authenticated session').toBe(200);

      // Web Novel: entering the OIDC login route must complete silently off `__Host-sid` (no credential prompt at
      // identity) and land on the gated `/library` — the reader's only session-gated route. Web Novel's own `/login`
      // is a client-side shim, so this exercises the SSO hop directly, the way `auth.setup` does.
      await page.goto(`${webNovelUrl}/api/auth/login?return_to=/library`);
      await expect(page, 'SSO should complete silently and open /library, never stall on an identity credential prompt').toHaveURL(/\/library/i, { timeout: 30_000 });
      await expect(page, 'the silent SSO hop must not have shown identity a credential prompt').not.toHaveURL(IDENTITY_LOGIN_PATTERN);
      const webNovelSession = await page.request.get(`${webNovelUrl}/api/auth/session`);
      expect(webNovelSession.status(), 'Web Novel should now report an authenticated session').toBe(200);

      // Identity-side signout: clears the central `__Host-sid`. Mutating + cookie present ⇒ CSRF double-submit,
      // scoped to identity's own origin so a sibling app's token is never sent by mistake.
      const signout = await scopedMutate(page.request, identityUrl, 'post', '/api/v1/auth/signout', { seedPath: '/api/v1/me' });
      expect(signout.status(), 'identity signout should succeed (204 No Content)').toBe(204);

      // Identity's portal must now demand a fresh login — the central session is gone.
      await page.goto(`${identityUrl}/`);
      await expect(page, 'after signout identity must bounce back to its login').toHaveURL(/\/login/i, { timeout: 30_000 });

      // Observed logout semantics: the consumer app sessions are independent opaque handles with no back-channel
      // logout from identity signout, so they SURVIVE. Recorded here as the platform's real behaviour.
      const webNovelAfter = await page.request.get(`${webNovelUrl}/api/auth/session`);
      expect(webNovelAfter.status(), "identity signout must NOT revoke Web Novel's independent app session").toBe(200);
      const forgeAfter = await page.request.get(`${novelForgeUrl}/api/auth/session`);
      expect(forgeAfter.status(), "identity signout must NOT revoke Novel Forge's independent app session").toBe(200);
    } finally {
      await context.close();
    }
  });
});
