import './bootstrap';

import { Module } from '@shadow-library/app';

import { DatastoreModule } from './database';
import { SchedulerModule } from './modules/scheduler';
import { HttpRouteModule } from './routes';

@Module({
  imports: [DatastoreModule, HttpRouteModule, SchedulerModule],
})
export class AppModule {}
