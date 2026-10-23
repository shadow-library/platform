import { expect, test } from '@playwright/test';

import { getProductLabel, PRODUCTS, requireProductUrl } from '../lib';

/**
 * `health.service.ts` (`packages/modules`) serves liveness/readiness on a separate internal port (`health.port`, default 8081), never the public app port an ingress fronts.
 * A public origin may 404 `/health/*` or fall through to an app shell that answers 200 `text/html`, so status alone cannot tell them apart from a leak. The spec asserts the
 * response shape instead: the raw contract is a `200` with a bare `text/*` body of `ok` or `not ready`, and anything else passes.
 *
 * Web Novel's private mode does not change this: its `@Public()` `HealthController` is on the app port, and on the public origin `/health/*` reaches the web app,
 * which redirects an anonymous probe to its login page (`text/html`).
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

        // 200 'ok' is the live/ready shape and 503 'not ready' the readiness-failure shape: a leak either way.
        const looksLikeRawHealthContract = (response.status() === 200 || response.status() === 503) && !contentType.includes('html') && (body === 'ok' || body === 'not ready');
        expect(
          looksLikeRawHealthContract,
          `${url}${path} looks like it exposes the internal health contract (status ${response.status()}, content-type "${contentType}", body "${body.slice(0, 50)}")`,
        ).toBe(false);
      }
    });
  }
});
