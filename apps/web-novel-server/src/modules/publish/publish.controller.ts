/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { RequireScope } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, type HttpResponse, HttpStatus, Params, Put, Res, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { PUBLISH_SCOPE } from '@server/constants';

import { PublishAudited } from './publish.decorators';
import { ChapterOrdinalParams, ChapterUpsertBody, ManifestItem, NovelSlugParams, NovelUpsertBody, PublishResultResponse } from './publish.dto';
import { PublishService } from './publish.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The one-way push surface novel-forge-server drives; it is never exposed publicly. Every route
 * requires an identity-issued M2M token carrying `webnovel:publish` — a scope end-user tokens
 * never receive — and the guard additionally checks the admin-configured service-access rules
 * for the calling client. Mutations answer 200 applied / 204 no-op / 409 stale.
 */

@HttpController('/internal/novels')
@RequireScope(PUBLISH_SCOPE)
export class PublishController {
  constructor(private readonly publishService: PublishService) {}

  @Put('/:slug')
  @PublishAudited('novel.upsert')
  @RespondFor(200, PublishResultResponse)
  async upsertNovel(@Params() params: NovelSlugParams, @Body() body: NovelUpsertBody, @Res() response: HttpResponse): Promise<PublishResultResponse | undefined> {
    const result = await this.publishService.upsertNovel(params.slug, body);
    if (result.outcome === 'noop') return void response.status(204).send();
    return { slug: params.slug, outcome: 'applied', revision: result.revision };
  }

  @Put('/:slug/chapters/:ordinal')
  @PublishAudited('chapter.upsert')
  @RespondFor(200, PublishResultResponse)
  async upsertChapter(@Params() params: ChapterOrdinalParams, @Body() body: ChapterUpsertBody, @Res() response: HttpResponse): Promise<PublishResultResponse | undefined> {
    const result = await this.publishService.upsertChapter(params.slug, params.ordinal, body);
    if (result.outcome === 'noop') return void response.status(204).send();
    return { slug: params.slug, outcome: 'applied', revision: result.revision };
  }

  @Delete('/:slug/chapters/:ordinal')
  @PublishAudited('chapter.unpublish')
  @HttpStatus(204)
  async unpublishChapter(@Params() params: ChapterOrdinalParams): Promise<void> {
    await this.publishService.unpublishChapter(params.slug, params.ordinal);
  }

  @Get('/:slug/manifest')
  @RespondFor(200, [ManifestItem])
  getManifest(@Params() params: NovelSlugParams): Promise<ManifestItem[]> {
    return this.publishService.getManifest(params.slug);
  }
}
