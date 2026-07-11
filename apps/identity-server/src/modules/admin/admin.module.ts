/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { MfaModule } from '@server/modules/auth/mfa';
import { SessionModule } from '@server/modules/auth/session';
import { TokenModule } from '@server/modules/auth/token';
import { AuthzModule } from '@server/modules/authz';
import { OrganisationModule } from '@server/modules/identity/organisation';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { AdminAccessService } from './admin-access.service';
import { AdminUserController } from './admin-user.controller';
import { AdminUserService } from './admin-user.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, SessionModule, AuthzModule, OrganisationModule, TokenModule, MfaModule, AuditModule],
  controllers: [AdminUserController],
  providers: [AdminAccessService, AdminUserService],
  exports: [AdminAccessService, AdminUserService],
})
export class AdminModule {}
