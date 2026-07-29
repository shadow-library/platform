/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Authenticated } from '@shadow-library/auth/module';
import { Body, ContextService, Delete, Get, HttpController, HttpStatus, Params, Post, Put, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { NovelSlugParams } from '@server/modules/publish';

import { LibraryAddBody, LibraryListResponse, ProgressBody, ProgressListResponse, ProgressResponse } from './reader.dto';
import { ReaderService } from './reader.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The small authenticated surface: the SDK's guard resolves the reader from the app-session cookie
 * (or a bearer token) and exposes the principal on the ambient context, and every route scopes its
 * queries to that identity subject. There are no cross-user reads by construction.
 */

@HttpController('/api')
@Authenticated()
export class ReaderController {
  constructor(
    private readonly readerService: ReaderService,
    private readonly context: ContextService,
  ) {}

  /*!
   * Reading progress
   */

  @Get('/me/progress')
  @RespondFor(200, ProgressListResponse)
  async listProgress(): Promise<ProgressListResponse> {
    return { items: await this.readerService.listProgress(this.userId()) };
  }

  @Get('/novels/:slug/progress')
  @RespondFor(200, ProgressResponse)
  getProgress(@Params() params: NovelSlugParams): Promise<ProgressResponse> {
    return this.readerService.getProgress(this.userId(), params.slug);
  }

  @Put('/novels/:slug/progress')
  @RespondFor(200, ProgressResponse)
  saveProgress(@Params() params: NovelSlugParams, @Body() body: ProgressBody): Promise<ProgressResponse> {
    return this.readerService.saveProgress(this.userId(), params.slug, body);
  }

  /*!
   * Library
   */

  @Get('/library')
  @RespondFor(200, LibraryListResponse)
  async listLibrary(): Promise<LibraryListResponse> {
    return { items: await this.readerService.listLibrary(this.userId()) };
  }

  @Post('/library')
  @HttpStatus(204)
  async addToLibrary(@Body() body: LibraryAddBody): Promise<void> {
    await this.readerService.addToLibrary(this.userId(), body.slug);
  }

  @Delete('/library/:slug')
  @HttpStatus(204)
  async removeFromLibrary(@Params() params: NovelSlugParams): Promise<void> {
    await this.readerService.removeFromLibrary(this.userId(), params.slug);
  }

  /** The identity subject behind the request, guaranteed present because every route is `@Authenticated()` */
  private userId(): string {
    return this.context.getAuthPrincipal().sub;
  }
}
