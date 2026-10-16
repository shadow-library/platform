import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

import { TurnEventRepository } from './turn-event.repository';

const SWEEP_INTERVAL_MS = 5 * 60_000;

/** A reconnect inside this window still replays the turn that just ended; past it the transcript is the only record a client needs. */
const ENDED_RETENTION_MS = 10 * 60_000;

/** For a turn that never wrote its end: swept once its newest frame and its run have both been silent this long, so a live turn never is. */
const ABANDONED_RETENTION_MS = 60 * 60_000;

/** Sweeps stored turn frames. Every replica schedules it; the sweep's advisory lock lets one of them run it at a time. */
@Injectable()
export class TurnEventJanitor {
  private readonly logger = Logger.getLogger(APP_NAME, TurnEventJanitor.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly turnEvents: TurnEventRepository) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async sweep(now = Date.now()): Promise<void> {
    try {
      const pruned = await this.turnEvents.prune(new Date(now - ENDED_RETENTION_MS), new Date(now - ABANDONED_RETENTION_MS));
      if (pruned === null) this.logger.debug('turn event sweep skipped — another replica holds it');
      else if (pruned > 0) this.logger.info('turn event sweep done', { pruned });
    } catch (err) {
      this.logger.warn('turn event sweep failed', { err });
    }
  }
}
