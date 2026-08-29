import { Body, Get, HttpController, type HttpResponse, HttpStatus, Params, Post, Put, Res, RespondFor } from '@shadow-library/fastify';

import { ApiKeyAuthenticated } from '@modules/api-key';

import { IngestChapterBody, IngestChapterParams, IngestCoverBody, IngestManifestResponse, IngestNovelBody, IngestNovelParams, IngestNovelResponse } from './curated-ingest.dto';
import { CuratedIngestService } from './curated-ingest.service';

/**
 * The scraper-facing surface: authenticated by an API key alone, and deliberately NOT `@Authenticated()`.
 * The package `AuthGuard` sorts ahead of `ApiKeyGuard` and would reject a key-only caller with `IAM_001`
 * before it ever ran, so the two decorators are mutually exclusive rather than complementary. Nothing here
 * is project-id addressed either, which keeps `ProjectOwnershipGuard` out of the picture — ownership is
 * proven against the key owner while resolving the source reference.
 */
@ApiKeyAuthenticated()
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
