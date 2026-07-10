/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Body, Get, HttpController, Params, Put, RespondFor, ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

import { BibleDocParams, BibleDocProjectParams, BibleDocResponse, ListBibleDocResponse, UpsertBibleDocBody } from './bible-document.dto';
import { BibleDocumentService } from './bible-document.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/projects/:projectId/bible')
export class BibleDocumentController {
  constructor(private readonly bibleDocumentService: BibleDocumentService) {}

  @Get()
  @RespondFor(200, ListBibleDocResponse)
  async listBibleDocs(@Params() params: BibleDocProjectParams): Promise<ListBibleDocResponse> {
    const docs = await this.bibleDocumentService.list(params.projectId);
    return { docs } as unknown as ListBibleDocResponse;
  }

  @Get('/:section/:slug')
  @RespondFor(200, BibleDocResponse)
  async getBibleDoc(@Params() params: BibleDocParams): Promise<BibleDocResponse> {
    const doc = await this.bibleDocumentService.get(params.projectId, params.section, params.slug);
    if (!doc) throw new ServerError(AppErrorCode.DOC_001);
    return doc as unknown as BibleDocResponse;
  }

  @Put('/:section/:slug')
  @RespondFor(200, BibleDocResponse)
  upsertBibleDoc(@Params() params: BibleDocParams, @Body() body: UpsertBibleDocBody): Promise<BibleDocResponse> {
    return this.bibleDocumentService.upsert(params.projectId, params.section, params.slug, body) as unknown as Promise<BibleDocResponse>;
  }
}
