import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Params, Patch, Post, Query, RespondFor } from '@shadow-library/fastify';

import { RevealRuleErrorResponse } from '@server/common';
import { PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import { LedgerEntryResponse } from '../ledger/ledger.dto';
import { ledgerEntryStatus } from '../ledger/ledger.service';
import { IdeaRejectionService } from './idea-rejection.service';
import { ProposalApplyService } from './proposal-apply.service';
import { ProposalService } from './proposal.service';
import {
  ApplyProposalBody,
  ApplyProposalResponse,
  ListProposalResponse,
  ListProposalsQuery,
  ProposalIdParams,
  ProposalOpParams,
  ProposalProjectParams,
  ProposalResponse,
  RejectProposalOpBody,
  RevertProposalResponse,
  UndoImpactResponse,
  UpdateProposalBody,
  WriterPreviewResponse,
} from './refinement.dto';
import { serialiseProposal, startedJobs } from './serialise';
import { WriterPreviewService } from './writer-preview.service';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/proposals')
export class ProposalController {
  constructor(
    private readonly proposalService: ProposalService,
    private readonly proposalApplyService: ProposalApplyService,
    private readonly writerPreviewService: WriterPreviewService,
    private readonly ideaRejectionService: IdeaRejectionService,
  ) {}

  @Get()
  @RespondFor(200, ListProposalResponse)
  listProposals(@Params() params: ProposalProjectParams, @Query() query: ListProposalsQuery): Promise<ListProposalResponse> {
    return this.proposalService.list(params.projectId, query).then(r => ({ ...r, items: r.items.map(serialiseProposal) }));
  }

  @Get('/:proposalId')
  @RespondFor(200, ProposalResponse)
  getProposal(@Params() params: ProposalIdParams): Promise<ProposalResponse> {
    return this.proposalService.get(params.projectId, params.proposalId).then(serialiseProposal);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Patch('/:proposalId')
  @RespondFor(200, ProposalResponse)
  updateProposal(@Params() params: ProposalIdParams, @Body() body: UpdateProposalBody): Promise<ProposalResponse> {
    return this.proposalService.updateChangeSet(params.projectId, params.proposalId, body.changeSet).then(serialiseProposal);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/:proposalId/apply')
  @RespondFor(200, ApplyProposalResponse)
  @RespondFor(400, RevealRuleErrorResponse)
  applyProposal(@Params() params: ProposalIdParams, @Body() body: ApplyProposalBody): Promise<ApplyProposalResponse> {
    return this.proposalApplyService
      .apply(params.projectId, params.proposalId, { opIndexes: body.opIndexes })
      .then(r => ({ ...r, proposal: serialiseProposal(r.proposal), jobs: startedJobs(r.opResults) }));
  }

  @Get('/:proposalId/undo-impact')
  @RespondFor(200, UndoImpactResponse)
  async undoImpact(@Params() params: ProposalIdParams): Promise<UndoImpactResponse> {
    const impact = await this.proposalService.undoImpact(params.projectId, params.proposalId);
    return { proposalId: params.proposalId, ...impact };
  }

  @Get('/:proposalId/writer-preview')
  @RespondFor(200, WriterPreviewResponse)
  writerPreview(@Params() params: ProposalIdParams): Promise<WriterPreviewResponse> {
    return this.writerPreviewService.preview(params.projectId, params.proposalId);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/:proposalId/revert')
  @RespondFor(200, RevertProposalResponse)
  @RespondFor(400, RevealRuleErrorResponse)
  revertProposal(@Params() params: ProposalIdParams): Promise<RevertProposalResponse> {
    return this.proposalApplyService.revert(params.projectId, params.proposalId).then(r => ({ ...r, proposal: serialiseProposal(r.proposal) }));
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/:proposalId/ops/:opIndex/reject')
  @RespondFor(201, LedgerEntryResponse)
  async rejectOp(@Params() params: ProposalOpParams, @Body() body: RejectProposalOpBody): Promise<LedgerEntryResponse> {
    const entry = await this.ideaRejectionService.reject(params.projectId, params.proposalId, params.opIndex, body);
    return { ...entry, status: ledgerEntryStatus(entry) };
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/:proposalId/discard')
  @RespondFor(200, ProposalResponse)
  discardProposal(@Params() params: ProposalIdParams): Promise<ProposalResponse> {
    return this.proposalService.discard(params.projectId, params.proposalId).then(serialiseProposal);
  }
}
