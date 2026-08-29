import { Authenticated } from '@shadow-library/auth/module';
import { Body, HttpController, Params, Post, RespondFor } from '@shadow-library/fastify';

import { ChapterAmendService } from './chapter-amend.service';
import { AmendChapterBody, AmendChapterResponse, ChapterParams } from './generation.dto';

@Authenticated()
@HttpController('/api/v1/projects/:projectId/chapters/:n')
export class ChapterAmendController {
  constructor(private readonly chapterAmendService: ChapterAmendService) {}

  @Post('/amend')
  @RespondFor(200, AmendChapterResponse)
  amendChapter(@Params() params: ChapterParams, @Body() body: AmendChapterBody): Promise<AmendChapterResponse> {
    return this.chapterAmendService.amend(params.projectId, params.n, body);
  }
}
