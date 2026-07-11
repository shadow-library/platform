/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { UserModule } from '@server/modules/identity/user';
import { ApplicationModule } from '@server/modules/system/application';

import { BootstrapService } from './bootstrap.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [ApplicationModule, UserModule],
  providers: [BootstrapService],
})
export class BootstrapModule {}
