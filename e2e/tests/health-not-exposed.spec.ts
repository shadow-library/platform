/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { getProductLabel, PRODUCTS, requireProductUrl } from '../lib';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * `packages/modules/src/http-core/services/health.service.ts` is the platform's shared liveness/readiness
 * contract, but it's wired to a *separate internal port* (`health.port`, default 8081) for the cluster's
 * own load-balancer/Docker healthcheck — by design, never the public app port an ingress fronts. Observed
 * against the local k3d ingress (`kubectl get ingress -A` + direct probes): identity, novel-forge, and
 * web-novel answer `/health/live` and `/health/ready` with a 404 (no such route on the public app router);
 * pulse answers `200 text/html` — its SPA build serves `index.html` as a catch-all for *any* unmatched
 * path, which is not health exposure either, just routing that doesn't 404. So this spec can't assert on
 * HTTP status alone (pulse's 200 would look identical to a real health response by status); it asserts on
 * the response shape instead — the raw contract is exactly a `200` with a bare `text/*` body of `ok` or
 * `not ready` (see `health.service.ts`), so anything else (any non-2xx, or a 2xx `text/html` app shell)
 * passes.
 *
 * Always on for every configured product (no opt-in) — this is the platform's own stated design intent
 * ("health is never internet-exposed"), not a soft opt-in check like the old `api-health.spec.ts` this
 * replaces.
 */
const HEALTH_PATHS = ['/health/live', '/health/ready'] as const;

test.describe('health not exposed', () => {
  for (const product of PRODUCTS) {
    test(`should not expose the internal health contract on ${getProductLabel(product)}`, async ({ request }) => {
      const url = requireProductUrl(product);

      for (const path of HEALTH_PATHS) {
        const response = await request.get(`${url}${path}`);
        const contentType = response.headers()['content-type'] ?? '';
        const body = (await response.text()).trim();

        // 200 'ok' is the live/ready-success shape; 503 'not ready' is the readiness-failure shape - a leak either way.
        const looksLikeRawHealthContract = (response.status() === 200 || response.status() === 503) && !contentType.includes('html') && (body === 'ok' || body === 'not ready');
        expect(
          looksLikeRawHealthContract,
          `${url}${path} looks like it exposes the internal health contract (status ${response.status()}, content-type "${contentType}", body "${body.slice(0, 50)}")`,
        ).toBe(false);
      }
    });
  }
});
