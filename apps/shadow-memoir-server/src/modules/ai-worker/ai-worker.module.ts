import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { BillingModule } from '@modules/billing';
import { InferenceModule } from '@modules/inference';
import { SchedulerModule } from '@modules/scheduler';
import { DatastoreModule } from '@server/database';

import { AiExecutorService } from './ai-executor.service';
import { AiReadRepository } from './ai-read.repository';
import { AiWorkerRepository } from './ai-worker.repository';
import { ReadAssemblyService } from './read-assembly.service';
import { ScheduledQueryRepository } from './scheduled-query.repository';

/**
 * The `aiworker` module of ARCHITECTURE §15.2 — in-process on the scheduler today, its own Deployment
 * after the ADR-0002 split, unchanged either way because every claim is a Postgres claim. It imports
 * `BillingModule` for the one thing the `memoir_ai` role deliberately cannot do itself: read
 * `entitlements` (§5.4 grants it zero privilege there), so the execution-time entitlement re-check runs
 * through `EntitlementService` on the API pool.
 */
@Module({
  imports: [DatabaseModule, DatastoreModule, SchedulerModule, BillingModule, InferenceModule],
  providers: [AiWorkerRepository, AiReadRepository, ScheduledQueryRepository, ReadAssemblyService, AiExecutorService],
  exports: [AiExecutorService, ReadAssemblyService],
})
export class AiWorkerModule {}
