import { createContext, type ReactElement, type ReactNode, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Button, toISODate } from '@shadow-library/ui';

import { StatusPage } from '@/components/StatusPage';
import { accountKeys, type MemoirData, memoirKeys, memoirQueryClient, setFinanceProvider, setQuickLogProvider } from '@/lib/data';

import { type AccountMarker, MemoirStore, type UnloadBacking } from './memoir-store';
import { SyncEngine } from './sync-engine';
import { SyncedAccountProvider } from './synced-account-provider';
import { SyncedDataProvider } from './synced-provider';
import { SyncedFinanceProvider } from './synced-finance-provider';
import { SyncedHeroProvider } from './synced-hero-provider';
import { SyncedQuickLogProvider } from './synced-quick-log-provider';
import { SyncedReflectProvider } from './synced-reflect-provider';
import { type SyncSnapshot } from './sync.types';

const OFFLINE_SNAPSHOT: SyncSnapshot = {
  state: 'offline',
  queuedCount: 0,
  lastSyncedAt: null,
  notices: [],
  initError: null,
  readiness: { kind: 'ready' },
  readySince: 0,
  readyWorldAt: 0,
  sending: [],
};

/** `state` stays `online` so NetStrip paints nothing rather than an "Offline…" strip no client has confirmed. */
const SERVER_SNAPSHOT: SyncSnapshot = { ...OFFLINE_SNAPSHOT, state: 'online', readiness: { kind: 'loading' } };

const LAST_ACCOUNT_KEY = 'shadow-memoir:last-account';

const LAST_ACCOUNT_MARKER: AccountMarker = {
  read: () => {
    try {
      return localStorage.getItem(LAST_ACCOUNT_KEY);
    } catch {
      return null;
    }
  },
  write: accountId => {
    try {
      localStorage.setItem(LAST_ACCOUNT_KEY, accountId);
    } catch {
      return;
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(LAST_ACCOUNT_KEY);
    } catch {
      return;
    }
  },
};

const LOCAL_UNLOAD_BACKING: UnloadBacking = {
  get: key => localStorage.getItem(key),
  set: (key, value) => localStorage.setItem(key, value),
  remove: key => localStorage.removeItem(key),
  keys: () => Object.keys(localStorage),
};

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
    () => SERVER_SNAPSHOT,
  );
}

export interface SyncedMemoirData extends MemoirData {
  engine: SyncEngine;
}

export interface SyncedMemoirOptions {
  /** The session's subject. The data is built for exactly one account: a different account gets a new one, never this one reused. */
  accountId: string;
  principal?: () => Promise<string>;
  onAccountChanged?: () => void;
  today?: string;
}

/**
 * The synced counterpart of `createMemoirData`. Quests, finance, quick logs and the hero deck read through
 * IndexedDB and write through the outbox; account and coaching read and write over HTTP, because neither is
 * something an offline owner can be told succeeded. What is left on a fixture provider is history, insights
 * and the weekly review — the server exposes no read model for any of the three.
 */
export function createSyncedMemoirData(options: SyncedMemoirOptions): SyncedMemoirData {
  const today = options.today ?? toISODate(new Date());
  const store = new MemoirStore(undefined, { accountId: options.accountId, marker: LAST_ACCOUNT_MARKER, unload: LOCAL_UNLOAD_BACKING });
  const engine = new SyncEngine({ store, today, principal: options.principal, onAccountChanged: options.onAccountChanged });
  const account = new SyncedAccountProvider(engine, options.principal);
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
    persona: 'active',
  };
}

export interface SyncProviderProps {
  data: SyncedMemoirData;
  children: ReactNode;
}

/**
 * Starts the engine on mount and runs a pass whenever the browser's connectivity changes: regaining it
 * flushes, losing it marks the engine offline so the strip can say so with the queued count. Both are
 * idempotent: `sync()` serializes overlapping passes. Unmounting — or being handed another account's data —
 * stops the engine before the next one opens the store.
 */
export function SyncEngineProvider({ data, children }: SyncProviderProps): ReactElement {
  const { engine, queryClient } = data;

  useEffect(() => {
    void engine.start();
    const unsubscribeWorld = engine.subscribeWorld(() => {
      // Invalidation joins an in-flight first fetch rather than restarting it, so its answer from the replaced rows would land after the publish and be trusted.
      void queryClient.cancelQueries({ queryKey: memoirKeys.all });
      void queryClient.invalidateQueries({ queryKey: memoirKeys.all });
    });
    let shown = engine.getSnapshot();
    const unsubscribeState = engine.subscribe(() => {
      const next = engine.getSnapshot();
      const changed =
        next.state !== shown.state || next.queuedCount !== shown.queuedCount || next.lastSyncedAt !== shown.lastSyncedAt || next.sending.join() !== shown.sending.join();
      shown = next;
      if (changed) void queryClient.invalidateQueries({ queryKey: accountKeys.appSync });
    });
    const onConnectivity = (): void => void engine.sync();
    window.addEventListener('online', onConnectivity);
    window.addEventListener('offline', onConnectivity);
    return () => {
      engine.stop();
      unsubscribeWorld();
      unsubscribeState();
      window.removeEventListener('online', onConnectivity);
      window.removeEventListener('offline', onConnectivity);
    };
  }, [engine, queryClient]);

  const value = useMemo(() => engine, [engine]);
  return (
    <SyncEngineContext.Provider value={value}>
      <StoreGate>{children}</StoreGate>
    </SyncEngineContext.Provider>
  );
}

const STORE_UNAVAILABLE =
  "Shadow Memoir keeps your day on this device and syncs it afterwards, so it can't show anything until the store opens. " +
  "Private windows and blocked site storage can stop it. Nothing you've logged is lost.";

/** An unopenable mirror is not an empty account: the app has nothing to render and must say so rather than show a day that looks merely new. */
function StoreGate({ children }: { children: ReactNode }): ReactElement {
  const engine = useSyncEngine();
  const { initError } = useSyncStatus();
  const [retrying, setRetrying] = useState(false);
  if (!initError) return <>{children}</>;

  const retry = (): void => {
    if (retrying || !engine) return;
    setRetrying(true);
    // Stopping releases a failed IndexedDB open, which the offline store would otherwise hand back to every retry.
    engine.stop();
    void engine.start().finally(() => setRetrying(false));
  };

  return (
    <StatusPage
      title="This device couldn't open its local store"
      description={STORE_UNAVAILABLE}
      pending={retrying}
      actions={
        <>
          <Button variant="primary" loading={retrying} loadingText="Trying again…" onClick={retry}>
            Try again
          </Button>
          <Button variant="secondary" disabled={retrying} onClick={() => window.location.reload()}>
            Reload
          </Button>
        </>
      }
    />
  );
}
