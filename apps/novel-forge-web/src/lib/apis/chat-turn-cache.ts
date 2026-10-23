import { type QueryClient } from '@tanstack/react-query';

import { type ChatPassageContextResponse, type ListChatMessagesResponse } from './api-types.gen';
import { refinementKeys } from './refinement-keys';

// The optimistic-update rollback snapshot for a chat turn: the messages cache as it was before the
// author's message was appended.
export interface ChatTurnContext {
  previous?: ListChatMessagesResponse;
}

/**
 * Shows the author's message and a pending state the instant they send — the reply can take a while, and
 * the server has already persisted this message so any other tab sees it too. Shared by the request and
 * the stream, which must open a turn identically.
 */
export async function beginChatTurn(
  queryClient: QueryClient,
  projectId: string,
  sessionId: string,
  content: string,
  contexts?: ChatPassageContextResponse[],
): Promise<ChatTurnContext> {
  const messagesKey = refinementKeys.messages(projectId, sessionId);
  await queryClient.cancelQueries({ queryKey: messagesKey });
  const previous = queryClient.getQueryData<ListChatMessagesResponse>(messagesKey);
  const optimistic: ListChatMessagesResponse['messages'][number] = {
    id: `optimistic-${Date.now()}`,
    sessionId,
    ordinal: (previous?.messages.at(-1)?.ordinal ?? 0) + 1,
    role: 'user',
    content,
    contexts: contexts?.length ? contexts : null,
    createdAt: new Date().toISOString(),
  };
  // No run to name yet — the fresh trailing user message is what `turnState` reads as pending, and
  // clearing `failedTurn` retires the previous attempt's card the moment this one is sent.
  queryClient.setQueryData<ListChatMessagesResponse>(messagesKey, old => ({ messages: [...(old?.messages ?? []), optimistic], pendingTurn: null, failedTurn: null }));
  return { previous };
}

export function rollbackChatTurn(queryClient: QueryClient, projectId: string, sessionId: string, context: ChatTurnContext | undefined): void {
  if (context?.previous) queryClient.setQueryData(refinementKeys.messages(projectId, sessionId), context.previous);
}
