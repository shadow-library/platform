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
import { DatabaseModule } from '@server/modules/infrastructure/datastore';

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
  imports: [DatabaseModule, SessionModule, CredentialsModule, OrganisationModule],
  controllers: [MeController],
  providers: [UserService, UserEmailService],
  exports: [UserService, UserEmailService],
})
export class UserModule {}
