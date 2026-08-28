import { RequireScope } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, type HttpResponse, HttpStatus, Params, Put, Res, RespondFor } from '@shadow-library/fastify';

import { INGEST_SCOPE } from '@server/constants';

import { PublishAudited } from './publish.decorators';
import {
  ChapterOrdinalParams,
  ChapterUpsertBody,
  ManifestItem,
  NovelAccessBody,
  NovelAccessResponse,
  NovelSlugParams,
  NovelUpsertBody,
  PublishResultResponse,
} from './publish.dto';
import { PublishService } from './publish.service';

/**
 * The same publish protocol under a second prefix, for publishers carrying `web-novel:ingest` rather than
 * `web-novel:publish`. `@RequireScope` is an all-of check, so a single prefix listing both scopes would
 * demand both and lock out every publisher; a prefix per scope keeps each reachable while leaving the
 * requirement declared on the route. The prefix stays under `/internal/` so `InternalServiceGuard` and the
 * `/internal/*` service-access rule still cover it.
 *
 * There is deliberately no wiki twin: a scraped source carries no wiki projection, and an unused route is
 * authority granted for nothing.
 */

@HttpController('/internal/ingest/novels')
@RequireScope(INGEST_SCOPE)
export class IngestPublishController {
  constructor(private readonly publishService: PublishService) {}

  @Put('/:slug')
  @PublishAudited('novel.upsert')
  @RespondFor(200, PublishResultResponse)
  async upsertNovel(@Params() params: NovelSlugParams, @Body() body: NovelUpsertBody, @Res() response: HttpResponse): Promise<PublishResultResponse | undefined> {
    const result = await this.publishService.upsertNovel(params.slug, body);
    if (result.outcome === 'noop') return void response.status(204).send();
    return { id: String(result.novelId), slug: params.slug, outcome: 'applied', revision: result.revision };
  }

  @Put('/:slug/access')
  @PublishAudited('novel.access')
  @RespondFor(200, PublishResultResponse)
  async upsertAccess(@Params() params: NovelSlugParams, @Body() body: NovelAccessBody, @Res() response: HttpResponse): Promise<PublishResultResponse | undefined> {
    const result = await this.publishService.upsertAccess(params.slug, body);
    if (result.outcome === 'noop') return void response.status(204).send();
    return { id: String(result.novelId), slug: params.slug, outcome: 'applied', revision: result.revision };
  }

  @Get('/:slug/access')
  @RespondFor(200, NovelAccessResponse)
  getAccess(@Params() params: NovelSlugParams): Promise<NovelAccessResponse> {
    return this.publishService.getAccess(params.slug);
  }

  @Put('/:slug/chapters/:ordinal')
  @PublishAudited('chapter.upsert')
  @RespondFor(200, PublishResultResponse)
  async upsertChapter(@Params() params: ChapterOrdinalParams, @Body() body: ChapterUpsertBody, @Res() response: HttpResponse): Promise<PublishResultResponse | undefined> {
    const result = await this.publishService.upsertChapter(params.slug, params.ordinal, body);
    if (result.outcome === 'noop') return void response.status(204).send();
    return { id: String(result.novelId), slug: params.slug, outcome: 'applied', revision: result.revision };
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
