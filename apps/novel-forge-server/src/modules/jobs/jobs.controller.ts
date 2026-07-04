/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Get, HttpController, Params } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { JobService } from './job.service';
import { JobIdParams } from './jobs.dto';

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
  getJob(@Params() params: JobIdParams): Promise<unknown> {
    return this.jobService.get(params.jobId);
  }
}
