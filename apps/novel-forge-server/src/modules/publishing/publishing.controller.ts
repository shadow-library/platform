/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Authenticated } from '@shadow-library/auth/module';
import { Config } from '@shadow-library/common';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { JobExecutor } from '../jobs/job.executor';
import { JobService } from '../jobs/job.service';
import { PublishRunner } from './publish-runner';
import {
  ChapterPublicationResponse,
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
  ) {}

  @Post('/publish')
  @RespondFor(200, PublicationResponse)
  async publishNovel(@Params() params: PublishingProjectParams, @Body() body: PublishNovelBody): Promise<PublicationResponse> {
    const publication = await this.publishingService.publishNovel(params.projectId, body);
    await this.enqueuePublish(params.projectId);
    return publication as unknown as PublicationResponse;
  }

  @Post('/chapters/:chapter/publish')
  @HttpStatus(202)
  @RespondFor(202, ChapterPublicationResponse)
  async publishChapter(@Params() params: PublishingChapterParams, @Body() body: PublishChapterBody): Promise<ChapterPublicationResponse> {
    const row = await this.publishingService.publishChapter(params.projectId, params.chapter, body);
    // A future-dated schedule stays with the janitor sweep; an immediate publish pushes right away.
    const due = !row.scheduledAt || row.scheduledAt.getTime() <= Date.now();
    if (due) await this.enqueuePublish(params.projectId);
    return row as unknown as ChapterPublicationResponse;
  }

  @Delete('/chapters/:chapter/publish')
  @HttpStatus(202)
  @RespondFor(202, ChapterPublicationResponse)
  async unpublishChapter(@Params() params: PublishingChapterParams): Promise<ChapterPublicationResponse> {
    const row = await this.publishingService.unpublishChapter(params.projectId, params.chapter);
    await this.enqueuePublish(params.projectId);
    return row as unknown as ChapterPublicationResponse;
  }

  @Get('/publications')
  @RespondFor(200, PublicationsLedgerResponse)
  async listPublications(@Params() params: PublishingProjectParams): Promise<PublicationsLedgerResponse> {
    const ledger = await this.publishingService.listPublications(params.projectId);
    return { publication: (ledger.publication ?? undefined) as unknown as PublicationResponse, chapters: ledger.chapters as unknown as ChapterPublicationResponse[] };
  }

  // Synchronous by design: the manifest diff is bounded and the UI's reconcile button wants the
  // outcome, not a job id. A reader outage surfaces as PUB_004 with the per-row errors ledgered.
  @Post('/publications/reconcile')
  @RespondFor(200, ReconcileResponse)
  async reconcile(@Params() params: PublishingProjectParams): Promise<ReconcileResponse> {
    const result = await this.publishRunner.converge(params.projectId, { reconcile: true });
    return result as unknown as ReconcileResponse;
  }

  // Without M2M credentials every push is a guaranteed failure, so the immediate enqueue is skipped;
  // the janitor sweep still runs and ledgers the misconfiguration where the UI can see it.
  private async enqueuePublish(projectId: bigint): Promise<void> {
    if (!Config.get('auth.m2m.client.id')) return;
    const jobId = await this.jobService.enqueue(projectId, 'publish', `publish-${projectId}`);
    this.jobExecutor.dispatch(jobId).catch(() => undefined);
  }
}
