import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Blueprint } from '@server/database';

import { JobExecutor } from '../../jobs/job.executor';
import { JobService } from '../../jobs/job.service';
import { isActiveRound } from './blueprint-round';
import { type BlueprintJobPayload, blueprintJobTarget } from './blueprint-round.runner';
import { BlueprintRoundService, presentRound } from './blueprint-round.service';
import { BlueprintStepRegistry } from './blueprint-step.registry';
import { BlueprintStepService, type OpenRoundInput } from './blueprint-step.service';

export interface CancelRoundResult {
  outcome: 'cancelled' | 'stopping' | 'already_settled';
  round: Blueprint.Round;
}

@Injectable()
export class BlueprintRoundQueue {
  private readonly logger = Logger.getLogger(APP_NAME, BlueprintRoundQueue.name);

  constructor(
    private readonly steps: BlueprintStepService,
    private readonly rounds: BlueprintRoundService,
    private readonly registry: BlueprintStepRegistry,
    private readonly jobService: JobService,
    private readonly jobExecutor: JobExecutor,
  ) {}

  async start(projectId: bigint, stepKey: string, input: OpenRoundInput): Promise<Blueprint.Round> {
    const round = await this.steps.openRound(projectId, stepKey, input);
    const payload: BlueprintJobPayload = { roundId: String(round.id) };
    try {
      const jobId = await this.jobService.enqueue(projectId, 'blueprint', blueprintJobTarget(round), payload);
      const queued = (await this.rounds.attachJob(round.id, jobId)) ?? round;
      this.jobExecutor.dispatch(jobId).catch(err => this.logger.error('blueprint job dispatch failed', { err, jobId }));
      return queued;
    } catch (err) {
      await this.rounds.settle(round.id, 'failed', 'The round could not be queued. Try again.');
      throw err;
    }
  }

  /** Cancelling a sourced screen cancels its pass's round, which every screen of that pass shares. */
  async cancel(projectId: bigint, stepKey: string): Promise<CancelRoundResult> {
    const generatorKey = this.registry.roundTarget(stepKey).generator.key;
    const latest = await this.rounds.latestForStep(projectId, generatorKey);
    if (!latest || !isActiveRound(presentRound(latest).status)) throw AppErrorCode.BPR_006.create();
    const { round } = latest;

    const cancelled = round.jobId ? await this.jobService.cancel(round.jobId, projectId) : undefined;
    const outcome = cancelled?.outcome ?? 'cancelled';
    if (outcome === 'cancelled') await this.rounds.settle(round.id, 'cancelled', null);
    const settled = await this.rounds.latestForStep(projectId, generatorKey);
    return { outcome, round: settled ? presentRound(settled) : round };
  }
}
