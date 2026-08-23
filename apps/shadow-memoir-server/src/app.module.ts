import './bootstrap';

import { Module } from '@shadow-library/app';

import { SchedulerModule } from './modules/scheduler';
import { HttpRouteModule } from './routes';

@Module({
  imports: [HttpRouteModule, SchedulerModule],
})
export class AppModule {}
