/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Get, HttpController, Params, RespondFor, ServerError } from '@shadow-library/fastify';

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

@HttpController('/jobs')
export class JobsController {
  constructor(private readonly jobService: JobService) {}

  @Get('/:jobId')
  @RespondFor(200, JobResponse)
  async getJob(@Params() params: JobIdParams): Promise<JobResponse> {
    const job = await this.jobService.get(params.jobId);
    if (!job) throw new ServerError(AppErrorCode.JOB_001);
    return job as unknown as JobResponse;
  }
}
