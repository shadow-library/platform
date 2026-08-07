import { Module } from '@shadow-library/app';

import { KeyModule } from '@server/modules/auth/keys';
import { OAuthModule } from '@server/modules/auth/oauth';
import { SessionModule } from '@server/modules/auth/session';
import { TokenModule } from '@server/modules/auth/token';
import { AuthzModule } from '@server/modules/authz';
import { OrganisationModule } from '@server/modules/identity/organisation';
import { UserModule } from '@server/modules/identity/user';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { ApplicationModule } from '@server/modules/system/application';

import { ScimAuthService } from './scim-auth.service';
import { ScimGroupMappingService } from './scim-group-mapping.service';
import { ScimGroupService } from './scim-group.service';
import { ScimUserService } from './scim-user.service';
import { ScimController } from './scim.controller';

@Module({
  imports: [DatabaseModule, KeyModule, OAuthModule, SessionModule, TokenModule, AuthzModule, OrganisationModule, UserModule, AuditModule, ApplicationModule],
  controllers: [ScimController],
  providers: [ScimAuthService, ScimUserService, ScimGroupService, ScimGroupMappingService],
  exports: [ScimUserService, ScimGroupService, ScimGroupMappingService],
})
export class ScimModule {}
