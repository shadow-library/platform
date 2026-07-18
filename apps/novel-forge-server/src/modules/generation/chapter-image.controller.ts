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
  async list(@Params() params: ChapterParams): Promise<ListChapterImageResponse> {
    const items = await this.chapterImageService.list(params.projectId, params.n);
    return { items } as unknown as ListChapterImageResponse;
  }

  @Post()
  @RespondFor(201, ChapterImageResponse)
  @HttpStatus(201)
  add(@Params() params: ChapterParams, @Body() body: AddChapterImageBody): Promise<ChapterImageResponse> {
    return this.chapterImageService.add(params.projectId, params.n, body.image, body.mime, body.caption) as unknown as Promise<ChapterImageResponse>;
  }

  @Delete('/:imageId')
  @HttpStatus(204)
  remove(@Params() params: ChapterImageParams): Promise<void> {
    return this.chapterImageService.remove(params.projectId, params.n, params.imageId);
  }
}
