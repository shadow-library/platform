import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { invalidateSeed } from './ideation.api';
import { invalidateJobs } from './insight.api';
import { setEventStreamLive } from './live-polling';
import { invalidateChat, invalidateChatSession, invalidateChatSessions } from './refinement.api';
import { invalidateRuns } from './run.api';
import { APIRequest } from './transport';

/**
 * Mirrors novel-forge-server's `ProjectEvent`; server-sent events sit outside the OpenAPI contract, so this is not generated.
 * An event only says what to refetch — the refetch, not the event, is what the screen renders.
 */
export type ProjectEvent =
  | { type: 'run'; runId: string; graph: string; target: string; status: string }
  | { type: 'job'; jobId: string; kind: string; status: string }
  | { type: 'chat'; sessionId: string };

const PROJECT_EVENT_TYPES = ['run', 'job', 'chat'] as const;
const SESSION_TARGET_PREFIX = 'session:';
const SEED_TARGET_PREFIX = 'seed:';
const IDEATION_GRAPH_PREFIX = 'ideation-';
// The stream ends itself every 15 minutes and reconnects within its 3-second retry; only an outage longer than this
// hands changes back to polling at full speed.
const OUTAGE_AFTER_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 60_000;

export function parseProjectEvent(data: unknown): ProjectEvent | undefined {
  if (typeof data !== 'string') return undefined;
  try {
    const event: unknown = JSON.parse(data);
    const type = (event as { type?: unknown } | null)?.type;
    return PROJECT_EVENT_TYPES.includes(type as ProjectEvent['type']) ? (event as ProjectEvent) : undefined;
  } catch {
    return undefined;
  }
}

export function applyProjectEvent(queryClient: QueryClient, projectId: string, event: ProjectEvent): void {
  if (event.type === 'job') return invalidateJobs(queryClient, projectId);
  if (event.type === 'chat') return invalidateChatSession(queryClient, projectId, event.sessionId);

  invalidateRuns(queryClient, projectId);
  if (event.target.startsWith(SEED_TARGET_PREFIX) && event.graph.startsWith(IDEATION_GRAPH_PREFIX)) return invalidateSeed(queryClient, projectId);
  if (!event.target.startsWith(SESSION_TARGET_PREFIX)) return;
  const sessionId = event.target.slice(SESSION_TARGET_PREFIX.length);
  if (event.status === 'running') return invalidateChatSession(queryClient, projectId, sessionId);
  invalidateChat(queryClient, projectId, sessionId);
  if (event.graph.startsWith(IDEATION_GRAPH_PREFIX)) invalidateSeed(queryClient, projectId);
}

/** Whatever a disconnected tab may have missed: everything the stream would otherwise have told it to refetch. */
function resynchronise(queryClient: QueryClient, projectId: string): void {
  invalidateJobs(queryClient, projectId);
  invalidateRuns(queryClient, projectId);
  invalidateChatSessions(queryClient, projectId);
  invalidateSeed(queryClient, projectId);
}

/**
 * Holds one event stream open for a project while the calling screen is mounted, and marks it live so polls on that
 * project drop to a safety net. Mount it once per project screen: every mount opens its own connection.
 */
export function useProjectEventStream(projectId: string): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectId || typeof EventSource === 'undefined') return;
    let source: EventSource | undefined;
    let outage: ReturnType<typeof setTimeout> | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const connect = (): void => {
      source = new EventSource(`${APIRequest.basePath}/projects/${projectId}/events`);
      source.addEventListener('ready', () => {
        failures = 0;
        clearTimeout(outage);
        outage = undefined;
        setEventStreamLive(projectId, true);
        resynchronise(queryClient, projectId);
      });
      for (const type of PROJECT_EVENT_TYPES) {
        source.addEventListener(type, message => {
          const event = parseProjectEvent(message.data);
          if (event) applyProjectEvent(queryClient, projectId, event);
        });
      }
      source.onerror = () => {
        outage ??= setTimeout(() => {
          setEventStreamLive(projectId, false);
          resynchronise(queryClient, projectId);
        }, OUTAGE_AFTER_MS);
        // EventSource reconnects a dropped stream by itself; an HTTP error (an expired session, a deleted project)
        // leaves it closed for good, so that case retries here with backoff.
        if (source?.readyState !== EventSource.CLOSED) return;
        source.close();
        reconnect = setTimeout(connect, Math.min(MAX_RECONNECT_DELAY_MS, 2_000 * 2 ** failures++));
      };
    };

    connect();
    return () => {
      clearTimeout(outage);
      clearTimeout(reconnect);
      source?.close();
      setEventStreamLive(projectId, false);
    };
  }, [projectId, queryClient]);
}
