/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Authenticated } from '@shadow-library/auth/module';
import { Body, Get, HttpController, HttpStatus, Params, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { ConsolidateService } from '../extraction/consolidate.service';
import { JobExecutor } from '../jobs/job.executor';
import { JobService } from '../jobs/job.service';
import { SkeletonService } from '../planning/skeleton.service';
import { AssetService } from '../source/asset.service';
import { RecombineService } from '../source/recombine.service';
import { AssetsResponse, ConsolidateResponse, ExtractBody, JobEnqueueResponse, PipelineProjectParams, RecombineBody, RecombineResponse, SkeletonResponse } from './pipeline.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Authenticated()
@HttpController('/api/v1/projects/:projectId')
export class PipelineController {
  constructor(
    private readonly jobService: JobService,
    private readonly jobExecutor: JobExecutor,
    private readonly assetService: AssetService,
    private readonly consolidateService: ConsolidateService,
    private readonly skeletonService: SkeletonService,
    private readonly recombineService: RecombineService,
  ) {}

  // ─── Extract ─────────────────────────────────────────────────────────────────

  @Post('/extract')
  @HttpStatus(202)
  @RespondFor(202, JobEnqueueResponse)
  async extractKnowledge(@Params() params: PipelineProjectParams, @Body() body: ExtractBody): Promise<JobEnqueueResponse> {
    const { projectId } = params;
    const payload = { limit: body.limit };
    const target = `extract-${projectId}`;
    const jobId = await this.jobService.enqueue(projectId, 'extract', target, payload);
    this.jobExecutor.dispatch(jobId).catch(() => undefined);
    return { jobId, kind: 'extract', status: 'pending', target };
  }

  // ─── Recombine ───────────────────────────────────────────────────────────────

  @Post('/recombine')
  @RespondFor(200, RecombineResponse)
  recombineChapters(@Params() params: PipelineProjectParams, @Body() body: RecombineBody): Promise<RecombineResponse> {
    return this.recombineService.recombine(params.projectId, { dryRun: body.dryRun, useAi: body.useAi });
  }

  // ─── Consolidate ─────────────────────────────────────────────────────────────

  @Post('/consolidate')
  @RespondFor(200, ConsolidateResponse)
  consolidateSource(@Params() params: PipelineProjectParams): Promise<ConsolidateResponse> {
    return this.consolidateService.consolidate(params.projectId);
  }

  // ─── Assets ──────────────────────────────────────────────────────────────────

  @Get('/assets')
  @RespondFor(200, AssetsResponse)
  async getAssets(@Params() params: PipelineProjectParams): Promise<AssetsResponse> {
    const markdown = await this.assetService.render(params.projectId);
    return { markdown };
  }

  // ─── Skeleton ─────────────────────────────────────────────────────────────────

  @Post('/skeleton')
  @RespondFor(200, SkeletonResponse)
  generateSkeleton(@Params() params: PipelineProjectParams): Promise<SkeletonResponse> {
    return this.skeletonService.generateSkeleton(params.projectId) as Promise<SkeletonResponse>;
  }
}
