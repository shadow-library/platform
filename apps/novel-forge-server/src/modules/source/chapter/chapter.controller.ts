/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Authenticated } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Query, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

import { ChapterParams, ChapterProjectParams, ChapterResponse, ListChapterResponse, ListChaptersQuery, UpdateChapterBody } from './chapter.dto';
import { ChapterService } from './chapter.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Authenticated()
@HttpController('/api/v1/projects/:projectId/source/chapters')
export class ChapterController {
  constructor(private readonly chapterService: ChapterService) {}

  @Get()
  @RespondFor(200, ListChapterResponse)
  listChapters(@Params() params: ChapterProjectParams, @Query() query: ListChaptersQuery): Promise<ListChapterResponse> {
    return this.chapterService.list(params.projectId, query);
  }

  @Get('/:n')
  @RespondFor(200, ChapterResponse)
  async getChapter(@Params() params: ChapterParams): Promise<ChapterResponse> {
    const chapter = await this.chapterService.get(params.projectId, params.n);
    if (!chapter) throw AppErrorCode.CHP_001.create();
    return chapter;
  }

  @Patch('/:n')
  @RespondFor(200, ChapterResponse)
  updateChapter(@Params() params: ChapterParams, @Body() body: UpdateChapterBody): Promise<ChapterResponse> {
    return this.chapterService.update(params.projectId, params.n, body);
  }

  @Delete('/:n')
  @HttpStatus(204)
  deleteChapter(@Params() params: ChapterParams): Promise<void> {
    return this.chapterService.delete(params.projectId, params.n);
  }
}
