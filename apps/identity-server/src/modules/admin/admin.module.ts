/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { MfaModule } from '@server/modules/auth/mfa';
import { OAuthModule } from '@server/modules/auth/oauth';
import { SessionModule } from '@server/modules/auth/session';
import { TokenModule } from '@server/modules/auth/token';
import { AuthzModule } from '@server/modules/authz';
import { OrganisationModule } from '@server/modules/identity/organisation';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { ApplicationModule } from '@server/modules/system/application';

import { AdminAccessService } from './admin-access.service';
import { AdminClientController } from './admin-client.controller';
import { AdminResourceController } from './admin-resource.controller';
import { AdminRoleController } from './admin-role.controller';
import { AdminUserController } from './admin-user.controller';
import { AdminUserService } from './admin-user.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, SessionModule, AuthzModule, OrganisationModule, TokenModule, MfaModule, AuditModule, OAuthModule, ApplicationModule],
  controllers: [AdminUserController, AdminClientController, AdminResourceController, AdminRoleController],
  providers: [AdminAccessService, AdminUserService],
  exports: [AdminAccessService, AdminUserService],
})
export class AdminModule {}
