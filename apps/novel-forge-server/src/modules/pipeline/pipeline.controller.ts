/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Body, Get, HttpController, HttpStatus, Params, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import {
  AssetsResponse,
  ConsolidateResponse,
  ExtractBody,
  IngestBody,
  JobEnqueueResponse,
  PipelineProjectParams,
  RecombineBody,
  RecombineResponse,
  ResumeResponse,
  RetitleResponse,
  SkeletonResponse,
} from './pipeline.dto';
import { ConsolidateService } from '../extraction/consolidate.service';
import { JobExecutor } from '../jobs/job.executor';
import { JobService } from '../jobs/job.service';
import { SkeletonService } from '../planning/skeleton.service';
import { AssetService } from '../source/asset.service';
import { RecombineService } from '../source/recombine.service';
import { WebnovelCatalogService } from '../source/webnovel-catalog.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/projects/:projectId')
export class PipelineController {
  constructor(
    private readonly jobService: JobService,
    private readonly jobExecutor: JobExecutor,
    private readonly assetService: AssetService,
    private readonly consolidateService: ConsolidateService,
    private readonly skeletonService: SkeletonService,
    private readonly recombineService: RecombineService,
    private readonly webnovelCatalog: WebnovelCatalogService,
  ) {}

  // ─── Ingest ─────────────────────────────────────────────────────────────────

  @Post('/ingest')
  @HttpStatus(202)
  @RespondFor(202, JobEnqueueResponse)
  async ingest(@Params() params: PipelineProjectParams, @Body() body: IngestBody): Promise<JobEnqueueResponse> {
    const { projectId } = params;
    const payload = { limit: body.limit, delayMs: body.delayMs };
    const target = `ingest-${projectId}`;
    const jobId = await this.jobService.enqueue(projectId, 'ingest', target, payload);
    this.jobExecutor.dispatch(jobId).catch(() => undefined);
    return { jobId, kind: 'ingest', status: 'pending', target };
  }

  // ─── Extract ─────────────────────────────────────────────────────────────────

  @Post('/extract')
  @HttpStatus(202)
  @RespondFor(202, JobEnqueueResponse)
  async extract(@Params() params: PipelineProjectParams, @Body() body: ExtractBody): Promise<JobEnqueueResponse> {
    const { projectId } = params;
    const payload = { limit: body.limit };
    const target = `extract-${projectId}`;
    const jobId = await this.jobService.enqueue(projectId, 'extract', target, payload);
    this.jobExecutor.dispatch(jobId).catch(() => undefined);
    return { jobId, kind: 'extract', status: 'pending', target };
  }

  // ─── Retitle ─────────────────────────────────────────────────────────────────

  @Post('/retitle')
  @RespondFor(200, RetitleResponse)
  retitle(@Params() params: PipelineProjectParams): Promise<RetitleResponse> {
    return this.webnovelCatalog.sync(params.projectId);
  }

  // ─── Recombine ───────────────────────────────────────────────────────────────

  @Post('/recombine')
  @RespondFor(200, RecombineResponse)
  recombine(@Params() params: PipelineProjectParams, @Body() body: RecombineBody): Promise<RecombineResponse> {
    return this.recombineService.recombine(params.projectId, { dryRun: body.dryRun, useAi: body.useAi }) as unknown as Promise<RecombineResponse>;
  }

  // ─── Consolidate ─────────────────────────────────────────────────────────────

  @Post('/consolidate')
  @RespondFor(200, ConsolidateResponse)
  consolidate(@Params() params: PipelineProjectParams): Promise<ConsolidateResponse> {
    return this.consolidateService.consolidate(params.projectId);
  }

  // ─── Assets ──────────────────────────────────────────────────────────────────

  @Get('/assets')
  @RespondFor(200, AssetsResponse)
  async assets(@Params() params: PipelineProjectParams): Promise<AssetsResponse> {
    const markdown = await this.assetService.render(params.projectId);
    return { markdown };
  }

  // ─── Skeleton ─────────────────────────────────────────────────────────────────

  @Post('/skeleton')
  @RespondFor(200, SkeletonResponse)
  skeleton(@Params() params: PipelineProjectParams): Promise<SkeletonResponse> {
    return this.skeletonService.generateSkeleton(params.projectId) as Promise<SkeletonResponse>;
  }

  // ─── Resume ──────────────────────────────────────────────────────────────────

  @Post('/resume')
  @HttpStatus(202)
  @RespondFor(202, ResumeResponse)
  async resume(@Params() params: PipelineProjectParams): Promise<ResumeResponse> {
    const { projectId } = params;
    const target = `ingest-${projectId}`;
    const jobId = await this.jobService.enqueue(projectId, 'ingest', target, {});
    this.jobExecutor.dispatch(jobId).catch(() => undefined);
    return { jobId };
  }
}
