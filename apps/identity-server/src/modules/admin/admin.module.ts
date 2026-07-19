/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { MfaModule } from '@server/modules/auth/mfa';
import { OAuthModule } from '@server/modules/auth/oauth';
import { SamlModule } from '@server/modules/auth/saml';
import { SessionModule } from '@server/modules/auth/session';
import { TokenModule } from '@server/modules/auth/token';
import { AuthzModule } from '@server/modules/authz';
import { OrganisationModule } from '@server/modules/identity/organisation';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { WebhookModule } from '@server/modules/infrastructure/webhook';
import { ApplicationModule } from '@server/modules/system/application';

import { AdminAccessService } from './admin-access.service';
import { AdminApplicationController } from './admin-application.controller';
import { AdminClientController } from './admin-client.controller';
import { AdminContextController } from './admin-context.controller';
import { AdminResourceController } from './admin-resource.controller';
import { AdminRoleController } from './admin-role.controller';
import { AdminSamlController } from './admin-saml.controller';
import { AdminServiceAccessController } from './admin-service-access.controller';
import { AdminUserController } from './admin-user.controller';
import { AdminUserService } from './admin-user.service';
import { AdminWebhookController } from './admin-webhook.controller';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, SessionModule, AuthzModule, OrganisationModule, TokenModule, MfaModule, AuditModule, OAuthModule, SamlModule, ApplicationModule, WebhookModule],
  controllers: [
    AdminContextController,
    AdminUserController,
    AdminApplicationController,
    AdminClientController,
    AdminResourceController,
    AdminRoleController,
    AdminSamlController,
    AdminServiceAccessController,
    AdminWebhookController,
  ],
  providers: [AdminAccessService, AdminUserService],
  exports: [AdminAccessService, AdminUserService],
})
export class AdminModule {}
