/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Authenticated } from '@shadow-library/auth/module';
import { Body, Get, HttpController, HttpStatus, Params, Post, Put, Query, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { JobExecutor } from '../jobs/job.executor';
import { JobService } from '../jobs/job.service';
import { JobEnqueueResponse } from '../pipeline/pipeline.dto';
import {
  ConversionResponse,
  GlossaryListQuery,
  GlossaryListResponse,
  ListConversionsResponse,
  ManuscriptResponse,
  RebrandChapterParams,
  RebrandConfigBody,
  RebrandParams,
  RebrandResponse,
  RebrandStartBody,
  RebrandStatusResponse,
} from './rebrand.dto';
import { RebrandService } from './rebrand.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Authenticated()
@HttpController('/api/v1/projects/:projectId/rebrand')
export class RebrandController {
  constructor(
    private readonly rebrandService: RebrandService,
    private readonly jobService: JobService,
    private readonly jobExecutor: JobExecutor,
  ) {}

  @Put('/config')
  @RespondFor(200, RebrandResponse)
  updateConfig(@Params() params: RebrandParams, @Body() body: RebrandConfigBody): Promise<RebrandResponse> {
    return this.rebrandService.updateConfig(params.projectId, body);
  }

  @Post()
  @HttpStatus(202)
  @RespondFor(202, JobEnqueueResponse)
  async startRebrand(@Params() params: RebrandParams, @Body() body: RebrandStartBody): Promise<JobEnqueueResponse> {
    const { projectId } = params;
    // The kind guard runs before enqueue so a non-source project 400s instead of parking a job.
    await this.rebrandService.getOrCreate(projectId);
    const target = `rebrand-${projectId}`;
    const jobId = await this.jobService.enqueue(projectId, 'rebrand', target, { force: body.force, limit: body.limit });
    this.jobExecutor.dispatch(jobId).catch(() => undefined);
    return { jobId, kind: 'rebrand', status: 'pending', target };
  }

  @Get()
  @RespondFor(200, RebrandStatusResponse)
  async getRebrandStatus(@Params() params: RebrandParams): Promise<RebrandStatusResponse> {
    const [status, jobs] = await Promise.all([this.rebrandService.status(params.projectId), this.jobService.listByProject(params.projectId)]);
    const job = jobs.find(j => j.kind === 'rebrand') ?? null;
    return { ...status, job };
  }

  @Get('/glossary')
  @RespondFor(200, GlossaryListResponse)
  async getGlossary(@Params() params: RebrandParams, @Query() query: GlossaryListQuery): Promise<GlossaryListResponse> {
    const items = await this.rebrandService.listGlossary(params.projectId, query);
    return { items };
  }

  @Get('/chapters')
  @RespondFor(200, ListConversionsResponse)
  async listConversions(@Params() params: RebrandParams): Promise<ListConversionsResponse> {
    const items = await this.rebrandService.listConversions(params.projectId);
    return { items };
  }

  @Get('/chapters/:chapter')
  @RespondFor(200, ConversionResponse)
  getConversion(@Params() params: RebrandChapterParams): Promise<ConversionResponse> {
    return this.rebrandService.getConversion(params.projectId, params.chapter);
  }

  @Post('/chapters/:chapter')
  @HttpStatus(202)
  @RespondFor(202, JobEnqueueResponse)
  async rerunChapter(@Params() params: RebrandChapterParams): Promise<JobEnqueueResponse> {
    const { projectId, chapter } = params;
    await this.rebrandService.getOrCreate(projectId);
    // A distinct target lets a single-chapter re-run coexist with the full job under the unique
    // (projectId, kind, target) index; the per-project concurrency lock serialises the two.
    const target = `rebrand-${projectId}-ch-${chapter}`;
    const jobId = await this.jobService.enqueue(projectId, 'rebrand', target, { chapters: [chapter], force: true });
    this.jobExecutor.dispatch(jobId).catch(() => undefined);
    return { jobId, kind: 'rebrand', status: 'pending', target };
  }

  @Get('/manuscript')
  @RespondFor(200, ManuscriptResponse)
  async getRebrandManuscript(@Params() params: RebrandParams): Promise<ManuscriptResponse> {
    const markdown = await this.rebrandService.renderManuscript(params.projectId);
    return { markdown };
  }
}
