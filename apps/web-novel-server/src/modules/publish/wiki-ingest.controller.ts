import { RequireScope } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, type HttpResponse, HttpStatus, Params, Put, Res, RespondFor } from '@shadow-library/fastify';

import { PUBLISH_SCOPE } from '@server/constants';

import { PublishAudited } from './publish.decorators';
import { NovelSlugParams } from './publish.dto';
import { WikiEntryKeyParams, WikiEntryUpsertBody, WikiManifestItem, WikiPublishResultResponse } from './wiki-ingest.dto';
import { WikiIngestService } from './wiki-ingest.service';

@HttpController('/internal/novels')
@RequireScope(PUBLISH_SCOPE)
export class WikiIngestController {
  constructor(private readonly wikiIngestService: WikiIngestService) {}

  @Put('/:slug/wiki/:entryKey')
  @PublishAudited('wiki.upsert')
  @RespondFor(200, WikiPublishResultResponse)
  async upsertEntry(@Params() params: WikiEntryKeyParams, @Body() body: WikiEntryUpsertBody, @Res() response: HttpResponse): Promise<WikiPublishResultResponse | undefined> {
    const result = await this.wikiIngestService.upsertEntry(params.slug, params.entryKey, body);
    if (result.outcome === 'noop') return void response.status(204).send();
    return { slug: params.slug, entryKey: params.entryKey, outcome: 'applied', revision: result.revision };
  }

  @Delete('/:slug/wiki/:entryKey')
  @PublishAudited('wiki.delete')
  @HttpStatus(204)
  async deleteEntry(@Params() params: WikiEntryKeyParams): Promise<void> {
    await this.wikiIngestService.deleteEntry(params.slug, params.entryKey);
  }

  @Get('/:slug/wiki/manifest')
  @RespondFor(200, [WikiManifestItem])
  getManifest(@Params() params: NovelSlugParams): Promise<WikiManifestItem[]> {
    return this.wikiIngestService.getManifest(params.slug);
  }
}
