import { type FastifyRequest } from 'fastify';
import { type AuthPrincipal } from '@shadow-library/auth';
import { Config } from '@shadow-library/common';
import { ContextService, Get, HttpController, type HttpResponse, Params, Query, Req, Res, RespondFor } from '@shadow-library/fastify';

import { ChapterOrdinalParams, NOVEL_VISIBILITIES, NovelSlugParams } from '@server/modules/publish';

import { ChapterContentResponse, ChapterListResponse, NovelCatalogQuery, NovelCatalogResponse, NovelDetailResponse } from './catalog.dto';
import { CatalogService } from './catalog.service';

/**
 * The public, unauthenticated reading surface. Chapter content is served cache-first: the ETag is
 * the forge's contentHash, `If-None-Match` short-circuits to 304, and a modest max-age keeps CDNs
 * and browsers holding a copy — a republish changes the hash, so revalidation misses naturally.
 */

@HttpController('/api/novels')
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly context: ContextService,
  ) {}

  @Get()
  @RespondFor(200, NovelCatalogResponse)
  listNovels(@Query() query: NovelCatalogQuery): Promise<NovelCatalogResponse> {
    return this.catalogService.listNovels(query);
  }

  @Get('/:slug')
  @RespondFor(200, NovelDetailResponse)
  async getNovel(@Params() params: NovelSlugParams, @Res() response: HttpResponse): Promise<NovelDetailResponse> {
    const novel = await this.catalogService.getNovel(params.slug, this.principal());
    this.applyCachePolicy(response, novel.visibility);
    return novel;
  }

  @Get('/:slug/chapters')
  @RespondFor(200, ChapterListResponse)
  async listChapters(@Params() params: NovelSlugParams, @Res() response: HttpResponse): Promise<ChapterListResponse> {
    const chapters = await this.catalogService.listChapters(params.slug, this.principal());
    this.applyCachePolicy(response, chapters.visibility);
    return { items: chapters.items };
  }

  @Get('/:slug/chapters/:ordinal')
  @RespondFor(200, ChapterContentResponse)
  async getChapter(@Params() params: ChapterOrdinalParams, @Req() request: FastifyRequest, @Res() response: HttpResponse): Promise<ChapterContentResponse | undefined> {
    const ref = await this.catalogService.getChapterRef(params.slug, params.ordinal, this.principal());
    response.header('etag', `"${ref.contentHash}"`);
    this.applyCachePolicy(response, ref.visibility);
    if (this.matchesETag(request.headers['if-none-match'], ref.contentHash)) return void response.status(304).send();
    return this.catalogService.getChapterContent(ref);
  }

  private principal(): AuthPrincipal | null {
    return this.context.getAuthPrincipalOrNull();
  }

  /**
   * A public novel keeps the shared-cache story it has always had. Anything else must never be held
   * by a CDN or proxy, because the response is a function of who asked — `no-store` rather than
   * `private` so that even a browser's back/forward cache does not retain it after a share is
   * revoked, and `Vary` so any intermediary that ignores the first directive still cannot serve one
   * reader's copy to another.
   */
  private applyCachePolicy(response: HttpResponse, visibility: (typeof NOVEL_VISIBILITIES)[number]): void {
    if (visibility === 'PUBLIC') return void response.header('cache-control', `public, max-age=${Config.get('catalog.cache-max-age')}`);
    response.header('cache-control', 'private, no-store');
    response.header('vary', 'Cookie, Authorization');
  }

  /** RFC 9110 §13.1.2: any listed entity-tag may match; weak-prefixed and unquoted forms are tolerated */
  private matchesETag(header: string | string[] | undefined, contentHash: string): boolean {
    if (typeof header !== 'string' || header.length === 0) return false;
    if (header.trim() === '*') return true;
    return header.split(',').some(tag => tag.trim().replace(/^W\//, '').replace(/^"|"$/g, '') === contentHash);
  }
}
