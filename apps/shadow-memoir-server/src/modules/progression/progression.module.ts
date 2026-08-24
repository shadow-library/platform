import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { CommandsModule } from '@modules/commands';
import { SyncModule } from '@modules/sync';

import { GrantsRepository } from './grants.repository';
import { ProgressCountersRepository } from './progress-counters.repository';
import { ProgressionCommandsService } from './progression-commands.service';
import { ProgressionService } from './progression.service';

@Module({
  imports: [DatabaseModule, MemoirAuthModule, CommandsModule, SyncModule],
  providers: [ProgressCountersRepository, GrantsRepository, ProgressionService, ProgressionCommandsService],
  exports: [ProgressionService, GrantsRepository],
})
export class ProgressionModule {}
