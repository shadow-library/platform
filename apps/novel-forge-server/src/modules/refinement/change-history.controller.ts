/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Body, Get, HttpController, Params, Post, Query, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { ProposalApplyService, type RollbackResult } from './proposal-apply.service';
import { ProposalService } from './proposal.service';
import { ListChangesQuery, ListChangesResponse, ProposalProjectParams, RollbackBody, RollbackResponse } from './refinement.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/projects/:projectId/changes')
export class ChangeHistoryController {
  constructor(
    private readonly proposalService: ProposalService,
    private readonly proposalApplyService: ProposalApplyService,
  ) {}

  @Get()
  @RespondFor(200, ListChangesResponse)
  listChanges(@Params() params: ProposalProjectParams, @Query() query: ListChangesQuery): Promise<ListChangesResponse> {
    return this.proposalService
      .listChanges(params.projectId, query)
      .then(r => ({ ...r, items: r.items.map(item => ({ ...item, id: String(item.id) })) })) as unknown as Promise<ListChangesResponse>;
  }

  @Post('/rollback')
  @RespondFor(200, RollbackResponse)
  rollback(@Params() params: ProposalProjectParams, @Body() body: RollbackBody): Promise<RollbackResponse> {
    return this.proposalApplyService.rollbackAfter(params.projectId, body.afterProposalId).then(serialiseRollback) as unknown as Promise<RollbackResponse>;
  }
}

/** Coerce the rollback result's bigint proposal ids to the wire's strings. */
function serialiseRollback(result: RollbackResult): Record<string, unknown> {
  return {
    reverted: result.reverted.map(item => ({ proposalId: String(item.proposalId), artifacts: item.artifacts })),
    skipped: result.skipped.map(String),
    stoppedAt: result.stoppedAt === undefined ? undefined : String(result.stoppedAt),
    conflict: result.conflict,
  };
}
