/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Authenticated } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import {
  ChapterPublicationResponse,
  PublicationResponse,
  PublicationsLedgerResponse,
  PublishChapterBody,
  PublishingChapterParams,
  PublishingProjectParams,
  PublishNovelBody,
} from './publishing.dto';
import { PublishingService } from './publishing.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Authenticated()
@HttpController('/api/v1/projects/:projectId')
export class PublishingController {
  constructor(private readonly publishingService: PublishingService) {}

  @Post('/publish')
  @RespondFor(200, PublicationResponse)
  async publishNovel(@Params() params: PublishingProjectParams, @Body() body: PublishNovelBody): Promise<PublicationResponse> {
    const publication = await this.publishingService.publishNovel(params.projectId, body);
    return publication as unknown as PublicationResponse;
  }

  @Post('/chapters/:chapter/publish')
  @HttpStatus(202)
  @RespondFor(202, ChapterPublicationResponse)
  async publishChapter(@Params() params: PublishingChapterParams, @Body() body: PublishChapterBody): Promise<ChapterPublicationResponse> {
    const row = await this.publishingService.publishChapter(params.projectId, params.chapter, body);
    return row as unknown as ChapterPublicationResponse;
  }

  @Delete('/chapters/:chapter/publish')
  @HttpStatus(202)
  @RespondFor(202, ChapterPublicationResponse)
  async unpublishChapter(@Params() params: PublishingChapterParams): Promise<ChapterPublicationResponse> {
    const row = await this.publishingService.unpublishChapter(params.projectId, params.chapter);
    return row as unknown as ChapterPublicationResponse;
  }

  @Get('/publications')
  @RespondFor(200, PublicationsLedgerResponse)
  async listPublications(@Params() params: PublishingProjectParams): Promise<PublicationsLedgerResponse> {
    const ledger = await this.publishingService.listPublications(params.projectId);
    return { publication: (ledger.publication ?? undefined) as unknown as PublicationResponse, chapters: ledger.chapters as unknown as ChapterPublicationResponse[] };
  }
}
