import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { BillingModule } from '@modules/billing';
import { CommandsModule } from '@modules/commands';
import { QuestsModule } from '@modules/quests';
import { SyncModule } from '@modules/sync';

import { AiConsentRepository } from './ai-consent.repository';
import { AiConsentService } from './ai-consent.service';
import { AiDeltaSources } from './ai-delta-sources.service';
import { AiResultRepository } from './ai-result.repository';
import { AiResultService } from './ai-result.service';
import { AiScheduledQueryRepository } from './ai-scheduled-query.repository';
import { AiScheduledQueryService } from './ai-scheduled-query.service';
import { AiTaskRepository } from './ai-task.repository';
import { AiTaskService } from './ai-task.service';
import { AiController } from './ai.controller';
import { AppliedSuggestionRepository } from './applied-suggestion.repository';

@Module({
  imports: [DatabaseModule, MemoirAuthModule, CommandsModule, BillingModule, SyncModule, QuestsModule],
  controllers: [AiController],
  providers: [
    AiTaskRepository,
    AiResultRepository,
    AiScheduledQueryRepository,
    AiConsentRepository,
    AppliedSuggestionRepository,
    AiTaskService,
    AiConsentService,
    AiScheduledQueryService,
    AiResultService,
    AiDeltaSources,
  ],
})
export class AiModule {}
