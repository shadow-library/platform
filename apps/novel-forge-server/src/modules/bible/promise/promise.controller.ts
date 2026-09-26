import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Get, HttpController, Params, Query, RespondFor } from '@shadow-library/fastify';

import { PROJECTS_READ_PERMISSION } from '@server/constants';

import { ListPromisesQuery, ListPromisesResponse, PromiseProjectParams } from './promise.dto';
import { PromiseService } from './promise.service';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/promises')
export class PromiseController {
  constructor(private readonly promiseService: PromiseService) {}

  @Get()
  @RespondFor(200, ListPromisesResponse)
  listPromises(@Params() params: PromiseProjectParams, @Query() query: ListPromisesQuery): Promise<ListPromisesResponse> {
    return this.promiseService.list(params.projectId, query);
  }
}
