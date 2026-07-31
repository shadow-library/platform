/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { OAuthModule } from '@server/modules/auth/oauth';
import { AuthzModule } from '@server/modules/authz';
import { OrganisationModule } from '@server/modules/identity/organisation';
import { UserModule } from '@server/modules/identity/user';
import { ApplicationModule } from '@server/modules/system/application';

import { BootstrapService } from './bootstrap.service';
import { EcosystemSeedService } from './ecosystem-seed.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [ApplicationModule, UserModule, OAuthModule, AuthzModule, OrganisationModule],
  providers: [BootstrapService, EcosystemSeedService],
  exports: [EcosystemSeedService],
})
export class BootstrapModule {}
