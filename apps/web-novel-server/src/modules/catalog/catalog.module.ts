/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DatabaseModule } from '@server/modules/datastore';
import { AuthClient } from '@shadow-library/auth';
import { resolveAuthClientConfig } from '@shadow-library/auth/module';
import { FastifyModule } from '@shadow-library/fastify';

import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { NovelAccessService } from './novel-access.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * The membership lookup rides a module-owned `AuthClient` built from the SDK's own config resolver —
 * the same `AUTH_ISSUER`/`AUTH_APP_ID`/credential the guard's client uses, so it authenticates as
 * the same client and discovers the same registration. It is a separate instance rather than a
 * re-export because `AuthModule.forRoot` may be imported exactly once, and only its importer holds
 * the singleton (`WebNovelAuthModule`); the sole cost here is a second M2M token cache, which is the
 * same trade `novel-forge-server`'s publishing module already makes.
 *
 * Reading the resolved principal needs none of that — `ContextService` carries it, whether the SDK's
 * guard or `OptionalAuthResolver` put it there.
 */
@Module({
  imports: [DatabaseModule, FastifyModule],
  controllers: [CatalogController],
  providers: [CatalogService, NovelAccessService, { token: AuthClient, useFactory: () => new AuthClient(resolveAuthClientConfig()) }],
  exports: [CatalogService, NovelAccessService],
})
export class CatalogModule {}
