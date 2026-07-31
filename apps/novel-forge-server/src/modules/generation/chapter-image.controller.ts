/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Authenticated } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { ChapterImageService } from './chapter-image.service';
import { AddChapterImageBody, ChapterImageParams, ChapterImageResponse, ChapterParams, ListChapterImageResponse } from './generation.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Authenticated()
@HttpController('/api/v1/projects/:projectId/chapters/:n/images')
export class ChapterImageController {
  constructor(private readonly chapterImageService: ChapterImageService) {}

  @Get()
  @RespondFor(200, ListChapterImageResponse)
  async listChapterImages(@Params() params: ChapterParams): Promise<ListChapterImageResponse> {
    const items = await this.chapterImageService.list(params.projectId, params.n);
    return { items };
  }

  @Post()
  @RespondFor(201, ChapterImageResponse)
  @HttpStatus(201)
  addChapterImage(@Params() params: ChapterParams, @Body() body: AddChapterImageBody): Promise<ChapterImageResponse> {
    return this.chapterImageService.add(params.projectId, params.n, body.image, body.mime, body.caption);
  }

  @Delete('/:imageId')
  @HttpStatus(204)
  removeChapterImage(@Params() params: ChapterImageParams): Promise<void> {
    return this.chapterImageService.remove(params.projectId, params.n, params.imageId);
  }
}
