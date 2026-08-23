import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { CommandsModule } from '@modules/commands';
import { SyncModule } from '@modules/sync';

import { QuestCommandsService } from './quest-commands.service';
import { QuestLogRepository } from './quest-log.repository';
import { QuestRepository } from './quest.repository';
import { QuestStreakRepository } from './quest-streak.repository';

@Module({
  imports: [DatabaseModule, MemoirAuthModule, CommandsModule, SyncModule],
  providers: [QuestRepository, QuestLogRepository, QuestStreakRepository, QuestCommandsService],
  exports: [QuestRepository, QuestLogRepository, QuestStreakRepository],
})
export class QuestsModule {}
