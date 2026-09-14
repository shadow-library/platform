import { Authenticated, BotPermission, RequirePermission } from '@shadow-library/auth/module';
import { Body, Get, HttpController, type HttpResponse, HttpStatus, Params, Post, Put, Res, RespondFor } from '@shadow-library/fastify';

import { CURATE_PERMISSION } from '@server/constants';

import { IngestChapterBody, IngestChapterParams, IngestCoverBody, IngestManifestResponse, IngestNovelBody, IngestNovelParams, IngestNovelResponse } from './curated-ingest.dto';
import { CuratedIngestService } from './curated-ingest.service';

/**
 * The scraper-facing surface, reached by the curation bot with an `sl_bot_…` key and by a curator from the
 * web app. Nothing here is project-id addressed, which keeps `ProjectOwnershipGuard` out of the picture —
 * ownership is proven against the caller while resolving the source reference.
 *
 * Both decorators name the same permission on purpose: `@BotPermission` is evaluated for bots alone, so
 * without `@RequirePermission` any authenticated person could mint a `curated` project — which publishes
 * under a third party's `originalAuthor` and is exactly what `novel-forge:curate` exists to gate. The guard
 * unions the two for a bot, so a bot still answers one PDP check. `highRisk` pins that decision's TTL to a
 * minute, matching `ProjectOwnershipGuard`'s curator check.
 */
@Authenticated()
@RequirePermission(CURATE_PERMISSION, { highRisk: true })
@BotPermission(CURATE_PERMISSION)
@HttpController('/api/v1/ingest')
export class CuratedIngestController {
  constructor(private readonly ingestService: CuratedIngestService) {}

  @Put('/novels/:sourceRef')
  @RespondFor(200, IngestNovelResponse)
  @RespondFor(201, IngestNovelResponse)
  async upsertNovel(@Params() params: IngestNovelParams, @Body() body: IngestNovelBody, @Res() res: HttpResponse): Promise<IngestNovelResponse> {
    const result = await this.ingestService.upsertNovel(params.sourceRef, body);
    res.status(result.created ? 201 : 200);
    return result;
  }

  @Put('/novels/:sourceRef/chapters/:sourceOrdinal')
  @HttpStatus(201)
  async pushChapter(@Params() params: IngestChapterParams, @Body() body: IngestChapterBody, @Res() res: HttpResponse): Promise<void> {
    const result = await this.ingestService.pushChapter(params.sourceRef, params.sourceOrdinal, body);
    if (!result.landed) res.status(204);
  }

  @Post('/novels/:sourceRef/cover')
  @HttpStatus(204)
  setCover(@Params() params: IngestNovelParams, @Body() body: IngestCoverBody): Promise<void> {
    return this.ingestService.setCover(params.sourceRef, body.image, body.mime);
  }

  @Get('/novels/:sourceRef/manifest')
  @RespondFor(200, IngestManifestResponse)
  getManifest(@Params() params: IngestNovelParams): Promise<IngestManifestResponse> {
    return this.ingestService.manifest(params.sourceRef);
  }
}
