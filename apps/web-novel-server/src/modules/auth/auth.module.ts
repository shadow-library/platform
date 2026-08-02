/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { forwardRef, type Import, Module } from '@shadow-library/app';
import { AuthModule } from '@shadow-library/auth/module';
import { FastifyModule } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { OptionalAuthResolver } from './optional-auth.middleware';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The auth SDK's dynamic module carries a live `AuthClient` in a value provider, and `@Module`
 * deep-freezes everything reachable from its metadata. The forwardRef defers construction to
 * module resolution — after the freeze — so the client stays mutable.
 */
const DeferredAuthModule = forwardRef(() => AuthModule.forRoot({ routes: { basePath: '/api/auth' } })) as unknown as Import;

/**
 * Wraps the SDK's auth module so this app can add a middleware of its own beside the SDK's guard.
 *
 * `OptionalAuthResolver` lives here rather than with the catalog routes it serves because a dynamic
 * module may carry its `forRoot` metadata exactly once: whichever module imports it owns the
 * `AuthClient` and `AppSessionService` singletons, and a second importer is rejected outright. Any
 * module that merely wants to *read* the resolved principal needs none of this — it reads
 * `ContextService`, exactly as the reader routes already do.
 */
@Module({
  imports: [DeferredAuthModule, FastifyModule],
  controllers: [OptionalAuthResolver],
})
export class WebNovelAuthModule {}
