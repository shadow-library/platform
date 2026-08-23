import { Module } from '@shadow-library/app';

import { SchedulerService } from './scheduler.service';

@Module({
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
