import './bootstrap';

import { Module } from '@shadow-library/app';

import { DatastoreModule } from './database';
import { CommandsModule } from './modules/commands';
import { FinanceModule } from './modules/finance';
import { SchedulerModule } from './modules/scheduler';
import { HttpRouteModule } from './routes';

@Module({
  imports: [DatastoreModule, HttpRouteModule, CommandsModule, SchedulerModule, FinanceModule],
})
export class AppModule {}
