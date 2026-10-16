import { Inject, Injectable, InjectionToken, type OnApplicationReady, type OnApplicationStop, type OnModuleInit } from '@shadow-library/app';
import { Config, Logger, utils } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { checkCatalogDocument } from './catalog-validator';
import { type ActiveCatalog } from './catalog.types';
import { CatalogVersionRepository } from './catalog-version.repository';

export interface CatalogTimers {
  /** Returns the function that stops the ticks */
  every(intervalMs: number, tick: () => void): () => void;
  after(delayMs: number): { elapsed: Promise<void>; cancel: () => void };
}

export const CATALOG_TIMERS = new InjectionToken<CatalogTimers>('CATALOG_TIMERS');

export const SYSTEM_TIMERS: CatalogTimers = {
  every: (intervalMs, tick) => {
    const timer = setInterval(tick, intervalMs);
    timer.unref?.();
    return () => clearInterval(timer);
  },
  after: delayMs => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const elapsed = new Promise<void>(resolve => {
      timer = setTimeout(resolve, delayMs);
      timer.unref?.();
    });
    return { elapsed, cancel: () => clearTimeout(timer) };
  },
};

const LOGGED_ISSUES = 20;
const STOP_GRACE_MS = 5000;

/**
 * The replica's copy of the published catalog: loaded at boot, then re-read whenever the highest published version moves.
 * A version that fails to parse or validate is never served; the previous one stays, and the rejected version is not fetched again.
 */
@Injectable()
export class ActiveCatalogCache implements OnModuleInit, OnApplicationReady, OnApplicationStop {
  private readonly logger = Logger.getLogger(APP_NAME, ActiveCatalogCache.name);
  private snapshot: ActiveCatalog | null = null;
  private rejectedVersion: number | null = null;
  private inFlight: Promise<void> | null = null;
  private queued: Promise<void> | null = null;
  private stopPolling: (() => void) | null = null;
  private stopped = false;

  constructor(
    private readonly repository: CatalogVersionRepository,
    @Inject(CATALOG_TIMERS) private readonly timers: CatalogTimers,
  ) {}

  current(): ActiveCatalog | null {
    return this.snapshot;
  }

  requireCurrent(): ActiveCatalog {
    return this.snapshot ?? AppErrorCode.SYN_NO_ACTIVE_CATALOG.throw();
  }

  /** A boot without a readable catalog still starts, answering `SYN_NO_ACTIVE_CATALOG` until a poll succeeds. */
  async onModuleInit(): Promise<void> {
    await this.refreshNow();
  }

  onApplicationReady(): void {
    this.stopPolling = this.timers.every(Config.get('synapse.catalog.poll-ms'), () => void this.refreshNow());
  }

  /** A reload stuck on the database must not hold shutdown past the grace period. */
  async onApplicationStop(): Promise<void> {
    this.stopped = true;
    this.stopPolling?.();
    this.stopPolling = null;
    const pending = this.queued ?? this.inFlight;
    if (!pending) return;

    const grace = this.timers.after(STOP_GRACE_MS);
    const outcome = await Promise.race([pending.then(() => 'settled' as const), grace.elapsed.then(() => 'timed_out' as const)]);
    grace.cancel();
    if (outcome === 'timed_out') this.logger.warn('Stopped without waiting further for a catalog reload', { waitedMs: STOP_GRACE_MS });
  }

  /**
   * Never rejects. A call made while a reload runs queues exactly one more, because the running one may have read the version before a publish
   * committed: that is what lets the publishing replica see its own publish immediately.
   */
  refreshNow(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (!this.inFlight) {
      this.inFlight = this.reload().finally(() => (this.inFlight = null));
      return this.inFlight;
    }
    this.queued ??= this.inFlight.then(() => {
      this.queued = null;
      return this.refreshNow();
    });
    return this.queued;
  }

  private async reload(): Promise<void> {
    try {
      const version = await this.repository.activeVersion();
      if (version === null || version === this.snapshot?.version || version === this.rejectedVersion) return;
      const row = await this.repository.findVersion(version);
      if (!row) return;

      const check = checkCatalogDocument(row.document, null);
      if (!check.valid) {
        this.rejectedVersion = version;
        const issues = check.issues.slice(0, LOGGED_ISSUES);
        this.logger.error('Rejected the published catalog; keeping the previous version', {
          version,
          keptVersion: this.snapshot?.version ?? null,
          issueCount: check.issues.length,
          issues,
        });
        return;
      }

      const previous = this.snapshot?.version ?? null;
      this.snapshot = utils.object.deepFreeze({ version, document: check.document });
      this.rejectedVersion = null;
      this.logger.info('Loaded the published catalog', { version, previous });
    } catch (error) {
      this.logger.error('Failed to refresh the published catalog', { keptVersion: this.snapshot?.version ?? null, error });
    }
  }
}
