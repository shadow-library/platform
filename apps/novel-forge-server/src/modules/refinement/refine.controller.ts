/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Body, HttpController, Params, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AuditBibleResponse, EnhancePremiseBody, EnhancePremiseResponse, PlanArcsBody, PlanArcsParams, PlanArcsResponse, RefineProjectParams } from './refine.dto';
import { RefineService } from './refine.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/projects/:projectId')
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
    return this.refineService.auditBible(params.projectId) as unknown as Promise<AuditBibleResponse>;
  }

  @Post('/volumes/:volumeKey/arcs/plan')
  @RespondFor(200, PlanArcsResponse)
  planArcs(@Params() params: PlanArcsParams, @Body() body: PlanArcsBody): Promise<PlanArcsResponse> {
    return this.refineService.planArcs(params.projectId, params.volumeKey, body) as unknown as Promise<PlanArcsResponse>;
  }
}
