import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { ActionExecutorRegistry } from './action-registry';
import { ChangeHistoryController } from './change-history.controller';
import { ChatCompactionService } from './chat-compaction.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatTurnRegistry } from './chat-turn.registry';
import { ProposalApplyService } from './proposal-apply.service';
import { ProposalController } from './proposal.controller';
import { ProposalService } from './proposal.service';
import { RefineController } from './refine.controller';
import { RefineService } from './refine.service';

@Module({
  imports: [DatabaseModule, AiModule],
  controllers: [ProposalController, ChangeHistoryController, ChatController, RefineController],
  providers: [ActionExecutorRegistry, ChatTurnRegistry, ProposalService, ProposalApplyService, ChatCompactionService, ChatService, RefineService],
  exports: [ActionExecutorRegistry, ChatTurnRegistry, ProposalService, ProposalApplyService, ChatCompactionService, ChatService, RefineService],
})
export class RefinementModule {}
