/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { type DynamicModule, forwardRef, type Import } from '@shadow-library/app';
import { AuthModule } from '@shadow-library/auth/module';
import { Config } from '@shadow-library/common';
import { FastifyModule } from '@shadow-library/fastify';
import { HttpCoreModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { CatalogModule } from '@server/modules/catalog';
import { HealthModule } from '@server/modules/health';
import { PublishModule } from '@server/modules/publish';
import { ReaderModule } from '@server/modules/reader';
import { SessionModule } from '@server/modules/session';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Routes carry explicit full paths at the controller level: the public surface lives under
 * `/api/*`, the forge-facing push surface under `/internal/*` (never exposed publicly), and
 * health probes at the root. `AuthModule` registers the bearer guard for the internal routes;
 * reader endpoints authenticate via the session cookie inside their controllers.
 */

export const AppHttpCoreModule = HttpCoreModule.forRoot({
  /** OpenAPI is generated from the class-schema DTOs and served (non-prod) at `/dev/api-docs/openapi.json` */
  openapi: { normalizeSchemaIds: true },
});

/**
 * The auth SDK's dynamic module carries a live `AuthClient` in a value provider, and `@Module`
 * deep-freezes everything reachable from its metadata. The forwardRef defers construction to
 * module resolution — after the freeze — so the client stays mutable; memoized so repeated
 * resolution never mints a second client.
 */
let authModule: DynamicModule | undefined;
const DeferredAuthModule = forwardRef(() => (authModule ??= AuthModule.forRoot())) as unknown as Import;

export const HttpRouteModule = FastifyModule.forRoot({
  imports: [AppHttpCoreModule, DeferredAuthModule, HealthModule, SessionModule, PublishModule, CatalogModule, ReaderModule],

  host: Config.get('server.host'),
  port: Config.get('server.port'),
});
