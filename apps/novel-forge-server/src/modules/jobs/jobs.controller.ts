/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Authenticated } from '@shadow-library/auth/module';
import { Get, HttpController, Params, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

import { JobService } from './job.service';
import { JobIdParams, JobResponse } from './jobs.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Authenticated()
@HttpController('/api/v1/jobs')
export class JobsController {
  constructor(private readonly jobService: JobService) {}

  @Get('/:jobId')
  @RespondFor(200, JobResponse)
  async getJob(@Params() params: JobIdParams): Promise<JobResponse> {
    const job = await this.jobService.get(params.jobId);
    if (!job) throw AppErrorCode.JOB_001.create();
    return job as unknown as JobResponse;
  }
}
