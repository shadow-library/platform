import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Get, HttpController, Params, Query, RespondFor } from '@shadow-library/fastify';

import { PROJECTS_READ_PERMISSION } from '@server/constants';

import { ChapterRowsService } from './chapter-rows.service';
import { ListChapterRowsQuery, ListChapterRowsResponse, ProjectParams } from './generation.dto';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/chapter-rows')
export class ChapterRowsController {
  constructor(private readonly chapterRowsService: ChapterRowsService) {}

  @Get()
  @RespondFor(200, ListChapterRowsResponse)
  listChapterRows(@Params() params: ProjectParams, @Query() query: ListChapterRowsQuery): Promise<ListChapterRowsResponse> {
    return this.chapterRowsService.list(params.projectId, query);
  }
}
