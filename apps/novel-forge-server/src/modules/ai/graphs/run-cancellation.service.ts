import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

import { ModelRouterService } from '../model-router.service';
import { RunControlRepository } from './run-control.repository';
import { RUN_HEARTBEAT_MS, RUN_OWNER_SILENCE_MS } from './run-liveness';

/**
 * `stopping`: the cancel is recorded and a live replica, this one or another, is running the run and aborts it within a watch interval.
 * `not_delivered`: the cancel is recorded but the run's replica has stopped heartbeating, so nothing may be left to act on it.
 */
export type RunCancelOutcome = 'stopping' | 'not_delivered' | 'already_settled';

const WATCH_INTERVAL_MS = 1_000;

/**
 * Cancellation across replicas. A cancel lands in the run's row from whichever replica took it; the replica running the run watches the
 * rows of the runs it holds while it holds any, heartbeats them, and aborts each whose row was cancelled, settled elsewhere or deleted.
 */
@Injectable()
export class RunCancellationService {
  private readonly logger = Logger.getLogger(APP_NAME, RunCancellationService.name);
  private readonly watched = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private checking: Promise<void> | null = null;
  private recheck = false;
  private lastHeartbeatAt = -Infinity;

  constructor(
    private readonly runs: RunControlRepository,
    private readonly modelRouter: ModelRouterService,
  ) {}

  /**
   * Checks at once, or straight after a sweep already under way, rather than on the next tick: a cancel recorded before this replica began
   * watching lands one database round trip in, which is usually before the run's first model call and otherwise aborts that call.
   */
  watch(runId: string): void {
    this.watched.add(runId);
    if (!this.timer) {
      this.timer = setInterval(() => void this.check(), WATCH_INTERVAL_MS);
      this.timer.unref();
    }
    if (this.checking) this.recheck = true;
    else void this.check();
  }

  unwatch(runId: string): void {
    this.watched.delete(runId);
    if (this.watched.size > 0 || !this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Records first and aborts locally second, so a run this replica holds cannot settle as cancelled before its cancel is on record. */
  async request(runId: string): Promise<RunCancelOutcome> {
    const recorded = await this.runs.requestCancel(runId);
    const local = this.modelRouter.abortRun(runId);
    this.logger.info('workflow run cancellation requested', { runId, recorded: recorded !== null, local });
    if (!recorded) return 'already_settled';
    return local || recorded.silentMs <= RUN_OWNER_SILENCE_MS ? 'stopping' : 'not_delivered';
  }

  /**
   * A tick that lands during a sweep joins it; a run watched during one gets a sweep of its own straight after. A failed read aborts
   * nothing: an unreachable database is no reason to stop work it may still accept. `now` is monotonic, so a wall-clock step can neither
   * stall the heartbeat nor rush it.
   */
  check(now = performance.now()): Promise<void> {
    this.checking ??= this.sweepWhileWanted(now).finally(() => (this.checking = null));
    return this.checking;
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async sweepWhileWanted(now: number): Promise<void> {
    await this.sweep(now);
    while (this.recheck) {
      this.recheck = false;
      await this.sweep(performance.now());
    }
  }

  private async sweep(now: number): Promise<void> {
    const runIds = [...this.watched];
    if (runIds.length === 0) return;
    const heartbeat = now - this.lastHeartbeatAt >= RUN_HEARTBEAT_MS;
    let wanted: Set<string>;
    try {
      wanted = await this.runs.stillWanted(runIds, heartbeat);
    } catch (err) {
      this.logger.warn('workflow run cancel check failed', { runs: runIds.length, err });
      return;
    }
    if (heartbeat) this.lastHeartbeatAt = now;
    for (const runId of runIds) {
      if (wanted.has(runId) || !this.watched.has(runId)) continue;
      this.logger.info('workflow run cancel observed — aborting', { runId });
      this.modelRouter.abortRun(runId);
    }
  }
}
