import { type CatalogResponse } from '@shadow-library/synapse';
import { RequireScope } from '@shadow-library/auth/module';
import { Get, HttpController, type HttpRequest, type HttpResponse, Query, Req, Res, RespondFor } from '@shadow-library/fastify';

import { SYNAPSE_SCOPES } from '@modules/auth';

import { CallerService } from './caller.service';
import { CatalogViewService } from './catalog-view.service';
import { parseSelectors } from './catalog-selectors';
import { CatalogQuery, CatalogResponseDto } from './catalog-view.dto';

const ANY_ENTITY = '*';
const WEAK_PREFIX = 'W/';

function matchesEtag(header: string | string[] | undefined, etag: string): boolean {
  if (header === undefined) return false;
  const candidates = (Array.isArray(header) ? header.join(',') : header).split(',').map(candidate => candidate.trim());
  return candidates.some(candidate => candidate === ANY_ENTITY || (candidate.startsWith(WEAK_PREFIX) ? candidate.slice(WEAK_PREFIX.length) : candidate) === etag);
}

@HttpController('/api/v1/catalog')
export class CatalogController {
  constructor(
    private readonly caller: CallerService,
    private readonly views: CatalogViewService,
  ) {}

  @Get()
  @RequireScope(SYNAPSE_SCOPES.catalogRead)
  @RespondFor(200, CatalogResponseDto)
  async getCatalog(@Query() query: CatalogQuery, @Req() request: HttpRequest, @Res() response: HttpResponse): Promise<CatalogResponse | HttpResponse> {
    const { app } = this.caller.service();
    const { version, body } = this.views.view(app, query.task, parseSelectors(query.selectors));
    const etag = `"v${version}"`;
    response.header('etag', etag);
    response.header('cache-control', 'private, no-cache');
    if (matchesEtag(request.headers['if-none-match'], etag)) return response.status(304).send();
    return body;
  }
}
