import './bootstrap';

import { Module } from '@shadow-library/app';

import { DatastoreModule } from './database';
import { AiWorkerModule } from './modules/ai-worker';
import { CommandsModule } from './modules/commands';
import { FinanceModule } from './modules/finance';
import { MetricsModule } from './modules/metrics';
import { ProgressionModule } from './modules/progression';
import { QuestsModule } from './modules/quests';
import { QuickLogsModule } from './modules/quick-logs';
import { ReconciliationModule } from './modules/reconciliation';
import { RolloverModule } from './modules/rollover';
import { SchedulerModule } from './modules/scheduler';
import { HttpRouteModule } from './routes';

@Module({
  imports: [
    DatastoreModule,
    HttpRouteModule,
    CommandsModule,
    QuestsModule,
    RolloverModule,
    SchedulerModule,
    FinanceModule,
    MetricsModule,
    ProgressionModule,
    QuickLogsModule,
    ReconciliationModule,
    AiWorkerModule,
  ],
})
export class AppModule {}
