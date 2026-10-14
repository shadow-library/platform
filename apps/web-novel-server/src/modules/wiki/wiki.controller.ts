import { type FastifyRequest } from 'fastify';
import { type AuthPrincipal } from '@shadow-library/auth';
import { AuthAccessPolicy, OptionalAuth } from '@shadow-library/auth/module';
import { Config } from '@shadow-library/common';
import { ContextService, Get, HttpController, type HttpResponse, Params, Req, Res, RespondFor } from '@shadow-library/fastify';

import { NovelSlugParams, WikiEntryKeyParams } from '@server/modules/publish';

import { WikiEntryDetailResponse, WikiListResponse } from './wiki.dto';
import { type WikiRead, WikiService } from './wiki.service';

/**
 * The spoiler-gated wiki surface, under the catalog's access rules: read anonymously at gate 0 (public mode
 * only), or as a signed-in reader gated by their furthest ordinal. A public novel read anonymously in public
 * mode is CDN-cacheable with an ETag; anything else is `private, no-store`, because the very content is a
 * function of who is asking.
 */

@HttpController('/api/novels')
@OptionalAuth()
export class WikiController {
  constructor(
    private readonly wikiService: WikiService,
    private readonly context: ContextService,
    private readonly accessPolicy: AuthAccessPolicy,
  ) {}

  @Get('/:slug/wiki')
  @RespondFor(200, WikiListResponse)
  async listEntries(@Params() params: NovelSlugParams, @Req() request: FastifyRequest, @Res() response: HttpResponse): Promise<WikiListResponse | undefined> {
    const read = await this.wikiService.listEntries(params.slug, this.principal());
    return this.finish(read, request, response);
  }

  @Get('/:slug/wiki/:entryKey')
  @RespondFor(200, WikiEntryDetailResponse)
  async getEntry(@Params() params: WikiEntryKeyParams, @Req() request: FastifyRequest, @Res() response: HttpResponse): Promise<WikiEntryDetailResponse | undefined> {
    const read = await this.wikiService.getEntry(params.slug, params.entryKey, this.principal());
    return this.finish(read, request, response);
  }

  private principal(): AuthPrincipal | null {
    return this.context.getAuthPrincipalOrNull();
  }

  private finish<T>(read: WikiRead<T>, request: FastifyRequest, response: HttpResponse): T | undefined {
    response.header('etag', read.etag);
    this.applyCachePolicy(response, read.visibility, read.personalized);
    if (this.matchesETag(request.headers['if-none-match'], read.etag)) return void response.status(304).send();
    return read.body;
  }

  /**
   * A public novel read anonymously gates at 0 for everyone, so in public mode a shared cache may hold it.
   * A reader-specific response (a signed-in reader, whose gate moves with their progress), a non-public
   * novel, or anything served in private mode — where only signed-in callers get through — must never be
   * held by a CDN: `no-store` plus `Vary`, exactly as the catalog treats them.
   */
  private applyCachePolicy(response: HttpResponse, visibility: WikiRead<unknown>['visibility'], personalized: boolean): void {
    const shareable = visibility === 'PUBLIC' && !personalized && !this.accessPolicy.isPrivate();
    if (shareable) return void response.header('cache-control', `public, max-age=${Config.get('catalog.cache-max-age')}`);
    this.preventSharedCaching(response);
  }

  private preventSharedCaching(response: HttpResponse): void {
    response.header('cache-control', 'private, no-store');
    response.header('vary', 'Cookie, Authorization');
  }

  /** RFC 9110 §13.1.2: any listed entity-tag may match; weak-prefixed and unquoted forms are tolerated. */
  private matchesETag(header: string | string[] | undefined, etag: string): boolean {
    if (typeof header !== 'string' || header.length === 0) return false;
    if (header.trim() === '*') return true;
    const value = etag.replace(/^"|"$/g, '');
    return header.split(',').some(tag => tag.trim().replace(/^W\//, '').replace(/^"|"$/g, '') === value);
  }
}
