/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { NotificationModule } from '@modules/notification';

import { NotificationController } from './notification.controller';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [NotificationModule],
  controllers: [NotificationController],
})
export class NotificationRoutesModule {}
