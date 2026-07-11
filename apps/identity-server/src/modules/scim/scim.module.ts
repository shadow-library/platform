/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { KeyModule } from '@server/modules/auth/keys';
import { OAuthModule } from '@server/modules/auth/oauth';
import { SessionModule } from '@server/modules/auth/session';
import { TokenModule } from '@server/modules/auth/token';
import { OrganisationModule } from '@server/modules/identity/organisation';
import { UserModule } from '@server/modules/identity/user';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { ScimAuthService } from './scim-auth.service';
import { ScimGroupService } from './scim-group.service';
import { ScimUserService } from './scim-user.service';
import { ScimController } from './scim.controller';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, KeyModule, OAuthModule, SessionModule, TokenModule, OrganisationModule, UserModule, AuditModule],
  controllers: [ScimController],
  providers: [ScimAuthService, ScimUserService, ScimGroupService],
  exports: [ScimUserService, ScimGroupService],
})
export class ScimModule {}
