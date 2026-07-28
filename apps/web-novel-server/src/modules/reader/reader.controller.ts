/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Body, Delete, Get, HttpController, HttpStatus, Params, Post, Put, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { NovelSlugParams } from '@server/modules/publish';
import { SessionService } from '@server/modules/session';

import { LibraryAddBody, LibraryListResponse, ProgressBody, ProgressListResponse, ProgressResponse } from './reader.dto';
import { ReaderService } from './reader.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The small authenticated surface: every route resolves the reader from the session cookie and
 * scopes queries to that identity subject. There are no cross-user reads by construction.
 */

@HttpController('/api')
export class ReaderController {
  constructor(
    private readonly readerService: ReaderService,
    private readonly sessionService: SessionService,
  ) {}

  /*!
   * Reading progress
   */

  @Get('/me/progress')
  @RespondFor(200, ProgressListResponse)
  async listProgress(): Promise<ProgressListResponse> {
    const session = this.sessionService.authenticate();
    return { items: await this.readerService.listProgress(session.userId) };
  }

  @Get('/novels/:slug/progress')
  @RespondFor(200, ProgressResponse)
  getProgress(@Params() params: NovelSlugParams): Promise<ProgressResponse> {
    const session = this.sessionService.authenticate();
    return this.readerService.getProgress(session.userId, params.slug);
  }

  @Put('/novels/:slug/progress')
  @RespondFor(200, ProgressResponse)
  saveProgress(@Params() params: NovelSlugParams, @Body() body: ProgressBody): Promise<ProgressResponse> {
    const session = this.sessionService.authenticate();
    return this.readerService.saveProgress(session.userId, params.slug, body);
  }

  /*!
   * Library
   */

  @Get('/library')
  @RespondFor(200, LibraryListResponse)
  async listLibrary(): Promise<LibraryListResponse> {
    const session = this.sessionService.authenticate();
    return { items: await this.readerService.listLibrary(session.userId) };
  }

  @Post('/library')
  @HttpStatus(204)
  async addToLibrary(@Body() body: LibraryAddBody): Promise<void> {
    const session = this.sessionService.authenticate();
    await this.readerService.addToLibrary(session.userId, body.slug);
  }

  @Delete('/library/:slug')
  @HttpStatus(204)
  async removeFromLibrary(@Params() params: NovelSlugParams): Promise<void> {
    const session = this.sessionService.authenticate();
    await this.readerService.removeFromLibrary(session.userId, params.slug);
  }
}
