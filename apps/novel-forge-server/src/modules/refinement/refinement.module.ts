/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AiModule } from '../ai/ai.module';
import { ActionExecutorRegistry } from './action-registry';
import { ChangeHistoryController } from './change-history.controller';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ProposalApplyService } from './proposal-apply.service';
import { ProposalController } from './proposal.controller';
import { ProposalService } from './proposal.service';
import { RefineController } from './refine.controller';
import { RefineService } from './refine.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, AiModule],
  controllers: [ProposalController, ChangeHistoryController, ChatController, RefineController],
  providers: [ActionExecutorRegistry, ProposalService, ProposalApplyService, ChatService, RefineService],
  exports: [ActionExecutorRegistry, ProposalService, ProposalApplyService, ChatService, RefineService],
})
export class RefinementModule {}
