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
  /** Set while `data` is the previous key's result standing in for this one (`placeholderData: keepPreviousData`). */
  isPlaceholderData?: boolean;
}

export interface DataReadinessOptions<T> {
  query?: DataQuery<T>;
  source?: DataSource;
  isEmpty?: (data: T) => boolean;
}

export interface ReadinessContext {
  sync: SyncReadiness;
  readyWorldAt: number;
  online: boolean;
  /** The caller has already shown this data in the current ready epoch, so a refetch must never take it back to loading. */
  shown?: boolean;
}

export interface DataReadinessResult {
  readiness: DataReadiness;
  /** Refetches a failed query, otherwise runs a sync pass; the failure stays in `readiness` until the attempt settles. */
  retry: () => void;
  retrying: boolean;
}

type FailedReadiness = Extract<DataReadiness, { kind: 'failed' }>;

interface ShownLatch {
  readySince: number;
  /** The `dataUpdatedAt` of revealed data older than `readyWorldAt`; `null` when everything revealed was newer. */
  predatesWorldAt: number | null;
}

const LOADING: DataReadiness = { kind: 'loading' };
const EMPTY: DataReadiness = { kind: 'empty' };
const READY: DataReadiness = { kind: 'ready' };

export function useSyncReadiness(): SyncReadiness {
  return useSyncStatus().readiness;
}

export function resolveDataReadiness<T>(
  { sync, readyWorldAt, online, shown = false }: ReadinessContext,
  { query, source = 'mirror', isEmpty }: DataReadinessOptions<T>,
): DataReadiness {
  if (source === 'mirror' && sync.kind !== 'ready') return sync;
  if (!query) return READY;
  if (query.data === undefined) return query.isError ? { kind: 'failed', reason: toSyncFailureReason(query.error, online) } : LOADING;
  // A fetch that lands in the publish's own millisecond is almost always the refetch it started, so only strictly older data is suspect.
  if (source === 'mirror' && !shown && query.isFetching && query.dataUpdatedAt < readyWorldAt) return LOADING;
  return isEmpty?.(query.data) ? EMPTY : READY;
}

/** A TanStack result re-renders its owner only for the fields some render has read, so every field the rules might skip is read up front. */
function observe<T>({ data, isError, isFetching, dataUpdatedAt, error, refetch, isPlaceholderData }: DataQuery<T>): DataQuery<T> {
  return { data, isError, isFetching, dataUpdatedAt, error, refetch, isPlaceholderData };
}

export function useDataReadiness<T>(options: DataReadinessOptions<T> = {}): DataReadinessResult {
  const engine = useSyncEngine();
  const { readiness: sync, readySince, readyWorldAt } = useSyncStatus();
  const [retryingFrom, setRetryingFrom] = useState<FailedReadiness | null>(null);
  const [latch, setLatch] = useState<ShownLatch | null>(null);
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  const { source = 'mirror' } = options;
  const query = options.query && observe(options.query);
  const predatesWorldAt = query && !query.isPlaceholderData && query.dataUpdatedAt < readyWorldAt ? query.dataUpdatedAt : null;
  const shown = sync.kind === 'ready' && latch?.readySince === readySince && (predatesWorldAt === null || latch.predatesWorldAt === predatesWorldAt);
  const resolved = resolveDataReadiness({ sync, readyWorldAt, online, shown }, { ...options, query });
  if (!shown && sync.kind === 'ready' && (resolved.kind === 'ready' || resolved.kind === 'empty')) setLatch({ readySince, predatesWorldAt });

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
