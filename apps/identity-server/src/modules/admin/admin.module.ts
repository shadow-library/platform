/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { SessionModule } from '@server/modules/auth/session';
import { AuthzModule } from '@server/modules/authz';
import { OrganisationModule } from '@server/modules/identity/organisation';

import { AdminAccessService } from './admin-access.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [SessionModule, AuthzModule, OrganisationModule],
  providers: [AdminAccessService],
  exports: [AdminAccessService],
})
export class AdminModule {}
