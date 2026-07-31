/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { SessionAuthService } from './session-auth.service';
import { SessionService } from './session.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule],
  providers: [SessionService, SessionAuthService],
  exports: [SessionService, SessionAuthService],
})
export class SessionModule {}
