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
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ProposalApplyService } from './proposal-apply.service';
import { ProposalController } from './proposal.controller';
import { ProposalService } from './proposal.service';
import { AiModule } from '../ai/ai.module';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, AiModule],
  controllers: [ProposalController, ChatController],
  providers: [ProposalService, ProposalApplyService, ChatService],
  exports: [ProposalService, ProposalApplyService, ChatService],
})
export class RefinementModule {}
