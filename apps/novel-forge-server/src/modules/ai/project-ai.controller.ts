import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Get, HttpController, Params, Query, RespondFor } from '@shadow-library/fastify';

import { PROJECTS_READ_PERMISSION } from '@server/constants';

import { ProjectAiParams, ProjectModelsQuery, ProjectModelsResponse } from './ai.dto';
import { ModelCatalogService } from './model-catalog.service';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/ai')
export class ProjectAiController {
  constructor(private readonly modelCatalog: ModelCatalogService) {}

  @Get('/models')
  @RespondFor(200, ProjectModelsResponse)
  models(@Params() params: ProjectAiParams, @Query() query: ProjectModelsQuery): Promise<ProjectModelsResponse> {
    return this.modelCatalog.projectModels(params.projectId, query);
  }
}
