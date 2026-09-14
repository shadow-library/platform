import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, HttpController, Params, Post, RespondFor } from '@shadow-library/fastify';

import { GENERATION_RUN_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import { ChapterAmendService } from './chapter-amend.service';
import { AmendChapterBody, AmendChapterResponse, ChapterParams } from './generation.dto';

@Authenticated()
@HttpController('/api/v1/projects/:projectId/chapters/:n')
export class ChapterAmendController {
  constructor(private readonly chapterAmendService: ChapterAmendService) {}

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @BotPermission(GENERATION_RUN_PERMISSION)
  @Post('/amend')
  @RespondFor(200, AmendChapterResponse)
  amendChapter(@Params() params: ChapterParams, @Body() body: AmendChapterBody): Promise<AmendChapterResponse> {
    return this.chapterAmendService.amend(params.projectId, params.n, body);
  }
}
