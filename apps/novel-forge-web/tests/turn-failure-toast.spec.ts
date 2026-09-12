import { describe, expect, it } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { type ListChatMessagesResponse } from '../src/lib/apis/api-types.gen';
import { isTurnFailureRecorded } from '../src/lib/apis/refinement.api';

const failedTurn = (runId: string): ListChatMessagesResponse['failedTurn'] => ({
  runId,
  graph: 'ideation-turn',
  failedAt: '2026-09-12T19:00:01.000Z',
  code: 'AI_007',
  message: null,
});

async function transcriptAfterSend(served: ListChatMessagesResponse): Promise<QueryClient> {
  const queryClient = new QueryClient();
  await queryClient.fetchQuery({ queryKey: ['projects', '3', 'chat-sessions', 's1', 'messages'], queryFn: () => served });
  return queryClient;
}

describe('isTurnFailureRecorded', () => {
  it('should treat a failure the transcript now shows as already on screen', async () => {
    const queryClient = await transcriptAfterSend({ messages: [], pendingTurn: null, failedTurn: failedTurn('r2') });

    expect(await isTurnFailureRecorded(queryClient, '3', 's1', { messages: [], pendingTurn: null, failedTurn: null })).toBe(true);
  });

  it('should not count a request the server refused before its turn ran', async () => {
    const queryClient = await transcriptAfterSend({ messages: [], pendingTurn: null, failedTurn: null });

    expect(await isTurnFailureRecorded(queryClient, '3', 's1', { messages: [], pendingTurn: null, failedTurn: null })).toBe(false);
  });

  it('should not count an earlier failure that was already on screen before sending', async () => {
    const queryClient = await transcriptAfterSend({ messages: [], pendingTurn: null, failedTurn: failedTurn('r1') });

    expect(await isTurnFailureRecorded(queryClient, '3', 's1', { messages: [], pendingTurn: null, failedTurn: failedTurn('r1') })).toBe(false);
  });
});
