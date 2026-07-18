/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Authenticated } from '@shadow-library/auth/module';
import { Body, HttpController, Params, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { ImportPlanBody, ImportPlanResponse, PlanImportParams } from './plan-import.dto';
import { PlanImportService } from './plan-import.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Authenticated()
@HttpController('/api/v1/projects/:projectId/plan')
export class PlanImportController {
  constructor(private readonly planImportService: PlanImportService) {}

  @Post('/import')
  @RespondFor(200, ImportPlanResponse)
  import(@Params() params: PlanImportParams, @Body() body: ImportPlanBody): Promise<ImportPlanResponse> {
    return this.planImportService.import(params.projectId, body);
  }
}
