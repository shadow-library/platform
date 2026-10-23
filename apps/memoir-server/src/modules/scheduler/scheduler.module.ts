import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { DatastoreModule } from '@server/database';

import { SchedulerService } from './scheduler.service';
import { SweepRunRepository } from './sweep-run.repository';

@Module({
  imports: [DatabaseModule, DatastoreModule],
  providers: [SchedulerService, SweepRunRepository],
  exports: [SchedulerService],
})
export class SchedulerModule {}
