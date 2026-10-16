import { Inject, Injectable, InjectionToken, type OnApplicationStop, type OnModuleDestroy } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

import { type CatalogTimers } from '@modules/catalog';
import { APP_NAME } from '@server/constants';

import { shuttingDown } from './dispatch-failure.util';
import { RequestAbort } from './request-abort';

export const INFERENCE_TIMERS = new InjectionToken<CatalogTimers>('INFERENCE_TIMERS');

const SETTLEMENT_WAIT_MS = 5000;

/**
 * The replica's in-flight calls and their pending settlements. On stop it refuses new calls and gives the running ones the shutdown grace
 * period, then aborts what is left so the HTTP server's own close, which waits for every open response, cannot outlast the grace.
 */
@Injectable()
export class InflightRequests implements OnApplicationStop, OnModuleDestroy {
  private readonly logger = Logger.getLogger(APP_NAME, InflightRequests.name);
  private readonly requests = new Map<RequestAbort, () => void>();
  private readonly settlements = new Set<Promise<void>>();
  private grace: { cancel: () => void } | null = null;
  private draining = false;

  constructor(@Inject(INFERENCE_TIMERS) private readonly timers: CatalogTimers) {}

  get size(): number {
    return this.requests.size;
  }

  begin(): RequestAbort {
    if (this.draining) throw shuttingDown();
    const abort = new RequestAbort();
    const timeoutMs = Config.get('synapse.request.timeout-ms');
    if (timeoutMs > 0) {
      const timeout = this.timers.after(timeoutMs);
      void timeout.elapsed.then(() => abort.abort('timeout'));
      this.requests.set(abort, timeout.cancel);
    } else this.requests.set(abort, () => undefined);
    return abort;
  }

  /** Also aborts the request, so no upstream call outlives the answer whichever path ended it */
  end(abort: RequestAbort): void {
    this.requests.get(abort)?.();
    this.requests.delete(abort);
    abort.abort('finished');
  }

  /** Keeps the database open for a settlement that outlives its response, until shutdown has waited for it */
  track(settlement: Promise<void>): void {
    this.settlements.add(settlement);
    const forget = (): void => void this.settlements.delete(settlement);
    settlement.then(forget, forget);
  }

  onApplicationStop(): void {
    this.draining = true;
    if (this.requests.size === 0) return;
    const graceMs = Config.get('synapse.shutdown.grace-ms');
    this.logger.info('Draining in-flight calls before shutdown', { inflight: this.requests.size, graceMs });
    const grace = this.timers.after(graceMs);
    this.grace = grace;
    void grace.elapsed.then(() => this.abortAll());
  }

  async onModuleDestroy(): Promise<void> {
    this.grace?.cancel();
    this.abortAll();
    if (this.settlements.size === 0) return;
    const wait = this.timers.after(SETTLEMENT_WAIT_MS);
    await Promise.race([Promise.allSettled([...this.settlements]), wait.elapsed]);
    wait.cancel();
  }

  private abortAll(): void {
    if (this.requests.size > 0) this.logger.warn('Aborting calls still running at the end of the shutdown grace', { inflight: this.requests.size });
    for (const abort of this.requests.keys()) abort.abort('shutdown');
  }
}
