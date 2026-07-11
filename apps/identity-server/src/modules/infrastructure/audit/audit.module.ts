/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { WebhookModule } from '@server/modules/infrastructure/webhook';

import { AuditService } from './audit.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, WebhookModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
