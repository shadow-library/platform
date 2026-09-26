import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

import { AuthoringClaimService } from './authoring-claim.service';
import { JobExecutor } from './job.executor';
import { JobService } from './job.service';

/** Every claim TTL, re-dispatches authoring jobs whose claim went stale or was never taken: a crashed worker's job and a reservation nobody dispatched. */
@Injectable()
export class AuthoringJobJanitor {
  private readonly logger = Logger.getLogger(APP_NAME, AuthoringJobJanitor.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly jobService: JobService,
    private readonly jobExecutor: JobExecutor,
    private readonly claims: AuthoringClaimService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => this.sweep().catch(err => this.logger.warn('authoring job sweep failed', { err })), this.claims.ttlMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async sweep(): Promise<string[]> {
    await this.jobService.resetOrphanedAuthoring();
    const orphaned = await this.jobService.findUnclaimedPendingAuthoring();
    for (const jobId of orphaned) this.jobExecutor.dispatch(jobId).catch(err => this.logger.warn('authoring job re-dispatch failed', { err, jobId }));
    if (orphaned.length > 0) this.logger.info('re-dispatched unclaimed authoring jobs', { jobs: orphaned });
    return orphaned;
  }
}
