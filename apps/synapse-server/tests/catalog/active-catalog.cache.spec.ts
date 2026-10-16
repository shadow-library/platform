import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { AppError } from '@shadow-library/common';
import { type RestoreConfig, type RestoreLogger, setConfig, silenceLogger } from '@shadow-library/common/testing';

import { AppErrorCode } from '@server/classes';

import { ActiveCatalogCache, type CatalogTimers } from '@modules/catalog/active-catalog.cache';

import { catalogDocument } from './catalog.fixtures';
import { FakeCatalogVersionRepository } from './fake-catalog-version.repository';

interface Ticker {
  intervalMs: number;
  tick: () => void;
  stopped: boolean;
}

interface Delay {
  delayMs: number;
  fire: () => void;
  cancelled: boolean;
}

class FakeTimers implements CatalogTimers {
  readonly tickers: Ticker[] = [];
  readonly delays: Delay[] = [];

  every(intervalMs: number, tick: () => void): () => void {
    const ticker = { intervalMs, tick, stopped: false };
    this.tickers.push(ticker);
    return () => (ticker.stopped = true);
  }

  after(delayMs: number): { elapsed: Promise<void>; cancel: () => void } {
    let fire = (): void => undefined;
    const elapsed = new Promise<void>(resolve => (fire = resolve));
    const delay = { delayMs, fire, cancelled: false };
    this.delays.push(delay);
    return { elapsed, cancel: () => (delay.cancelled = true) };
  }
}

let restoreLogger: RestoreLogger;
let restoreConfig: RestoreConfig;
let timers: FakeTimers;
let repository: FakeCatalogVersionRepository;
let documentReads: number;
let cache: ActiveCatalogCache;

beforeAll(() => {
  restoreLogger = silenceLogger();
  restoreConfig = setConfig({ 'synapse.catalog.poll-ms': 5000 });
});
afterAll(() => {
  restoreConfig();
  restoreLogger();
});

beforeEach(() => {
  repository = new FakeCatalogVersionRepository();
  documentReads = 0;
  const findVersion = repository.findVersion.bind(repository);
  repository.findVersion = version => {
    documentReads++;
    return findVersion(version);
  };
  timers = new FakeTimers();
  cache = new ActiveCatalogCache(repository.asRepository(), timers);
});

function publish(document: unknown, version: number): void {
  for (const row of repository.rows) if (row.state === 'PUBLISHED') row.state = 'ARCHIVED';
  repository.seed(document, version);
}

describe('ActiveCatalogCache', () => {
  it('should hold nothing while no version is published', async () => {
    await cache.refreshNow();
    expect(cache.current()).toBeNull();
    const error = (() => {
      try {
        return cache.requireCurrent();
      } catch (reason) {
        return reason;
      }
    })();
    expect(AppError.is(error, AppErrorCode.SYN_NO_ACTIVE_CATALOG)).toBe(true);
  });

  it('should load the highest published version at boot', async () => {
    publish(catalogDocument(), 1);
    publish(
      catalogDocument(draft => (draft.aliases.opus!.label = 'Opus Max')),
      2,
    );
    await cache.onModuleInit();
    expect(cache.current()?.version).toBe(2);
    expect(cache.requireCurrent().document.aliases.opus?.label).toBe('Opus Max');
  });

  it('should not re-read the document while the published version stays the same', async () => {
    publish(catalogDocument(), 1);
    await cache.refreshNow();
    await cache.refreshNow();
    expect(documentReads).toBe(1);
  });

  it('should freeze the served document so no caller can change it for the others', async () => {
    publish(catalogDocument(), 1);
    await cache.refreshNow();
    expect(Object.isFrozen(cache.current()?.document.tasks['novel-forge.chat']?.routes[0])).toBe(true);
  });

  it('should keep the previous document when a new version fails validation, and not fetch that version again', async () => {
    publish(catalogDocument(), 1);
    await cache.refreshNow();
    publish(
      catalogDocument(draft => (draft.tasks['memoir.insight']!.routes = [])),
      2,
    );

    await cache.refreshNow();
    await cache.refreshNow();

    expect(cache.current()?.version).toBe(1);
    expect(documentReads).toBe(2);
  });

  it('should keep the previous document when a new version does not parse', async () => {
    publish(catalogDocument(), 1);
    await cache.refreshNow();
    publish({ providers: {} }, 2);
    await cache.refreshNow();
    expect(cache.current()?.version).toBe(1);
  });

  it('should move on to a valid version published after a rejected one', async () => {
    publish(catalogDocument(), 1);
    await cache.refreshNow();
    publish({ providers: {} }, 2);
    await cache.refreshNow();
    publish(catalogDocument(), 3);
    await cache.refreshNow();
    expect(cache.current()?.version).toBe(3);
  });

  it('should keep the previous document and resolve when the database fails', async () => {
    publish(catalogDocument(), 1);
    await cache.refreshNow();
    repository.activeVersion = async () => {
      throw new TypeError('connection reset');
    };
    expect(await cache.refreshNow()).toBeUndefined();
    expect(cache.current()?.version).toBe(1);
  });

  it('should judge a reload on the document alone, since this replica may have skipped the versions in between', async () => {
    publish(catalogDocument(), 1);
    await cache.refreshNow();
    publish(
      catalogDocument(draft => (draft.models['qwen3-embedding']!.capabilities.embedding = { dimensions: 768 })),
      2,
    );
    await cache.refreshNow();
    expect(cache.current()?.version).toBe(2);
  });

  it('should reload once more when asked during a reload, so a publish that commits meanwhile is seen', async () => {
    publish(catalogDocument(), 1);
    let release = (): void => undefined;
    const activeVersion = repository.activeVersion.bind(repository);
    const gate = new Promise<void>(resolve => (release = resolve));
    repository.activeVersion = async () => {
      const version = await activeVersion();
      await gate;
      return version;
    };

    const running = cache.refreshNow();
    publish(catalogDocument(), 2);
    const queued = cache.refreshNow();
    const coalesced = cache.refreshNow();
    release();
    await Promise.all([running, queued, coalesced]);

    expect(queued).toBe(coalesced);
    expect(cache.current()?.version).toBe(2);
  });

  describe('lifecycle', () => {
    it('should poll at the configured interval once the application is ready, and stop polling when it stops', async () => {
      cache.onApplicationReady();
      expect(timers.tickers.map(ticker => ticker.intervalMs)).toEqual([5000]);

      publish(catalogDocument(), 1);
      timers.tickers[0]!.tick();
      await cache.onApplicationStop();

      expect(cache.current()?.version).toBe(1);
      expect(timers.tickers[0]!.stopped).toBe(true);
    });

    it('should stop at once when no reload is running', async () => {
      await cache.onApplicationStop();
      expect(timers.delays).toHaveLength(0);
    });

    it('should cancel the grace timer when the running reload settles first', async () => {
      publish(catalogDocument(), 1);
      void cache.refreshNow();
      await cache.onApplicationStop();
      expect(timers.delays.map(delay => ({ delayMs: delay.delayMs, cancelled: delay.cancelled }))).toEqual([{ delayMs: 5000, cancelled: true }]);
    });

    it('should give up on a reload stuck past the grace period instead of hanging shutdown', async () => {
      repository.activeVersion = () => new Promise<number | null>(() => undefined);
      void cache.refreshNow();
      const stopping = cache.onApplicationStop();
      await Promise.resolve();
      timers.delays[0]!.fire();
      expect(await stopping).toBeUndefined();
    });

    it('should not start a reload after the application stopped', async () => {
      let reads = 0;
      repository.activeVersion = async () => {
        reads++;
        return null;
      };
      await cache.onApplicationStop();
      await cache.refreshNow();
      expect(reads).toBe(0);
    });
  });
});
