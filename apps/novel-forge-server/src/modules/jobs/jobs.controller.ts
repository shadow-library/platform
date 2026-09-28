import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Get, HttpController, Params, RespondFor } from '@shadow-library/fastify';

import { ActorService } from '@modules/actor';
import { AppErrorCode } from '@server/classes';
import { PROJECTS_READ_PERMISSION } from '@server/constants';

import { emptyCallUsageTotals } from '../ai/usage/call-usage';
import { ProjectAccessService } from '../project/project-access.service';
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
    private readonly projectAccess: ProjectAccessService,
  ) {}

  @Get('/:jobId')
  @RespondFor(200, JobResponse)
  async getJob(@Params() params: JobIdParams): Promise<JobResponse> {
    // Jobs are not nested under a project route, so the ownership guard cannot cover them; scope the read by the
    // same access rule here. A job of a project the caller cannot reach is reported as not found (NF-BOLA-02).
    const found = await this.jobService.getWithProject(params.jobId);
    if (!found || !(await this.projectAccess.canReach(found.project, this.actorService.current()))) throw AppErrorCode.JOB_001.create();
    const { job } = found;
    const usage = await this.jobService.usageForJobs([job.id]);
    return { ...redactJobForResponse(job), usage: toJobUsageResponse(usage.get(job.id) ?? emptyCallUsageTotals()) };
  }
}
