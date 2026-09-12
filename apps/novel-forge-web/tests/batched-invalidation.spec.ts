import { beforeEach, describe, expect, it } from 'bun:test';
import { type InvalidateQueryFilters, type Query, QueryClient } from '@tanstack/react-query';

import { flushInvalidations, invalidateSoon } from '../src/lib/apis/batched-invalidation';
import { invalidateChat } from '../src/lib/apis/refinement.api';

describe('invalidateSoon', () => {
  let queryClient: QueryClient;
  let calls: InvalidateQueryFilters[];

  beforeEach(() => {
    queryClient = new QueryClient();
    calls = [];
    queryClient.invalidateQueries = (async (filters?: InvalidateQueryFilters) => {
      calls.push(filters ?? {});
    }) as QueryClient['invalidateQueries'];
  });

  it('should wait for the batch window before invalidating', async () => {
    invalidateSoon(queryClient, { queryKey: ['projects', '3', 'jobs'] });

    expect(calls).toHaveLength(0);
    await Bun.sleep(200);
    expect(calls).toHaveLength(1);
  });

  it('should collapse repeats of the same filter within a window into one invalidation', async () => {
    invalidateSoon(queryClient, { queryKey: ['projects', '3', 'chat-sessions', 's1', 'messages'], exact: true });
    invalidateSoon(queryClient, { queryKey: ['projects', '3', 'chat-sessions', 's1', 'messages'], exact: true });
    invalidateSoon(queryClient, { queryKey: ['projects', '3', 'runs'] });

    await Bun.sleep(200);

    expect(calls.map(filters => filters.queryKey?.join('/'))).toEqual(['projects/3/chat-sessions/s1/messages', 'projects/3/runs']);
  });

  it('should invalidate at once when the batch is flushed, and not again when the window closes', async () => {
    invalidateSoon(queryClient, { queryKey: ['projects', '3', 'jobs'] });

    flushInvalidations(queryClient);
    expect(calls).toHaveLength(1);
    await Bun.sleep(200);
    expect(calls).toHaveLength(1);
  });

  it('should keep filters that differ only by their predicate apart', () => {
    const lists = (query: Query): boolean => query.queryKey.length === 4;
    const details = (query: Query): boolean => query.queryKey.length === 5;
    invalidateSoon(queryClient, { queryKey: ['projects', '3', 'chat-sessions'], predicate: lists });
    invalidateSoon(queryClient, { queryKey: ['projects', '3', 'chat-sessions'], predicate: details });

    flushInvalidations(queryClient);

    expect(calls).toHaveLength(2);
  });
});

describe('invalidateChat', () => {
  it('should mark a finished turn’s transcript and the session lists stale, but not its status or other sessions', async () => {
    const queryClient = new QueryClient();
    const keys = {
      list: ['projects', '3', 'chat-sessions', { limit: 20 }],
      transcript: ['projects', '3', 'chat-sessions', 's1', 'messages'],
      status: ['projects', '3', 'chat-sessions', 's1', 'turn'],
      otherTranscript: ['projects', '3', 'chat-sessions', 's2', 'messages'],
    };
    for (const queryKey of Object.values(keys)) queryClient.setQueryData(queryKey, {});

    invalidateChat(queryClient, '3', 's1');
    flushInvalidations(queryClient);

    const stale = (queryKey: unknown[]): boolean | undefined => queryClient.getQueryState(queryKey)?.isInvalidated;
    expect({ list: stale(keys.list), transcript: stale(keys.transcript), status: stale(keys.status), otherTranscript: stale(keys.otherTranscript) }).toEqual({
      list: true,
      transcript: true,
      status: false,
      otherTranscript: false,
    });
  });
});
