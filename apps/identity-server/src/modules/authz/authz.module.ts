/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { AuthzController } from './authz.controller';
import { PolicyDecisionService } from './policy-decision.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule],
  controllers: [AuthzController],
  providers: [PolicyDecisionService],
  exports: [PolicyDecisionService],
})
export class AuthzModule {}
