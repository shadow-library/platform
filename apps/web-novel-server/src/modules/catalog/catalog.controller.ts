/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { type FastifyRequest } from 'fastify';
import { Config } from '@shadow-library/common';
import { Get, HttpController, type HttpResponse, Params, Query, Req, Res, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { ChapterOrdinalParams, NovelSlugParams } from '@server/modules/publish';

import { ChapterContentResponse, ChapterListResponse, NovelCatalogQuery, NovelCatalogResponse, NovelDetailResponse } from './catalog.dto';
import { CatalogService } from './catalog.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The public, unauthenticated reading surface. Chapter content is served cache-first: the ETag is
 * the forge's contentHash, `If-None-Match` short-circuits to 304, and a modest max-age keeps CDNs
 * and browsers holding a copy — a republish changes the hash, so revalidation misses naturally.
 */

@HttpController('/api/novels')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  @RespondFor(200, NovelCatalogResponse)
  listNovels(@Query() query: NovelCatalogQuery): Promise<NovelCatalogResponse> {
    return this.catalogService.listNovels(query);
  }

  @Get('/:slug')
  @RespondFor(200, NovelDetailResponse)
  getNovel(@Params() params: NovelSlugParams): Promise<NovelDetailResponse> {
    return this.catalogService.getNovel(params.slug);
  }

  @Get('/:slug/chapters')
  @RespondFor(200, ChapterListResponse)
  async listChapters(@Params() params: NovelSlugParams): Promise<ChapterListResponse> {
    return { items: await this.catalogService.listChapters(params.slug) };
  }

  @Get('/:slug/chapters/:ordinal')
  @RespondFor(200, ChapterContentResponse)
  async getChapter(@Params() params: ChapterOrdinalParams, @Req() request: FastifyRequest, @Res() response: HttpResponse): Promise<ChapterContentResponse | undefined> {
    const ref = await this.catalogService.getChapterRef(params.slug, Number(params.ordinal));
    response.header('etag', `"${ref.contentHash}"`);
    response.header('cache-control', `public, max-age=${Config.get('catalog.cache-max-age')}`);
    if (this.matchesETag(request.headers['if-none-match'], ref.contentHash)) return void response.status(304).send();
    return this.catalogService.getChapterContent(ref);
  }

  /** RFC 9110 §13.1.2: any listed entity-tag may match; weak-prefixed and unquoted forms are tolerated */
  private matchesETag(header: string | string[] | undefined, contentHash: string): boolean {
    if (typeof header !== 'string' || header.length === 0) return false;
    if (header.trim() === '*') return true;
    return header.split(',').some(tag => tag.trim().replace(/^W\//, '').replace(/^"|"$/g, '') === contentHash);
  }
}
