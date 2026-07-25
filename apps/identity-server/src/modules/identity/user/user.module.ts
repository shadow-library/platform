/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { SessionModule } from '@server/modules/auth/session';
import { CredentialsModule } from '@server/modules/identity/credentials';
import { OrganisationModule } from '@server/modules/identity/organisation';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { NotificationModule } from '@server/modules/infrastructure/notification';
import { ApplicationModule } from '@server/modules/system/application';

import { MeApplicationController } from './me-application.controller';
import { MeController } from './me.controller';
import { UserEmailService } from './user-email.service';
import { UserService } from './user.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, SessionModule, CredentialsModule, OrganisationModule, ApplicationModule, AuditModule, NotificationModule],
  controllers: [MeController, MeApplicationController],
  providers: [UserService, UserEmailService],
  exports: [UserService, UserEmailService],
})
export class UserModule {}
