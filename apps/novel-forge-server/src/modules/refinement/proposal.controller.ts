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
import {
  ApplyProposalBody,
  ApplyProposalResponse,
  ListProposalResponse,
  ListProposalsQuery,
  ProposalIdParams,
  ProposalProjectParams,
  ProposalResponse,
  RevertProposalResponse,
  UpdateProposalBody,
} from './refinement.dto';
import { serialiseProposal } from './serialise';

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
    return this.proposalService.list(params.projectId, query).then(r => ({ ...r, items: r.items.map(serialiseProposal) })) as unknown as Promise<ListProposalResponse>;
  }

  @Get('/:proposalId')
  @RespondFor(200, ProposalResponse)
  getProposal(@Params() params: ProposalIdParams): Promise<ProposalResponse> {
    return this.proposalService.get(params.projectId, params.proposalId).then(serialiseProposal) as unknown as Promise<ProposalResponse>;
  }

  @Patch('/:proposalId')
  @RespondFor(200, ProposalResponse)
  updateProposal(@Params() params: ProposalIdParams, @Body() body: UpdateProposalBody): Promise<ProposalResponse> {
    return this.proposalService.updateChangeSet(params.projectId, params.proposalId, body.changeSet).then(serialiseProposal) as unknown as Promise<ProposalResponse>;
  }

  @Post('/:proposalId/apply')
  @RespondFor(200, ApplyProposalResponse)
  applyProposal(@Params() params: ProposalIdParams, @Body() body: ApplyProposalBody): Promise<ApplyProposalResponse> {
    return this.proposalApplyService
      .apply(params.projectId, params.proposalId, { opIndexes: body.opIndexes })
      .then(r => ({ ...r, proposal: serialiseProposal(r.proposal) })) as unknown as Promise<ApplyProposalResponse>;
  }

  @Post('/:proposalId/revert')
  @RespondFor(200, RevertProposalResponse)
  revertProposal(@Params() params: ProposalIdParams): Promise<RevertProposalResponse> {
    return this.proposalApplyService
      .revert(params.projectId, params.proposalId)
      .then(r => ({ ...r, proposal: serialiseProposal(r.proposal) })) as unknown as Promise<RevertProposalResponse>;
  }

  @Post('/:proposalId/discard')
  @RespondFor(200, ProposalResponse)
  discardProposal(@Params() params: ProposalIdParams): Promise<ProposalResponse> {
    return this.proposalService.discard(params.projectId, params.proposalId).then(serialiseProposal) as unknown as Promise<ProposalResponse>;
  }
}
