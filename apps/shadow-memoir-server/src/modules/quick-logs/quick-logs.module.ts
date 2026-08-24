import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { CommandsModule } from '@modules/commands';
import { SyncModule } from '@modules/sync';
import { TelemetryModule } from '@server/telemetry';

import { JournalRepository } from './journal.repository';
import { MealPresetRepository } from './meal-preset.repository';
import { MealRepository } from './meal.repository';
import { QuickLogsCommandsService } from './quick-logs-commands.service';
import { QuickLogsDeltaSources } from './quick-logs-delta-sources.service';
import { SideQuestRepository } from './side-quest.repository';
import { WeightRepository } from './weight.repository';

@Module({
  imports: [DatabaseModule, MemoirAuthModule, CommandsModule, SyncModule, TelemetryModule],
  providers: [JournalRepository, MealRepository, MealPresetRepository, WeightRepository, SideQuestRepository, QuickLogsCommandsService, QuickLogsDeltaSources],
  exports: [JournalRepository, MealRepository, MealPresetRepository, WeightRepository, SideQuestRepository],
})
export class QuickLogsModule {}
