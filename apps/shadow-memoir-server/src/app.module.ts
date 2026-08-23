import './bootstrap';

import { Module } from '@shadow-library/app';

import { DatastoreModule } from './database';
import { CommandsModule } from './modules/commands';
import { FinanceModule } from './modules/finance';
import { QuestsModule } from './modules/quests';
import { SchedulerModule } from './modules/scheduler';
import { HttpRouteModule } from './routes';

@Module({
  imports: [DatastoreModule, HttpRouteModule, CommandsModule, QuestsModule, SchedulerModule, FinanceModule],
})
export class AppModule {}
