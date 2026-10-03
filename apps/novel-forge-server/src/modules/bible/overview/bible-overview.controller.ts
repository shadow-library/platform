import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Get, HttpController, Params, RespondFor } from '@shadow-library/fastify';

import { PROJECTS_READ_PERMISSION } from '@server/constants';

import { BibleOverviewParams, BibleOverviewResponse } from './bible-overview.dto';
import { BibleOverviewService } from './bible-overview.service';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/bible/overview')
export class BibleOverviewController {
  constructor(private readonly bibleOverviewService: BibleOverviewService) {}

  @Get()
  @RespondFor(200, BibleOverviewResponse)
  overview(@Params() params: BibleOverviewParams): Promise<BibleOverviewResponse> {
    return this.bibleOverviewService.overview(params.projectId);
  }
}
