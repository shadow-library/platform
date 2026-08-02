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

import { InternalServiceGuard } from './internal-service.middleware';
import { PublishAuditTrailer } from './publish-audit.middleware';
import { PublishAuditService } from './publish-audit.service';
import { PublishController } from './publish.controller';
import { PublishService } from './publish.service';
import { WikiIngestController } from './wiki-ingest.controller';
import { WikiIngestService } from './wiki-ingest.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, FastifyModule],
  controllers: [PublishController, WikiIngestController, InternalServiceGuard, PublishAuditTrailer],
  providers: [PublishService, WikiIngestService, PublishAuditService],
  exports: [PublishService],
})
export class PublishModule {}
