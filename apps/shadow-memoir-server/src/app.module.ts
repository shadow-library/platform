import './bootstrap';

import { Module } from '@shadow-library/app';

import { DatastoreModule } from './database';
import { CommandsModule } from './modules/commands';
import { FinanceModule } from './modules/finance';
import { MetricsModule } from './modules/metrics';
import { QuestsModule } from './modules/quests';
import { RolloverModule } from './modules/rollover';
import { SchedulerModule } from './modules/scheduler';
import { HttpRouteModule } from './routes';

@Module({
  imports: [DatastoreModule, HttpRouteModule, CommandsModule, QuestsModule, RolloverModule, SchedulerModule, FinanceModule, MetricsModule],
})
export class AppModule {}
