import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

import { RUN_OWNER_SILENCE_MS } from '../ai/graphs/run-liveness';
import { AuthoringClaimService } from './authoring-claim.service';
import { JobExecutor } from './job.executor';
import { JobService } from './job.service';

/** The reset is one conditional update, so one replica re-dispatches each reset job; another may dispatch an unclaimed one too, and `start()` lets one run it. */
@Injectable()
export class JobJanitor {
  private readonly logger = Logger.getLogger(APP_NAME, JobJanitor.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly jobService: JobService,
    private readonly jobExecutor: JobExecutor,
    private readonly claims: AuthoringClaimService,
  ) {}

  get intervalMs(): number {
    return Math.min(this.claims.ttlMs, RUN_OWNER_SILENCE_MS);
  }

  onModuleInit(): void {
    this.timer = setInterval(() => this.sweep().catch(err => this.logger.warn('job sweep failed', { err })), this.intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async sweep(): Promise<string[]> {
    const reset = await this.jobService.resetAbandoned(this.jobExecutor.runningJobIds());
    const unclaimed = await this.jobService.findUnclaimedPendingAuthoring();
    const dispatched = [...new Set([...reset, ...unclaimed])];
    for (const jobId of dispatched) this.jobExecutor.dispatch(jobId).catch(err => this.logger.warn('job re-dispatch failed', { err, jobId }));
    if (dispatched.length > 0) this.logger.info('re-dispatched abandoned jobs', { jobs: dispatched });
    return dispatched;
  }
}
