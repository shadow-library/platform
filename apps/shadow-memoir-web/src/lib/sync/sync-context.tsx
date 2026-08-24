import { createContext, type ReactElement, type ReactNode, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { Alert, Button, toISODate } from '@shadow-library/ui';

import { type MemoirData, memoirKeys, memoirQueryClient, setFinanceProvider, setQuickLogProvider } from '@/lib/data';

import { MemoirStore } from './memoir-store';
import { SyncEngine } from './sync-engine';
import { SyncedAccountProvider } from './synced-account-provider';
import { SyncedDataProvider } from './synced-provider';
import { SyncedFinanceProvider } from './synced-finance-provider';
import { SyncedHeroProvider } from './synced-hero-provider';
import { SyncedQuickLogProvider } from './synced-quick-log-provider';
import { SyncedReflectProvider } from './synced-reflect-provider';
import { type SyncSnapshot } from './sync.types';

const OFFLINE_SNAPSHOT: SyncSnapshot = { state: 'offline', queuedCount: 0, lastSyncedAt: null, notices: [], initError: null };

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
 * The synced counterpart of `createMemoirData`. Quests, finance, quick logs and the hero deck read through
 * IndexedDB and write through the outbox; account and coaching read and write over HTTP, because neither is
 * something an offline owner can be told succeeded. What is left on a fixture provider is history, insights
 * and the weekly review — the server exposes no read model for any of the three.
 */
export function createSyncedMemoirData(options: { today?: string; store?: MemoirStore } = {}): SyncedMemoirData {
  const today = options.today ?? toISODate(new Date());
  const currency = 'EUR';
  const engine = new SyncEngine({ store: options.store ?? new MemoirStore(), today });
  const account = new SyncedAccountProvider(engine);
  const finance = new SyncedFinanceProvider(engine);
  const quickLogs = new SyncedQuickLogProvider(engine);
  setFinanceProvider(finance);
  setQuickLogProvider(quickLogs);

  return {
    engine,
    provider: new SyncedDataProvider(engine),
    hero: new SyncedHeroProvider(engine, account),
    reflect: new SyncedReflectProvider(engine),
    account,
    finance,
    quickLogs,
    queryClient: memoirQueryClient(),
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
  return (
    <SyncEngineContext.Provider value={value}>
      <StoreGate>{children}</StoreGate>
    </SyncEngineContext.Provider>
  );
}

/** An unopenable mirror is not an empty account: the app has nothing to render and must say so rather than show a day that looks merely new. */
function StoreGate({ children }: { children: ReactNode }): ReactElement {
  const engine = useSyncEngine();
  const { initError } = useSyncStatus();
  if (!initError) return <>{children}</>;

  return (
    <div className="flex items-center justify-center" style={{ minHeight: '100dvh', padding: '1.5rem' }}>
      <Alert intent="danger" title="This device could not open its local store">
        <p>Shadow Memoir keeps your day on the device and syncs it afterwards, so it cannot show anything until the store opens. Nothing you have logged is lost.</p>
        <p>{initError}</p>
        <Button variant="primary" onClick={() => void engine?.start()}>
          Try again
        </Button>
      </Alert>
    </div>
  );
}
