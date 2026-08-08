import { Authenticated } from '@shadow-library/auth/module';
import { Body, Get, HttpController, HttpStatus, Params, Post, Put, RespondFor } from '@shadow-library/fastify';

import { JobExecutor } from '../jobs/job.executor';
import { JobService } from '../jobs/job.service';
import { JobEnqueueResponse } from '../pipeline/pipeline.dto';
import {
  ListReforgesResponse,
  ReforgeChapterParams,
  ReforgeChapterResponse,
  ReforgeConfigBody,
  ReforgeManuscriptResponse,
  ReforgeParams,
  ReforgeResponse,
  ReforgeStartBody,
  ReforgeStatusResponse,
} from './reforge.dto';
import { ReforgeService } from './reforge.service';

@Authenticated()
@HttpController('/api/v1/projects/:projectId/reforge')
export class ReforgeController {
  constructor(
    private readonly reforgeService: ReforgeService,
    private readonly jobService: JobService,
    private readonly jobExecutor: JobExecutor,
  ) {}

  @Put('/config')
  @RespondFor(200, ReforgeResponse)
  updateConfig(@Params() params: ReforgeParams, @Body() body: ReforgeConfigBody): Promise<ReforgeResponse> {
    return this.reforgeService.updateConfig(params.projectId, body);
  }

  @Post()
  @HttpStatus(202)
  @RespondFor(202, JobEnqueueResponse)
  async startReforge(@Params() params: ReforgeParams, @Body() body: ReforgeStartBody): Promise<JobEnqueueResponse> {
    const { projectId } = params;
    // The kind guard runs before enqueue so a non-source project 400s instead of parking a job.
    await this.reforgeService.getOrCreate(projectId);
    const target = `reforge-${projectId}`;
    const jobId = await this.jobService.enqueue(projectId, 'reforge', target, { force: body.force, limit: body.limit });
    this.jobExecutor.dispatch(jobId).catch(() => undefined);
    return { jobId, kind: 'reforge', status: 'pending', target };
  }

  @Get()
  @RespondFor(200, ReforgeStatusResponse)
  async getReforgeStatus(@Params() params: ReforgeParams): Promise<ReforgeStatusResponse> {
    const [status, jobs] = await Promise.all([this.reforgeService.status(params.projectId), this.jobService.listByProject(params.projectId)]);
    const job = jobs.find(j => j.kind === 'reforge') ?? null;
    return { ...status, job };
  }

  @Get('/chapters')
  @RespondFor(200, ListReforgesResponse)
  async listReforges(@Params() params: ReforgeParams): Promise<ListReforgesResponse> {
    const items = await this.reforgeService.listReforges(params.projectId);
    return { items };
  }

  @Get('/chapters/:chapter')
  @RespondFor(200, ReforgeChapterResponse)
  getReforge(@Params() params: ReforgeChapterParams): Promise<ReforgeChapterResponse> {
    return this.reforgeService.getReforge(params.projectId, params.chapter);
  }

  @Post('/chapters/:chapter')
  @HttpStatus(202)
  @RespondFor(202, JobEnqueueResponse)
  async rerunChapter(@Params() params: ReforgeChapterParams): Promise<JobEnqueueResponse> {
    const { projectId, chapter } = params;
    await this.reforgeService.getOrCreate(projectId);
    // A distinct target lets a single-chapter re-run coexist with the full job under the unique
    // (projectId, kind, target) index; the per-project concurrency lock serialises the two.
    const target = `reforge-${projectId}-ch-${chapter}`;
    const jobId = await this.jobService.enqueue(projectId, 'reforge', target, { chapters: [chapter], force: true });
    this.jobExecutor.dispatch(jobId).catch(() => undefined);
    return { jobId, kind: 'reforge', status: 'pending', target };
  }

  @Get('/manuscript')
  @RespondFor(200, ReforgeManuscriptResponse)
  async getReforgeManuscript(@Params() params: ReforgeParams): Promise<ReforgeManuscriptResponse> {
    const markdown = await this.reforgeService.renderManuscript(params.projectId);
    return { markdown };
  }
}
