import { type InvalidateQueryFilters, type QueryClient } from '@tanstack/react-query';

// One turn's events and its own request settling all land within a few milliseconds; this gathers them into one
// refetch while still reading as immediate.
const BATCH_WINDOW_MS = 150;

interface PendingBatch {
  filters: Map<string, InvalidateQueryFilters>;
  timer: ReturnType<typeof setTimeout>;
}

const batches = new WeakMap<QueryClient, PendingBatch>();

/**
 * Invalidates once the batch window closes, collapsing repeats of the same filter into one refetch. Every source
 * refetches through here because `invalidateQueries` restarts a refetch already in flight rather than joining it.
 * A predicate is told apart by its function name, so pass a named function, never an inline arrow.
 */
export function invalidateSoon(queryClient: QueryClient, filters: InvalidateQueryFilters): void {
  let batch = batches.get(queryClient);
  if (!batch) {
    batch = { filters: new Map(), timer: setTimeout(() => flushInvalidations(queryClient), BATCH_WINDOW_MS) };
    batches.set(queryClient, batch);
  }
  batch.filters.set(JSON.stringify([filters.queryKey, filters.exact, filters.predicate?.name]), filters);
}

/** Runs the pending batch now, for a caller that is about to read the data it would refetch. */
export function flushInvalidations(queryClient: QueryClient): void {
  const batch = batches.get(queryClient);
  if (!batch) return;
  batches.delete(queryClient);
  clearTimeout(batch.timer);
  for (const filters of batch.filters.values()) queryClient.invalidateQueries(filters);
}
