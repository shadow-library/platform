/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { getProductLabel, isApiHealthEnabled, PRODUCTS, requireProductUrl } from '../lib';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * `packages/modules/src/http-core/services/health.service.ts` is the platform's shared liveness/readiness
 * contract, wired via `HttpCoreModule` in every server: `GET /health/live` always answers `200` with body
 * `ok`; `GET /health/ready` answers `200 ok` once the app has finished starting, `503 not ready`
 * otherwise. Opt-in behind `E2E_API_HEALTH=1` — an ingress that doesn't proxy these paths through to the
 * app is a real finding about the deployment, not something this suite should soften by picking a
 * friendlier path.
 */
test.describe('api health', () => {
  test.skip(!isApiHealthEnabled(), 'E2E_API_HEALTH is not set to "1" — skipping opt-in API health checks');

  for (const product of PRODUCTS) {
    test(`should report live + ready for ${getProductLabel(product)}`, async ({ request }) => {
      const url = requireProductUrl(product);

      const live = await request.get(`${url}/health/live`);
      expect(live.status(), `GET ${url}/health/live`).toBe(200);
      expect((await live.text()).trim(), `GET ${url}/health/live body`).toBe('ok');

      const ready = await request.get(`${url}/health/ready`);
      expect([200, 503], `GET ${url}/health/ready returned ${ready.status()}`).toContain(ready.status());
      expect((await ready.text()).trim(), `GET ${url}/health/ready body`).toBe(ready.status() === 200 ? 'ok' : 'not ready');
    });
  }
});
