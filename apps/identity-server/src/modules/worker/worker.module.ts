/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { TokenModule } from '@server/modules/auth/token';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { NotificationModule } from '@server/modules/infrastructure/notification';
import { WebhookModule } from '@server/modules/infrastructure/webhook';

import { MaintenanceService } from './maintenance.service';
import { WorkerService } from './worker.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, NotificationModule, TokenModule, WebhookModule],
  providers: [WorkerService, MaintenanceService],
})
export class WorkerModule {}
