import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { EventsModule } from '../events/events.module';
import { PluginsModule } from '../plugins/plugins.module';
import { ActionExecutorRegistry } from './action-registry';
import { ChangeHistoryController } from './change-history.controller';
import { ChatCompactionService } from './chat-compaction.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ProposalApplyService } from './proposal-apply.service';
import { ProposalController } from './proposal.controller';
import { ProposalService } from './proposal.service';
import { RefineController } from './refine.controller';
import { RefineService } from './refine.service';
import { BibleTidyController } from './tidy/bible-tidy.controller';
import { BibleTidyService } from './tidy/bible-tidy.service';
import { TurnStreamController } from './turn-stream.controller';
import { TurnStreamService } from './turn-stream.service';

@Module({
  imports: [DatabaseModule, AiModule, EventsModule, PluginsModule],
  controllers: [ProposalController, ChangeHistoryController, ChatController, TurnStreamController, RefineController, BibleTidyController],
  providers: [ActionExecutorRegistry, ProposalService, ProposalApplyService, ChatCompactionService, ChatService, RefineService, TurnStreamService, BibleTidyService],
  exports: [ActionExecutorRegistry, ProposalService, ProposalApplyService, ChatCompactionService, ChatService, RefineService, TurnStreamService],
})
export class RefinementModule {}
