import { QueryClient } from '@tanstack/react-query';
import { createContext, type ReactElement, type ReactNode, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { toISODate } from '@shadow-library/ui';

import { createAccountProvider, createHeroProvider, createReflectProvider, type MemoirData, memoirKeys, seedWorldState } from '@/lib/data';

import { MemoirStore } from './memoir-store';
import { SyncEngine } from './sync-engine';
import { SyncedDataProvider } from './synced-provider';
import { type SyncSnapshot } from './sync.types';

const OFFLINE_SNAPSHOT: SyncSnapshot = { state: 'offline', queuedCount: 0, lastSyncedAt: null, notices: [] };

const SyncEngineContext = createContext<SyncEngine | null>(null);

export function useSyncEngine(): SyncEngine | null {
  return useContext(SyncEngineContext);
}

/**
 * The shell's net strip, the settings queue and any screen that needs to say "queued" all read this one
 * snapshot. It returns the offline default when no engine is mounted, so a fixture-backed test or a story
 * renders the same components without a sync layer behind them.
 */
export function useSyncStatus(): SyncSnapshot {
  const engine = useSyncEngine();
  return useSyncExternalStore(
    listener => engine?.subscribe(listener) ?? (() => undefined),
    () => engine?.getSnapshot() ?? OFFLINE_SNAPSHOT,
    () => OFFLINE_SNAPSHOT,
  );
}

export interface SyncedMemoirData extends MemoirData {
  engine: SyncEngine;
}

/**
 * The synced counterpart of `createMemoirData`: the quest domain reads through IndexedDB and writes
 * through the outbox, while hero, reflect and account stay on their fixture providers until the server
 * grows a module for each. The seam is `MemoirData`, so a domain flips by swapping one field.
 */
export function createSyncedMemoirData(options: { today?: string; store?: MemoirStore } = {}): SyncedMemoirData {
  const today = options.today ?? toISODate(new Date());
  const currency = 'EUR';
  const engine = new SyncEngine({ store: options.store ?? new MemoirStore(), today });

  return {
    engine,
    provider: new SyncedDataProvider(engine),
    hero: createHeroProvider({ persona: 'active', hero: seedWorldState({ today }).hero }),
    reflect: createReflectProvider({ today, persona: 'active' }),
    account: createAccountProvider({ persona: 'active', currency }),
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } }),
    today,
    currency,
    persona: 'active',
  };
}

export interface SyncProviderProps {
  data: SyncedMemoirData;
  children: ReactNode;
}

/**
 * Starts the engine on mount and flushes again whenever the browser reports it is back online. Both are
 * idempotent: `sync()` serializes overlapping passes, so a regain event during a running pass is a no-op
 * rather than a second batch on the wire.
 */
export function SyncEngineProvider({ data, children }: SyncProviderProps): ReactElement {
  const { engine, queryClient } = data;

  useEffect(() => {
    void engine.start();
    const unsubscribe = engine.subscribeWorld(() => void queryClient.invalidateQueries({ queryKey: memoirKeys.all }));
    const onOnline = (): void => void engine.sync();
    window.addEventListener('online', onOnline);
    return () => {
      unsubscribe();
      window.removeEventListener('online', onOnline);
    };
  }, [engine, queryClient]);

  const value = useMemo(() => engine, [engine]);
  return <SyncEngineContext.Provider value={value}>{children}</SyncEngineContext.Provider>;
}
