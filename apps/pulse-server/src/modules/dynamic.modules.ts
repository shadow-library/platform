/**
 * Importing npm packages
 */
import { forwardRef, type Import, Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';
import { HttpCoreModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { SessionModule } from '@modules/auth';
import { ConfigurationModule } from '@modules/configuration';
import { MetricsModule } from '@modules/metrics';
import { NotificationModule } from '@modules/notification';
import { TemplateModule } from '@modules/template';
import { CUSTOM_DATA_TRANSFORMERS } from '@server/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Controllers carry explicit, full paths (`/api/v1/*`, `/api/auth/*`) instead of a global
 * `routePrefix` + `prefixVersioning`: the first-party session surface is bound to the unversioned
 * `/api/auth/*` contract pulse-web is coded against, which a module-wide version prefix cannot
 * express.
 */
export const AppHttpCoreModule = HttpCoreModule.forRoot({
  csrf: {
    disabled: true,
  },

  openapi: {
    normalizeSchemaIds: true,
  },
});

/**
 * Deferred with `forwardRef` so `AuthModule.forRoot`'s config resolution runs at application scan
 * time rather than at import time — this is what lets a test point the SDK at its per-file mock IdP
 * (issuer, app id, credential) before the module graph loads. The SDK registers its live `AuthClient`
 * via `useFactory`, so the root `@Module`'s metadata deep-freeze never reaches the instance or its
 * caches. The cast bridges `forwardRef`'s class-oriented typing to the dynamic module it actually
 * resolves — the module scanner handles both.
 */
const DeferredSessionModule = forwardRef(() => SessionModule.forRoot()) as unknown as Import;

/**
 * `HttpCoreModule` and the auth SDK both construct a provider that injects the `FASTIFY_INSTANCE`
 * factory token, and both import `FastifyModule` — so each forms an init cycle with it. The app
 * framework breaks such a cycle by initialising the module with the smallest import count first, and
 * a factory-provided token cannot stand in as a cycle-breaking prototype: whichever of the two the
 * ordering places *before* `FastifyModule` fails to construct. Bundling both under a single
 * `FastifyModule` child collapses them into one cyclic import, so `FastifyModule`'s far higher
 * `requiredBy` wins the tie and it — and thus `FASTIFY_INSTANCE` — initialises before either
 * consumer. Kept as a `FastifyModule` descendant (not a sibling) so its controllers still register
 * with the router.
 */
@Module({ imports: [AppHttpCoreModule, DeferredSessionModule] })
class PlatformModule {}

export const HttpRouteModule = FastifyModule.forRoot({
  imports: [PlatformModule, ConfigurationModule, NotificationModule, TemplateModule, MetricsModule],

  transformers: CUSTOM_DATA_TRANSFORMERS,
});
