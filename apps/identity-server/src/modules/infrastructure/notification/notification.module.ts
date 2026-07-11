/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { NotificationClient } from './notification.client';
import { NotificationService } from './notification.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule],
  providers: [NotificationClient, NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
