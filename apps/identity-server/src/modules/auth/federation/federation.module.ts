/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { KeyModule } from '@server/modules/auth/keys';
import { SessionModule } from '@server/modules/auth/session';
import { OrganisationModule } from '@server/modules/identity/organisation';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { WebhookModule } from '@server/modules/infrastructure/webhook';

import { FederatedIdentityService } from './federated-identity.service';
import { IdentityProviderController } from './identity-provider.controller';
import { IdentityProviderService } from './identity-provider.service';
import { UpstreamOidcService } from './upstream-oidc.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, KeyModule, SessionModule, OrganisationModule, AuditModule, WebhookModule],
  controllers: [IdentityProviderController],
  providers: [IdentityProviderService, UpstreamOidcService, FederatedIdentityService],
  exports: [IdentityProviderService, UpstreamOidcService, FederatedIdentityService],
})
export class FederationModule {}
