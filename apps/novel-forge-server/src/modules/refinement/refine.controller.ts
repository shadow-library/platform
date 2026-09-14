import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Params, Post, Query, RespondFor } from '@shadow-library/fastify';

import { GENERATION_RUN_PERMISSION, PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import {
  AuditBibleResponse,
  ContextPreviewQuery,
  ContextPreviewResponse,
  EnhancePremiseBody,
  EnhancePremiseResponse,
  PlanArcsBody,
  PlanArcsParams,
  PlanArcsResponse,
  RefineProjectParams,
} from './refine.dto';
import { RefineService } from './refine.service';
import { serialiseProposal } from './serialise';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId')
export class RefineController {
  constructor(private readonly refineService: RefineService) {}

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @BotPermission(GENERATION_RUN_PERMISSION)
  @Post('/premise/enhance')
  @RespondFor(200, EnhancePremiseResponse)
  enhancePremise(@Params() params: RefineProjectParams, @Body() body: EnhancePremiseBody): Promise<EnhancePremiseResponse> {
    return this.refineService.enhancePremise(params.projectId, body.overview).then(r => ({ ...r, proposal: serialiseProposal(r.proposal) }));
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @BotPermission(GENERATION_RUN_PERMISSION)
  @Post('/bible/audit')
  @RespondFor(200, AuditBibleResponse)
  auditBible(@Params() params: RefineProjectParams): Promise<AuditBibleResponse> {
    return this.refineService.auditBible(params.projectId).then(r => ({ ...r, proposal: r.proposal ? serialiseProposal(r.proposal) : undefined }));
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @BotPermission(GENERATION_RUN_PERMISSION)
  @Post('/volumes/:volumeKey/arcs/plan')
  @RespondFor(200, PlanArcsResponse)
  planArcs(@Params() params: PlanArcsParams, @Body() body: PlanArcsBody): Promise<PlanArcsResponse> {
    return this.refineService.planArcs(params.projectId, params.volumeKey, body).then(r => ({ ...r, proposal: serialiseProposal(r.proposal) }));
  }

  @BotPermission(GENERATION_RUN_PERMISSION)
  @Get('/context/preview')
  @RespondFor(200, ContextPreviewResponse)
  previewContext(@Params() params: RefineProjectParams, @Query() query: ContextPreviewQuery): Promise<ContextPreviewResponse> {
    return this.refineService.previewContext(params.projectId, query);
  }
}
