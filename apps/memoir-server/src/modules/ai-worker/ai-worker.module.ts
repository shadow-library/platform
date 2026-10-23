import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { BillingModule } from '@modules/billing';
import { InferenceModule } from '@modules/inference';
import { NotificationsModule } from '@modules/notifications';
import { SchedulerModule } from '@modules/scheduler';
import { DatastoreModule } from '@server/database';

import { AiExecutorService } from './ai-executor.service';
import { AiReadRepository } from './ai-read.repository';
import { AiWorkerRepository } from './ai-worker.repository';
import { ReadAssemblyService } from './read-assembly.service';
import { ScheduledQueryRepository } from './scheduled-query.repository';

/**
 * In-process on the scheduler today; every claim is a Postgres claim, so it runs unchanged in a separate Deployment.
 * Imports `BillingModule` so the execution-time entitlement re-check derives the tier through `EntitlementService` rather than reading `entitlements` directly.
 */
@Module({
  imports: [DatabaseModule, DatastoreModule, SchedulerModule, BillingModule, InferenceModule, NotificationsModule],
  providers: [AiWorkerRepository, AiReadRepository, ScheduledQueryRepository, ReadAssemblyService, AiExecutorService],
  exports: [AiExecutorService, ReadAssemblyService],
})
export class AiWorkerModule {}
