import { Authenticated } from '@shadow-library/auth/module';
import { Body, HttpController, Params, Post, RespondFor } from '@shadow-library/fastify';

import { ChapterInsertService } from './chapter-insert.service';
import { ChapterInsertParams, InsertChapterBody, InsertChapterResponse } from './generation.dto';

@Authenticated()
@HttpController('/api/v1/projects/:projectId/chapters/:afterChapter')
export class ChapterInsertController {
  constructor(private readonly chapterInsertService: ChapterInsertService) {}

  @Post('/insert')
  @RespondFor(200, InsertChapterResponse)
  insertChapter(@Params() params: ChapterInsertParams, @Body() body: InsertChapterBody): Promise<InsertChapterResponse> {
    return this.chapterInsertService.insertAfter(params.projectId, params.afterChapter, body);
  }
}
