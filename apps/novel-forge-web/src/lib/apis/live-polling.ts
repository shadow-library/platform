import { type PollingOptions } from './transport';

// With a project's event stream connected, changes arrive as events and a poll only covers one the stream dropped.
const SAFETY_NET_MS = 30_000;

// Module state, not the query cache: an entry no query observes is garbage-collected after gcTime, which would put
// every poll back on its fast interval while the stream is still open.
const liveProjects = new Set<string>();

export function setEventStreamLive(projectId: string, live: boolean): void {
  if (live) liveProjects.add(projectId);
  else liveProjects.delete(projectId);
}

/** Slows a poll to a safety net while the project's event stream is live, and still stops it wherever the poll itself would. */
export function livePolling<TData>(projectId: string, refetchInterval: PollingOptions<TData>['refetchInterval']): PollingOptions<TData>['refetchInterval'] {
  if (refetchInterval === undefined) return undefined;
  return query => {
    const interval = typeof refetchInterval === 'function' ? refetchInterval(query) : refetchInterval;
    if (interval === false || !liveProjects.has(projectId)) return interval;
    return Math.max(interval, SAFETY_NET_MS);
  };
}
