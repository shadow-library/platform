/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { KeyModule } from '@server/modules/auth/keys';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { AuthzController } from './authz.controller';
import { PolicyDecisionService } from './policy-decision.service';
import { ServiceTokenGuard } from './service-token.guard';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, KeyModule],
  controllers: [AuthzController, ServiceTokenGuard],
  providers: [PolicyDecisionService],
  exports: [PolicyDecisionService],
})
export class AuthzModule {}
