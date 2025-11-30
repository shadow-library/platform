/**
 * Importing npm packages
 */
import { Module, OnModuleInit } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { DatastoreModule } from '@server/modules/infrastructure/datastore';

import { UserEmailService } from './user-email.service';
import { UserService } from './user.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatastoreModule],
  providers: [UserService, UserEmailService],
  exports: [UserService, UserEmailService],
})
export class UserModule implements OnModuleInit {
  private readonly logger = Logger.getLogger(APP_NAME, UserModule.name);

  constructor(private readonly userService: UserService) {}

  async onModuleInit(): Promise<void> {
    const SUPER_ADMIN_EMAIL = 'super-admin@shadow-apps.com';
    const superAdmin = await this.userService.getUser(SUPER_ADMIN_EMAIL);
    if (superAdmin) {
      this.logger.info('Super admin user already exists.');
      return;
    }

    this.logger.info('No super admin user found, creating one');
    const createdUser = await this.userService.createUserWithPassword({
      email: SUPER_ADMIN_EMAIL,
      password: 'Password@123',
      firstName: 'Super',
      lastName: 'Admin',
      emailVerified: true,
      status: 'ACTIVE',
    });

    this.logger.info(`Super admin user created with ID: ${createdUser.id}`);
  }
}
