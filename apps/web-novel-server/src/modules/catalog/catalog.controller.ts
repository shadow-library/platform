import { type FastifyRequest } from 'fastify';
import { type AuthPrincipal } from '@shadow-library/auth';
import { AuthAccessPolicy, OptionalAuth } from '@shadow-library/auth/module';
import { Config } from '@shadow-library/common';
import { ContextService, Get, HttpController, type HttpResponse, Params, Query, Req, Res, RespondFor } from '@shadow-library/fastify';

import { ChapterOrdinalParams, NOVEL_VISIBILITIES, NovelSlugParams } from '@server/modules/publish';

import { ChapterContentResponse, ChapterListResponse, NovelCatalogQuery, NovelCatalogResponse, NovelDetailResponse } from './catalog.dto';
import { CatalogService } from './catalog.service';

/**
 * The catalog reading surface: anonymous in public mode, signed-in only in private mode. Chapter content
 * is served cache-first: the ETag is the forge's contentHash, `If-None-Match` short-circuits to 304, and
 * where a shared cache may hold it a modest max-age keeps CDNs and browsers holding a copy — a republish
 * changes the hash, so revalidation misses naturally.
 */

@HttpController('/api/novels')
@OptionalAuth()
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly context: ContextService,
    private readonly accessPolicy: AuthAccessPolicy,
  ) {}

  @Get()
  @RespondFor(200, NovelCatalogResponse)
  listNovels(@Query() query: NovelCatalogQuery, @Res() response: HttpResponse): Promise<NovelCatalogResponse> {
    if (this.accessPolicy.isPrivate()) this.preventSharedCaching(response);
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
   * A shared cache may hold only what anyone could have been served: a public novel, in public mode. In
   * private mode even a public novel went to a signed-in caller, and a CDN copy would hand it to anyone.
   */
  private applyCachePolicy(response: HttpResponse, visibility: (typeof NOVEL_VISIBILITIES)[number]): void {
    const shareable = visibility === 'PUBLIC' && !this.accessPolicy.isPrivate();
    if (shareable) return void response.header('cache-control', `public, max-age=${Config.get('catalog.cache-max-age')}`);
    this.preventSharedCaching(response);
  }

  /**
   * `no-store` rather than `private` alone, so that even a browser's back/forward cache does not retain the
   * response after a share is revoked, and `Vary` so any intermediary that ignores the first directive still
   * cannot serve one reader's copy to another.
   */
  private preventSharedCaching(response: HttpResponse): void {
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
