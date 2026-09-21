import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, HttpController, Params, Post, RawBody, RespondFor } from '@shadow-library/fastify';

import { PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import { ImportPlanBody, ImportPlanResponse, PlanImportParams } from './plan-import.dto';
import { PlanImportService } from './plan-import.service';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/plan')
export class PlanImportController {
  constructor(private readonly planImportService: PlanImportService) {}

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/import')
  @RespondFor(200, ImportPlanResponse)
  importPlan(@Params() params: PlanImportParams, @Body() body: ImportPlanBody, @RawBody() rawBody?: Buffer): Promise<ImportPlanResponse> {
    const sent: unknown = rawBody ? JSON.parse(rawBody.toString('utf8')) : undefined;
    return this.planImportService.import(params.projectId, body, sent);
  }
}
