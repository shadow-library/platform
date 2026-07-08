/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Body, Get, HttpController, Params, Patch, Post, Query, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { ProposalApplyService } from './proposal-apply.service';
import { ProposalService } from './proposal.service';
import { ApplyProposalResponse, ListProposalResponse, ListProposalsQuery, ProposalIdParams, ProposalProjectParams, ProposalResponse, UpdateProposalBody } from './refinement.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/projects/:projectId/proposals')
export class ProposalController {
  constructor(
    private readonly proposalService: ProposalService,
    private readonly proposalApplyService: ProposalApplyService,
  ) {}

  @Get()
  @RespondFor(200, ListProposalResponse)
  listProposals(@Params() params: ProposalProjectParams, @Query() query: ListProposalsQuery): Promise<ListProposalResponse> {
    return this.proposalService.list(params.projectId, query) as unknown as Promise<ListProposalResponse>;
  }

  @Get('/:proposalId')
  @RespondFor(200, ProposalResponse)
  getProposal(@Params() params: ProposalIdParams): Promise<ProposalResponse> {
    return this.proposalService.get(params.projectId, params.proposalId) as unknown as Promise<ProposalResponse>;
  }

  @Patch('/:proposalId')
  @RespondFor(200, ProposalResponse)
  updateProposal(@Params() params: ProposalIdParams, @Body() body: UpdateProposalBody): Promise<ProposalResponse> {
    return this.proposalService.updateChangeSet(params.projectId, params.proposalId, body.changeSet) as unknown as Promise<ProposalResponse>;
  }

  @Post('/:proposalId/apply')
  @RespondFor(200, ApplyProposalResponse)
  applyProposal(@Params() params: ProposalIdParams): Promise<ApplyProposalResponse> {
    return this.proposalApplyService.apply(params.projectId, params.proposalId) as unknown as Promise<ApplyProposalResponse>;
  }

  @Post('/:proposalId/discard')
  @RespondFor(200, ProposalResponse)
  discardProposal(@Params() params: ProposalIdParams): Promise<ProposalResponse> {
    return this.proposalService.discard(params.projectId, params.proposalId) as unknown as Promise<ProposalResponse>;
  }
}
