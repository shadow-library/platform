/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { authorizeCode, exchangeCode, introspect, relyingPartyClient, requireProductUrl } from '../../lib';
import { expect, test } from './fixtures';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * `GET /api/v1/templates` is the permission-gated route these cases are argued on: it carries
 * `@RequirePermission('pulse:templates:read')` and nothing else, so what it answers is decided by the credential
 * alone. Each refusal is followed by the call that must still succeed, on the same route, so a refusal can never
 * be read as the route being broken.
 */
const MANAGEMENT_ROUTE = '/api/v1/templates';

test.describe('auth guard', () => {
  test.beforeEach(() => requireProductUrl('pulse'));

  test('should refuse a staff session holding no pulse permission with 403 IAM_002, and admit one holding the route permission', async ({ pulse }) => {
    const permissionless = await pulse.staff({ label: 'guard-none' });
    const reader = await pulse.staff({ label: 'guard-reader', permissions: ['pulse:templates:read'] });

    const session = await permissionless.ctx.get('/api/auth/session');
    expect(session.status(), 'the refusal below must be a permission decision, not a missing session').toBe(200);
    const principal = (await session.json()) as { sub: string };
    expect(principal.sub).toBe(permissionless.user.sub);

    const refused = await permissionless.ctx.get(MANAGEMENT_ROUTE);
    expect(refused.status()).toBe(403);
    expect((await refused.json()) as { code?: string }).toMatchObject({ code: 'IAM_002' });

    const admitted = await reader.ctx.get(MANAGEMENT_ROUTE);
    expect(admitted.status(), await admitted.text()).toBe(200);
    expect((await admitted.json()) as { items: unknown[] }).toHaveProperty('items');
  });

  /**
   * The token is minted by identity's real authorization-code flow for a throwaway application's own
   * `api://<name>` resource, and identity's introspection is asked to confirm it is live and audience-bound before
   * pulse sees it — so the 401 is pulse refusing another audience's token, not pulse refusing a broken one.
   */
  test('should refuse a validly-signed bearer token minted for another audience with 401 IAM_001', async ({ pulse }) => {
    const staff = await pulse.staff({ label: 'guard-audience', permissions: ['pulse:templates:read'] });
    const application = await pulse.createOAuthApp('pulse-guard');
    const client = relyingPartyClient(application);
    const identityCtx = await pulse.identityCaller(staff);

    const tokenCtx = await pulse.identityAnonymous();
    const exchanged = await exchangeCode(tokenCtx, client, await authorizeCode(identityCtx, client, { resource: application.audience }));
    expect(exchanged.status(), await exchanged.text()).toBe(200);
    const { access_token: accessToken } = (await exchanged.json()) as { access_token: string };

    const introspection = await introspect(tokenCtx, client, accessToken);
    expect(introspection.active, 'the token must be live before pulse is asked to refuse it').toBe(true);
    expect(introspection.aud).toBe(application.audience);

    const guest = await pulse.guest();
    const refused = await guest.get(MANAGEMENT_ROUTE, { headers: { authorization: `Bearer ${accessToken}` } });
    expect(refused.status()).toBe(401);
    expect((await refused.json()) as { code?: string }).toMatchObject({ code: 'IAM_001' });

    const admitted = await staff.ctx.get(MANAGEMENT_ROUTE);
    expect(admitted.status(), 'the same subject reaches the route through its pulse session').toBe(200);
  });
});
