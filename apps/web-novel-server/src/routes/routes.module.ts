/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Config } from '@shadow-library/common';
import { FastifyModule } from '@shadow-library/fastify';
import { HttpCoreModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { WebNovelAuthModule } from '@server/modules/auth';
import { CatalogModule } from '@server/modules/catalog';
import { HealthModule } from '@server/modules/health';
import { PublishModule } from '@server/modules/publish';
import { ReaderModule } from '@server/modules/reader';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Routes carry explicit full paths at the controller level: the public surface lives under
 * `/api/*`, the forge-facing push surface under `/internal/*` (never exposed publicly), and
 * health probes at the root. `AuthModule` owns the whole first-party auth surface — it registers
 * the bearer/session guard AND the browser login/callback/logout/session/step-up routes under
 * `/api/auth`, so the reader endpoints authenticate declaratively via `@Authenticated()`.
 */

export const AppHttpCoreModule = HttpCoreModule.forRoot({
  /** OpenAPI is generated from the class-schema DTOs and served (non-prod) at `/dev/api-docs/openapi.json` */
  openapi: { normalizeSchemaIds: true },
});

export const HttpRouteModule = FastifyModule.forRoot({
  imports: [AppHttpCoreModule, WebNovelAuthModule, HealthModule, PublishModule, CatalogModule, ReaderModule],

  host: Config.get('server.host'),
  port: Config.get('server.port'),
});
