import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { CommandsModule } from '@modules/commands';
import { ProgressionModule } from '@modules/progression';
import { SchedulerModule } from '@modules/scheduler';
import { SyncModule } from '@modules/sync';
import { TelemetryModule } from '@server/telemetry';

import { ExpenseCategoryRepository } from './expense-category.repository';
import { ExpenseRepository } from './expense.repository';
import { FinanceCommandsService } from './finance-commands.service';
import { FinanceDeltaSources } from './finance-delta-sources.service';
import { HttpFxRateClient } from './fx-rate-client';
import { FxRateRepository } from './fx-rate.repository';
import { FxReconciliationService } from './fx-reconciliation.service';
import { SubscriptionRepository } from './subscription.repository';

@Module({
  imports: [DatabaseModule, MemoirAuthModule, CommandsModule, ProgressionModule, SchedulerModule, SyncModule, TelemetryModule],
  providers: [
    ExpenseCategoryRepository,
    ExpenseRepository,
    SubscriptionRepository,
    FxRateRepository,
    HttpFxRateClient,
    FinanceCommandsService,
    FinanceDeltaSources,
    FxReconciliationService,
  ],
  exports: [ExpenseCategoryRepository, ExpenseRepository, SubscriptionRepository, FxRateRepository, HttpFxRateClient, FxReconciliationService],
})
export class FinanceModule {}
