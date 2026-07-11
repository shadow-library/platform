/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { NotificationModule } from '@server/modules/infrastructure/notification';

import { WorkerService } from './worker.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [NotificationModule],
  providers: [WorkerService],
})
export class WorkerModule {}
