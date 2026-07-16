/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { KeyModule } from '@server/modules/auth/keys';
import { SessionModule } from '@server/modules/auth/session';
import { TokenModule } from '@server/modules/auth/token';
import { UserModule } from '@server/modules/identity/user';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { ApplicationModule } from '@server/modules/system/application';

import { AccessTokenService } from './access-token.service';
import { AuthorizationCodeService } from './authorization-code.service';
import { ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';
import { MeConsentController } from './me-consent.controller';
import { OAuthClientService } from './oauth-client.service';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { WorkloadIdentityService } from './workload-identity.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, KeyModule, SessionModule, TokenModule, UserModule, AuditModule, ApplicationModule],
  controllers: [OAuthController, ConsentController, MeConsentController],
  providers: [OAuthClientService, AuthorizationCodeService, AccessTokenService, ConsentService, OAuthService, WorkloadIdentityService],
  exports: [OAuthClientService, AccessTokenService, ConsentService],
})
export class OAuthModule {}
