import { type FastifyRequest } from 'fastify';
import { type AuthPrincipal } from '@shadow-library/auth';
import { AuthAccessPolicy, OptionalAuth } from '@shadow-library/auth/module';
import { Config } from '@shadow-library/common';
import { ContextService, Get, HttpController, type HttpResponse, Params, Query, Req, Res, RespondFor } from '@shadow-library/fastify';

import { ChapterOrdinalParams, NOVEL_VISIBILITIES, NovelSlugParams } from '@server/modules/publish';

import { ChapterContentResponse, ChapterListResponse, NovelCatalogQuery, NovelCatalogResponse, NovelDetailResponse } from './catalog.dto';
import { CatalogService } from './catalog.service';

/** Chapter ETags are the forge's contentHash, so a republish that changes content naturally misses revalidation. */

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

  /** A shared cache may hold only what anyone could be served: a public novel in public mode; in private mode even a public novel went to a signed-in caller. */
  private applyCachePolicy(response: HttpResponse, visibility: (typeof NOVEL_VISIBILITIES)[number]): void {
    const shareable = visibility === 'PUBLIC' && !this.accessPolicy.isPrivate();
    if (shareable) return void response.header('cache-control', `public, max-age=${Config.get('catalog.cache-max-age')}`);
    this.preventSharedCaching(response);
  }

  /** `no-store` so a browser's back/forward cache does not outlive a revoked share; `Vary` so an intermediary ignoring it still cannot cross readers. */
  private preventSharedCaching(response: HttpResponse): void {
    response.header('cache-control', 'private, no-store');
    response.header('vary', 'Cookie, Authorization');
  }

  /** RFC 9110 section 13.1.2: any listed entity-tag may match; weak-prefixed and unquoted forms are tolerated. */
  private matchesETag(header: string | string[] | undefined, contentHash: string): boolean {
    if (typeof header !== 'string' || header.length === 0) return false;
    if (header.trim() === '*') return true;
    return header.split(',').some(tag => tag.trim().replace(/^W\//, '').replace(/^"|"$/g, '') === contentHash);
  }
}
