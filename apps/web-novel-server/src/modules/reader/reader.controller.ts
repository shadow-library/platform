import { type AuthPrincipal } from '@shadow-library/auth';
import { Authenticated } from '@shadow-library/auth/module';
import { Body, ContextService, Delete, Get, HttpController, type HttpResponse, HttpStatus, Params, Post, Put, Res, RespondFor } from '@shadow-library/fastify';

import { NovelSlugParams } from '@server/modules/publish';

import { LibraryAddBody, LibraryListResponse, ProgressBody, ProgressListResponse, ProgressResponse } from './reader.dto';
import { ReaderService } from './reader.service';

@HttpController('/api')
@Authenticated()
export class ReaderController {
  constructor(
    private readonly readerService: ReaderService,
    private readonly context: ContextService,
  ) {}

  @Get('/me/progress')
  @RespondFor(200, ProgressListResponse)
  async listProgress(): Promise<ProgressListResponse> {
    return { items: await this.readerService.listProgress(this.principal()) };
  }

  @Get('/novels/:slug/progress')
  @RespondFor(200, ProgressResponse)
  getProgress(@Params() params: NovelSlugParams): Promise<ProgressResponse> {
    return this.readerService.getProgress(this.principal(), params.slug);
  }

  @Put('/novels/:slug/progress')
  @RespondFor(200, ProgressResponse)
  saveProgress(@Params() params: NovelSlugParams, @Body() body: ProgressBody): Promise<ProgressResponse> {
    return this.readerService.saveProgress(this.principal(), params.slug, body);
  }

  @Get('/library')
  @RespondFor(200, LibraryListResponse)
  async listLibrary(@Res() response: HttpResponse): Promise<LibraryListResponse> {
    const items = await this.readerService.listLibrary(this.principal());
    this.noStore(response);
    return { items };
  }

  @Post('/library')
  @HttpStatus(204)
  async addToLibrary(@Body() body: LibraryAddBody): Promise<void> {
    await this.readerService.addToLibrary(this.principal(), body.slug);
  }

  @Get('/shared')
  @RespondFor(200, LibraryListResponse)
  async listShared(@Res() response: HttpResponse): Promise<LibraryListResponse> {
    const items = await this.readerService.listShared(this.principal());
    this.noStore(response);
    return { items };
  }

  @Delete('/library/:slug')
  @HttpStatus(204)
  async removeFromLibrary(@Params() params: NovelSlugParams): Promise<void> {
    // Removal must remain available after access to a shelved novel is revoked.
    await this.readerService.removeFromLibrary(this.principal().sub, params.slug);
  }

  private principal(): AuthPrincipal {
    return this.context.getAuthPrincipal();
  }

  /** These listings can carry non-public novels, so no shared cache may ever hold one. */
  private noStore(response: HttpResponse): void {
    response.header('cache-control', 'private, no-store');
    response.header('vary', 'Cookie, Authorization');
  }
}
