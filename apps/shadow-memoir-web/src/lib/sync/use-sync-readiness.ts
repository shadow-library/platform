import { useState } from 'react';

import { toSyncFailureReason } from './sync-client';
import { useSyncEngine, useSyncStatus } from './sync-context';
import { type SyncReadiness } from './sync.types';

export type DataReadiness = SyncReadiness | { kind: 'empty' };

/** `mirror` data is only trustworthy once the first pull lands; `server` data is fetched over HTTP, so its query alone decides. */
export type DataSource = 'mirror' | 'server';

/** The slice of a TanStack `UseQueryResult` readiness needs; any `UseQueryResult<T>` fits. */
export interface DataQuery<T> {
  data: T | undefined;
  isError: boolean;
  isFetching: boolean;
  dataUpdatedAt: number;
  error: unknown;
  refetch: () => Promise<unknown>;
}

export interface DataReadinessOptions<T> {
  query?: DataQuery<T>;
  source?: DataSource;
  isEmpty?: (data: T) => boolean;
}

export interface ReadinessContext {
  sync: SyncReadiness;
  readySince: number;
  online: boolean;
}

export interface DataReadinessResult {
  readiness: DataReadiness;
  /** Refetches a failed query, otherwise runs a sync pass; the failure stays in `readiness` until the attempt settles. */
  retry: () => void;
  retrying: boolean;
}

type FailedReadiness = Extract<DataReadiness, { kind: 'failed' }>;

const LOADING: DataReadiness = { kind: 'loading' };
const EMPTY: DataReadiness = { kind: 'empty' };
const READY: DataReadiness = { kind: 'ready' };

export function useSyncReadiness(): SyncReadiness {
  return useSyncStatus().readiness;
}

export function resolveDataReadiness<T>({ sync, readySince, online }: ReadinessContext, { query, source = 'mirror', isEmpty }: DataReadinessOptions<T>): DataReadiness {
  if (source === 'mirror' && sync.kind !== 'ready') return sync;
  if (!query) return READY;
  if (query.data === undefined) return query.isError ? { kind: 'failed', reason: toSyncFailureReason(query.error, online) } : LOADING;
  // The pull's invalidation starts this refetch before `ready` lands, so until it settles the data is the empty mirror's answer.
  if (source === 'mirror' && query.isFetching && query.dataUpdatedAt <= readySince) return LOADING;
  return isEmpty?.(query.data) ? EMPTY : READY;
}

export function useDataReadiness<T>(options: DataReadinessOptions<T> = {}): DataReadinessResult {
  const engine = useSyncEngine();
  const { readiness: sync, readySince } = useSyncStatus();
  const [retryingFrom, setRetryingFrom] = useState<FailedReadiness | null>(null);
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  const resolved = resolveDataReadiness({ sync, readySince, online }, options);
  const { query, source = 'mirror' } = options;

  const retry = (): void => {
    if (resolved.kind !== 'failed' || retryingFrom) return;
    setRetryingFrom(resolved);
    const waitingOnSync = source === 'mirror' && sync.kind !== 'ready';
    const attempt = !waitingOnSync && query ? query.refetch() : (engine?.sync() ?? Promise.resolve());
    void attempt.finally(() => setRetryingFrom(null));
  };

  const readiness = retryingFrom && (resolved.kind === 'loading' || resolved.kind === 'failed') ? retryingFrom : resolved;
  return { readiness, retry, retrying: retryingFrom !== null };
}
