/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { DatabaseModule } from '@server/modules/datastore';

import { PublishAuditTrailer } from './publish-audit.middleware';
import { PublishAuditService } from './publish-audit.service';
import { PublishController } from './publish.controller';
import { PublishService } from './publish.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, FastifyModule],
  controllers: [PublishController, PublishAuditTrailer],
  providers: [PublishService, PublishAuditService],
  exports: [PublishService],
})
export class PublishModule {}
