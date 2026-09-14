import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, HttpController, Params, Post, RespondFor } from '@shadow-library/fastify';

import { GENERATION_RUN_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import { ChapterInsertService } from './chapter-insert.service';
import { ChapterInsertParams, InsertChapterBody, InsertChapterResponse } from './generation.dto';

@Authenticated()
@HttpController('/api/v1/projects/:projectId/chapters/:afterChapter')
export class ChapterInsertController {
  constructor(private readonly chapterInsertService: ChapterInsertService) {}

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @BotPermission(GENERATION_RUN_PERMISSION)
  @Post('/insert')
  @RespondFor(200, InsertChapterResponse)
  insertChapter(@Params() params: ChapterInsertParams, @Body() body: InsertChapterBody): Promise<InsertChapterResponse> {
    return this.chapterInsertService.insertAfter(params.projectId, params.afterChapter, body);
  }
}
