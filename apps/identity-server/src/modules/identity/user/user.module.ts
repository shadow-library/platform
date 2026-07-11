/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { UserEmailService } from './user-email.service';
import { UserService } from './user.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule],
  providers: [UserService, UserEmailService],
  exports: [UserService, UserEmailService],
})
export class UserModule {}
