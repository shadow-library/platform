/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { AdminModule } from '@server/modules/admin';
import { KeyModule } from '@server/modules/auth/keys';
import { SessionModule } from '@server/modules/auth/session';
import { OrganisationModule } from '@server/modules/identity/organisation';

import { AccessGuard } from './access.guard';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The guard sits above every feature module: it is registered once here and applied to every route
 * by the Fastify router, resolving each route's declared `@Auth`. Nothing imports this module in
 * return — controllers depend only on the `@Auth` decorator and `getAuth` accessor (the barrel),
 * never on the guard — so aggregating Session/Admin/Organisation/Key services here raises no cycle.
 */

@Module({
  imports: [SessionModule, AdminModule, OrganisationModule, KeyModule],
  controllers: [AccessGuard],
})
export class AccessModule {}
