import './bootstrap';

import { Module } from '@shadow-library/app';

import { DatastoreModule } from './database';
import { CommandsModule } from './modules/commands';
import { SchedulerModule } from './modules/scheduler';
import { HttpRouteModule } from './routes';

@Module({
  imports: [DatastoreModule, HttpRouteModule, CommandsModule, SchedulerModule],
})
export class AppModule {}
