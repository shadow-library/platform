import { Authenticated } from '@shadow-library/auth/module';
import { ContextService, Get, HttpController, Params, RespondFor } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';

import { redactJobForResponse } from './job-response';
import { JobService } from './job.service';
import { JobIdParams, JobResponse } from './jobs.dto';

@Authenticated()
@HttpController('/api/v1/jobs')
export class JobsController {
  constructor(
    private readonly jobService: JobService,
    private readonly context: ContextService,
  ) {}

  @Get('/:jobId')
  @RespondFor(200, JobResponse)
  async getJob(@Params() params: JobIdParams): Promise<JobResponse> {
    // Jobs are not nested under a project route, so the ownership guard cannot cover them; scope the
    // read by the caller here. A job the caller does not own is reported as not found (NF-BOLA-02).
    const ownerId = BigInt(this.context.getAuthPrincipal().sub);
    const job = await this.jobService.getForOwner(params.jobId, ownerId);
    if (!job) throw AppErrorCode.JOB_001.create();
    return redactJobForResponse(job);
  }
}
