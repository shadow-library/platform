import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Get, HttpController, Params, RespondFor } from '@shadow-library/fastify';

import { ActorService } from '@modules/actor';
import { AppErrorCode } from '@server/classes';
import { PROJECTS_READ_PERMISSION } from '@server/constants';

import { emptyCallUsageTotals } from '../ai/usage/call-usage';
import { redactJobForResponse, toJobUsageResponse } from './job-response';
import { JobService } from './job.service';
import { JobIdParams, JobResponse } from './jobs.dto';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/jobs')
export class JobsController {
  constructor(
    private readonly jobService: JobService,
    private readonly actorService: ActorService,
  ) {}

  @Get('/:jobId')
  @RespondFor(200, JobResponse)
  async getJob(@Params() params: JobIdParams): Promise<JobResponse> {
    // Jobs are not nested under a project route, so the ownership guard cannot cover them; scope the
    // read by the caller here. A job the caller does not own is reported as not found (NF-BOLA-02).
    const job = await this.jobService.getForOwner(params.jobId, this.actorService.current());
    if (!job) throw AppErrorCode.JOB_001.create();
    const usage = await this.jobService.usageForJobs([job.id]);
    return { ...redactJobForResponse(job), usage: toJobUsageResponse(usage.get(job.id) ?? emptyCallUsageTotals()) };
  }
}
