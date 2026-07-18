/**
 * Importing npm packages
 */
import { forwardRef, type Import } from '@shadow-library/app';
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
 * Deferred with `forwardRef` for two load-bearing reasons: the root `@Module` decorator
 * deep-freezes everything reachable from its metadata, which would freeze the live
 * `AuthClient`/`RelyingParty` instances the SDK registers via `useValue` (breaking their internal
 * caches at runtime); and deferral moves auth-config resolution from import time to application
 * scan time, so tests can inject a per-file mock IdP first. The cast bridges `forwardRef`'s
 * class-oriented typing to the dynamic module it actually resolves — the module scanner handles
 * both.
 */
const DeferredSessionModule = forwardRef(() => SessionModule.forRoot()) as unknown as Import;

export const HttpRouteModule = FastifyModule.forRoot({
  imports: [AppHttpCoreModule, DeferredSessionModule, ConfigurationModule, NotificationModule, TemplateModule, MetricsModule],

  transformers: CUSTOM_DATA_TRANSFORMERS,
});
