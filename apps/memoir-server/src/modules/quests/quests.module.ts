import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { CommandsModule } from '@modules/commands';
import { ProgressionModule } from '@modules/progression';
import { RolloverModule } from '@modules/rollover';
import { SyncModule } from '@modules/sync';

import { CompassionCommandsService } from './compassion-commands.service';
import { QuestCommandsService } from './quest-commands.service';
import { QuestLogRepository } from './quest-log.repository';
import { QuestRepository } from './quest.repository';
import { QuestStreakRepository } from './quest-streak.repository';

@Module({
  imports: [DatabaseModule, MemoirAuthModule, CommandsModule, ProgressionModule, RolloverModule, SyncModule],
  providers: [QuestRepository, QuestLogRepository, QuestStreakRepository, QuestCommandsService, CompassionCommandsService],
  exports: [QuestRepository, QuestLogRepository, QuestStreakRepository],
})
export class QuestsModule {}
