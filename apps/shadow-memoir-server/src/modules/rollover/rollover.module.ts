import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { CommandsModule } from '@modules/commands';
import { ProgressionModule } from '@modules/progression';
import { SchedulerModule } from '@modules/scheduler';
import { SyncModule } from '@modules/sync';

import { RolloverRepository } from './rollover.repository';
import { RolloverService } from './rollover.service';

@Module({
  imports: [DatabaseModule, CommandsModule, ProgressionModule, SchedulerModule, SyncModule],
  providers: [RolloverRepository, RolloverService],
  exports: [RolloverRepository, RolloverService],
})
export class RolloverModule {}
