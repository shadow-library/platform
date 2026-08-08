import { Authenticated } from '@shadow-library/auth/module';
import { Body, HttpController, Params, Post, RespondFor } from '@shadow-library/fastify';

import { ImportPlanBody, ImportPlanResponse, PlanImportParams } from './plan-import.dto';
import { PlanImportService } from './plan-import.service';

@Authenticated()
@HttpController('/api/v1/projects/:projectId/plan')
export class PlanImportController {
  constructor(private readonly planImportService: PlanImportService) {}

  @Post('/import')
  @RespondFor(200, ImportPlanResponse)
  importPlan(@Params() params: PlanImportParams, @Body() body: ImportPlanBody): Promise<ImportPlanResponse> {
    return this.planImportService.import(params.projectId, body);
  }
}
