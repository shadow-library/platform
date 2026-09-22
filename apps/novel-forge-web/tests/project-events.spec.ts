import { beforeEach, describe, expect, it } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { flushInvalidations } from '../src/lib/apis/batched-invalidation';
import { applyProjectEvent, parseProjectEvent } from '../src/lib/apis/events.api';
import { livePolling, setEventStreamLive } from '../src/lib/apis/live-polling';

describe('parseProjectEvent', () => {
  it('should accept a known event', () => {
    expect(parseProjectEvent('{"type":"chat","sessionId":"s1"}')).toEqual({ type: 'chat', sessionId: 's1' });
  });

  it('should ignore an event type it does not know', () => {
    expect(parseProjectEvent('{"type":"presence","userId":"u1"}')).toBeUndefined();
  });

  it('should ignore a payload that is not JSON', () => {
    expect(parseProjectEvent('not json')).toBeUndefined();
  });
});

describe('applyProjectEvent', () => {
  let queryClient: QueryClient;
  let invalidated: string[];

  beforeEach(() => {
    queryClient = new QueryClient();
    invalidated = [];
    queryClient.invalidateQueries = (async (filters?: { queryKey?: readonly unknown[] }) => {
      invalidated.push((filters?.queryKey ?? []).join('/'));
    }) as QueryClient['invalidateQueries'];
  });

  it('should refetch only the job list for a job event', () => {
    applyProjectEvent(queryClient, '7', { type: 'job', jobId: 'j1', kind: 'extract', status: 'in_progress' });
    flushInvalidations(queryClient);

    expect(invalidated).toEqual(['projects/7/jobs']);
  });

  it('should refetch the Blueprint, the Notebook and the stage once a blueprint job settles', () => {
    applyProjectEvent(queryClient, '7', { type: 'job', jobId: 'j1', kind: 'blueprint', status: 'done' });
    flushInvalidations(queryClient);

    expect(invalidated).toEqual(['projects/7/jobs', 'projects/7/blueprint', 'projects/7/ledger', 'projects/7/status']);
  });

  it('should leave the Blueprint alone while a blueprint job is still running', () => {
    applyProjectEvent(queryClient, '7', { type: 'job', jobId: 'j1', kind: 'blueprint', status: 'in_progress' });
    flushInvalidations(queryClient);

    expect(invalidated).toEqual(['projects/7/jobs']);
  });

  it('should refetch the transcript a message landed in', () => {
    applyProjectEvent(queryClient, '7', { type: 'chat', sessionId: 's1' });
    flushInvalidations(queryClient);

    expect(invalidated).toEqual(['projects/7/chat-sessions/s1/messages']);
  });

  it('should refetch the runs and the transcript whose turn has started', () => {
    applyProjectEvent(queryClient, '7', { type: 'run', runId: 'r1', graph: 'chat-turn', target: 'session:s1', status: 'running' });
    flushInvalidations(queryClient);

    expect(invalidated).toEqual(['projects/7/runs', 'projects/7/chat-sessions/s1/messages']);
  });

  it('should refetch everything a finished studio turn can have moved, including the seed sheet', () => {
    applyProjectEvent(queryClient, '7', { type: 'run', runId: 'r1', graph: 'ideation-turn', target: 'session:s1', status: 'completed' });
    flushInvalidations(queryClient);

    expect(invalidated).toEqual([
      'projects/7/runs',
      'projects/7/chat-sessions/s1/messages',
      'projects/7/chat-sessions',
      'projects/7/refinement-proposals',
      'projects/7/changes',
      'projects/7/seed',
      'seeds',
    ]);
  });

  it('should refetch only the runs for a run that is not a chat turn', () => {
    applyProjectEvent(queryClient, '7', { type: 'run', runId: 'r1', graph: 'chapter-generation', target: 'chapter-3', status: 'completed' });
    flushInvalidations(queryClient);

    expect(invalidated).toEqual(['projects/7/runs']);
  });

  it('should refetch the seed for a naming run on a seed target', () => {
    applyProjectEvent(queryClient, '7', { type: 'run', runId: 'r1', graph: 'ideation-name', target: 'seed:7', status: 'completed' });
    flushInvalidations(queryClient);

    expect(invalidated).toEqual(['projects/7/runs', 'projects/7/seed', 'seeds']);
  });

  it('should not refetch the seed for a non-ideation run on a seed target', () => {
    applyProjectEvent(queryClient, '7', { type: 'run', runId: 'r1', graph: 'chapter-generation', target: 'seed:7', status: 'completed' });
    flushInvalidations(queryClient);

    expect(invalidated).toEqual(['projects/7/runs']);
  });
});

describe('livePolling', () => {
  const at = (interval: ReturnType<typeof livePolling<unknown>>): number | false | undefined => (typeof interval === 'function' ? interval({ state: {} }) : interval);

  beforeEach(() => setEventStreamLive('7', false));

  it('should keep the poll’s own interval while the project has no live stream', () => {
    expect(at(livePolling('7', 1_500))).toBe(1_500);
  });

  it('should slow the poll to a safety net while the project’s stream is live', () => {
    setEventStreamLive('7', true);

    expect(at(livePolling('7', 1_500))).toBe(30_000);
    expect(at(livePolling('8', 1_500))).toBe(1_500);
  });

  it('should still stop wherever the poll itself stops', () => {
    setEventStreamLive('7', true);

    expect(at(livePolling('7', () => false))).toBe(false);
  });

  it('should not poll at all when the caller asked for no polling', () => {
    expect(livePolling('7', undefined)).toBeUndefined();
  });
});
