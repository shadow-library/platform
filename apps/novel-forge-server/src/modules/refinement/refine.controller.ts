/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Authenticated } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Params, Post, Query, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
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

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Authenticated()
@HttpController('/api/v1/projects/:projectId')
export class RefineController {
  constructor(private readonly refineService: RefineService) {}

  @Post('/premise/enhance')
  @RespondFor(200, EnhancePremiseResponse)
  enhancePremise(@Params() params: RefineProjectParams, @Body() body: EnhancePremiseBody): Promise<EnhancePremiseResponse> {
    return this.refineService.enhancePremise(params.projectId, body.overview) as unknown as Promise<EnhancePremiseResponse>;
  }

  @Post('/bible/audit')
  @RespondFor(200, AuditBibleResponse)
  auditBible(@Params() params: RefineProjectParams): Promise<AuditBibleResponse> {
    return this.refineService.auditBible(params.projectId).then(r => ({ ...r, proposal: r.proposal ?? undefined })) as unknown as Promise<AuditBibleResponse>;
  }

  @Post('/volumes/:volumeKey/arcs/plan')
  @RespondFor(200, PlanArcsResponse)
  planArcs(@Params() params: PlanArcsParams, @Body() body: PlanArcsBody): Promise<PlanArcsResponse> {
    return this.refineService.planArcs(params.projectId, params.volumeKey, body) as unknown as Promise<PlanArcsResponse>;
  }

  @Get('/context/preview')
  @RespondFor(200, ContextPreviewResponse)
  previewContext(@Params() params: RefineProjectParams, @Query() query: ContextPreviewQuery): Promise<ContextPreviewResponse> {
    return this.refineService.previewContext(params.projectId, query) as unknown as Promise<ContextPreviewResponse>;
  }
}
