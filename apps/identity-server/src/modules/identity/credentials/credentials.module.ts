/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { PasswordPolicyService } from './password-policy.service';
import { PasswordService } from './password.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule],
  providers: [PasswordService, PasswordPolicyService],
  exports: [PasswordService, PasswordPolicyService],
})
export class CredentialsModule {}
