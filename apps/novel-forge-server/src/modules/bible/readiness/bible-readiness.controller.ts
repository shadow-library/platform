import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Get, HttpController, Params, RespondFor } from '@shadow-library/fastify';

import { PROJECTS_READ_PERMISSION } from '@server/constants';

import { BibleReadinessParams, BibleReadinessResponse } from './bible-readiness.dto';
import { BibleReadinessService } from './bible-readiness.service';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/bible/readiness')
export class BibleReadinessController {
  constructor(private readonly bibleReadinessService: BibleReadinessService) {}

  @Get()
  @RespondFor(200, BibleReadinessResponse)
  readiness(@Params() params: BibleReadinessParams): Promise<BibleReadinessResponse> {
    return this.bibleReadinessService.score(params.projectId);
  }
}
