/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DatabaseModule } from '@modules/infrastructure/datastore';

import { ApplicationRoleService } from './application-role.service';
import { ApplicationService } from './application.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule],
  providers: [ApplicationService, ApplicationRoleService],
  exports: [ApplicationService, ApplicationRoleService],
})
export class ApplicationModule {}
