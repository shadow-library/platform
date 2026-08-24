import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { SchedulerModule } from '@modules/scheduler';
import { SyncModule } from '@modules/sync';
import { DatastoreModule } from '@server/database';

import { BillingProviderAdapter } from './billing.types';
import { BillingController } from './billing.controller';
import { BillingRepository } from './billing.repository';
import { BillingWebhookService } from './billing-webhook.service';
import { EntitlementLapseService } from './entitlement-lapse.service';
import { EntitlementRepository } from './entitlement.repository';
import { EntitlementService } from './entitlement.service';
import { GenericHmacBillingAdapter } from './generic-hmac.adapter';

/**
 * Binding `BillingProviderAdapter` to one concrete class is the whole provider choice (ARCHITECTURE
 * §16.1). Owner decision A-6 has not named a payment provider yet, so it resolves to
 * `GenericHmacBillingAdapter`; naming one replaces this single line.
 */
@Module({
  imports: [DatabaseModule, DatastoreModule, MemoirAuthModule, SyncModule, SchedulerModule],
  controllers: [BillingController],
  providers: [
    { token: BillingProviderAdapter, useClass: GenericHmacBillingAdapter },
    BillingRepository,
    EntitlementRepository,
    BillingWebhookService,
    EntitlementService,
    EntitlementLapseService,
  ],
  exports: [EntitlementService, EntitlementLapseService],
})
export class BillingModule {}
