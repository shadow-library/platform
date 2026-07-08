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
import { ProposalApplyService } from './proposal-apply.service';
import { ProposalController } from './proposal.controller';
import { ProposalService } from './proposal.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule],
  controllers: [ProposalController],
  providers: [ProposalService, ProposalApplyService],
  exports: [ProposalService, ProposalApplyService],
})
export class RefinementModule {}
