/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DatabaseModule } from '@modules/infrastructure/datastore';

import { ApplicationMemberService } from './application-member.service';
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
  providers: [ApplicationService, ApplicationRoleService, ApplicationMemberService],
  exports: [ApplicationService, ApplicationRoleService, ApplicationMemberService],
})
export class ApplicationModule {}
