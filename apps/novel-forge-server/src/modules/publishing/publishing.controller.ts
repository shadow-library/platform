/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Authenticated } from '@shadow-library/auth/module';
import { Config } from '@shadow-library/common';
import { Body, ContextService, Delete, Get, HttpController, HttpStatus, Params, Post, Put, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { JobExecutor } from '../jobs/job.executor';
import { JobService } from '../jobs/job.service';
import { PublicationAccessService } from './publication-access.service';
import { PublishRunner } from './publish-runner';
import {
  ChapterPublicationResponse,
  PublicationAccessBody,
  PublicationAccessResponse,
  PublicationResponse,
  PublicationsLedgerResponse,
  PublishChapterBody,
  PublishingChapterParams,
  PublishingProjectParams,
  PublishNovelBody,
  ReconcileResponse,
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
  constructor(
    private readonly publishingService: PublishingService,
    private readonly publishRunner: PublishRunner,
    private readonly jobService: JobService,
    private readonly jobExecutor: JobExecutor,
    private readonly accessService: PublicationAccessService,
    private readonly context: ContextService,
  ) {}

  @Post('/publish')
  @RespondFor(200, PublicationResponse)
  async publishNovel(@Params() params: PublishingProjectParams, @Body() body: PublishNovelBody): Promise<PublicationResponse> {
    const publication = await this.publishingService.publishNovel(params.projectId, body);
    await this.enqueuePublish(params.projectId);
    return publication;
  }

  @Post('/chapters/:chapter/publish')
  @HttpStatus(202)
  @RespondFor(202, ChapterPublicationResponse)
  async publishChapter(@Params() params: PublishingChapterParams, @Body() body: PublishChapterBody): Promise<ChapterPublicationResponse> {
    const row = await this.publishingService.publishChapter(params.projectId, params.chapter, body);
    // A future-dated schedule stays with the janitor sweep; an immediate publish pushes right away.
    const due = !row.scheduledAt || row.scheduledAt.getTime() <= Date.now();
    if (due) await this.enqueuePublish(params.projectId);
    return row;
  }

  @Delete('/chapters/:chapter/publish')
  @HttpStatus(202)
  @RespondFor(202, ChapterPublicationResponse)
  async unpublishChapter(@Params() params: PublishingChapterParams): Promise<ChapterPublicationResponse> {
    const row = await this.publishingService.unpublishChapter(params.projectId, params.chapter);
    await this.enqueuePublish(params.projectId);
    return row;
  }

  /*!
   * Access
   */

  @Get('/publications/access')
  @RespondFor(200, PublicationAccessResponse)
  getAccess(@Params() params: PublishingProjectParams): Promise<PublicationAccessResponse> {
    return this.accessService.getAccess(params.projectId);
  }

  /**
   * The organisation comes from the session, never the body: a caller may only share into the
   * organisation they are currently acting in, and letting the client name one would make this an
   * endpoint for sharing a novel into an organisation you merely know the id of.
   */
  @Put('/publications/access')
  @RespondFor(200, PublicationAccessResponse)
  async setAccess(@Params() params: PublishingProjectParams, @Body() body: PublicationAccessBody): Promise<PublicationAccessResponse> {
    const access = await this.accessService.setAccess(params.projectId, body, this.context.getAuthPrincipal().org);
    await this.enqueuePublish(params.projectId);
    return access;
  }

  @Get('/publications')
  @RespondFor(200, PublicationsLedgerResponse)
  async listPublications(@Params() params: PublishingProjectParams): Promise<PublicationsLedgerResponse> {
    const ledger = await this.publishingService.listPublications(params.projectId);
    return { publication: ledger.publication ?? undefined, chapters: ledger.chapters };
  }

  // Synchronous by design: the manifest diff is bounded and the UI's reconcile button wants the
  // outcome, not a job id. A reader outage surfaces as PUB_004 with the per-row errors ledgered.
  @Post('/publications/reconcile')
  @RespondFor(200, ReconcileResponse)
  async reconcilePublications(@Params() params: PublishingProjectParams): Promise<ReconcileResponse> {
    const result = await this.publishRunner.converge(params.projectId, { reconcile: true });
    return result;
  }

  // Low-latency path: dispatch the reader push right away, with the janitor sweep as the fallback. A
  // reader outage or revoked grant surfaces as a ledgered per-row failure the janitor retries. Deploys
  // that prefer batch-only pushing (or a test with no reader) set `PUBLISHING_AUTO_PUSH=false`.
  private async enqueuePublish(projectId: bigint): Promise<void> {
    if (!Config.get('publishing.auto-push')) return;
    const jobId = await this.jobService.enqueue(projectId, 'publish', `publish-${projectId}`);
    this.jobExecutor.dispatch(jobId).catch(() => undefined);
  }
}
