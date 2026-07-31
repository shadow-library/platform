/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { OAuthModule } from '@server/modules/auth/oauth';
import { SessionModule } from '@server/modules/auth/session';
import { UserModule } from '@server/modules/identity/user';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { SecurityModule } from '@server/modules/infrastructure/security';
import { ApplicationModule } from '@server/modules/system/application';
import { PolicyModule } from '@server/modules/system/policy';

import { AppSessionController } from './app-session.controller';
import { AppSessionService } from './app-session.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, OAuthModule, SessionModule, UserModule, PolicyModule, SecurityModule, ApplicationModule],
  controllers: [AppSessionController],
  providers: [AppSessionService],
  exports: [AppSessionService],
})
export class AppSessionModule {}
