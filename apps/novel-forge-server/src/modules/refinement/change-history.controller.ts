import { Authenticated } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Params, Post, Query, RespondFor } from '@shadow-library/fastify';

import { ProposalApplyService, type RollbackResult } from './proposal-apply.service';
import { ProposalService } from './proposal.service';
import { ListChangesQuery, ListChangesResponse, ProposalProjectParams, RollbackBody, RollbackResponse } from './refinement.dto';

@Authenticated()
@HttpController('/api/v1/projects/:projectId/changes')
export class ChangeHistoryController {
  constructor(
    private readonly proposalService: ProposalService,
    private readonly proposalApplyService: ProposalApplyService,
  ) {}

  @Get()
  @RespondFor(200, ListChangesResponse)
  listChanges(@Params() params: ProposalProjectParams, @Query() query: ListChangesQuery): Promise<ListChangesResponse> {
    return this.proposalService.listChanges(params.projectId, query);
  }

  @Post('/rollback')
  @RespondFor(200, RollbackResponse)
  rollbackChanges(@Params() params: ProposalProjectParams, @Body() body: RollbackBody): Promise<RollbackResponse> {
    return this.proposalApplyService.rollbackAfter(params.projectId, body.afterProposalId).then(serialiseRollback);
  }
}

/** Coerce the rollback result's bigint proposal ids to the wire's strings. */
function serialiseRollback(result: RollbackResult): RollbackResponse {
  return {
    reverted: result.reverted.map(item => ({ proposalId: item.proposalId, artifacts: item.artifacts })),
    skipped: result.skipped.map(String),
    stoppedAt: result.stoppedAt === undefined ? undefined : String(result.stoppedAt),
    conflict: result.conflict,
  };
}
