/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { ApiError, APIRequest } from './api-request';
import {
  type ApplyProposalResponse,
  type AuditBibleResponse,
  type ChatSessionResponse,
  type ChatTurnResponse,
  type CreateChatSessionBody,
  type ListChangesResponse,
  type ListChatMessagesResponse,
  type ListChatSessionResponse,
  type ListProposalResponse,
  type ListProposalsQueryParams,
  type ProposalResponse,
  type RevertProposalResponse,
  type RollbackResponse,
} from './api-types.gen';

/**
 * The refinement surface: conversational chat sessions that reason over the novel and stage
 * reviewable proposals, plus the proposals those (and the analysis passes) produce. Canon is never
 * edited directly — a chat turn returns a proposal, and applying it writes the change-set.
 */
const refinementKeys = {
  sessions: (projectId: string) => ['projects', projectId, 'chat-sessions'] as const,
  session: (projectId: string, sessionId: string) => ['projects', projectId, 'chat-sessions', sessionId] as const,
  messages: (projectId: string, sessionId: string) => ['projects', projectId, 'chat-sessions', sessionId, 'messages'] as const,
  proposals: (projectId: string) => ['projects', projectId, 'refinement-proposals'] as const,
  proposalList: (projectId: string, params?: ListProposalsQueryParams) => [...refinementKeys.proposals(projectId), 'list', params] as const,
  proposal: (projectId: string, proposalId: string) => [...refinementKeys.proposals(projectId), proposalId] as const,
  changes: (projectId: string) => ['projects', projectId, 'changes'] as const,
};

interface ListSessionsParams {
  scopeType?: ChatSessionResponse['scopeType'];
  status?: ChatSessionResponse['status'];
  limit?: number;
}

interface ForgeTurnVariables {
  sessionId: string;
  content: string;
}

// The optimistic-update rollback snapshot for a chat turn: the messages cache as it was before the
// author's message was appended.
interface ChatTurnContext {
  previous?: ListChatMessagesResponse;
}

interface SessionStatusVariables {
  sessionId: string;
  status: 'active' | 'archived';
}

interface SessionModelVariables {
  sessionId: string;
  provider: string | null;
  model: string | null;
}

interface SessionUpdateVariables {
  sessionId: string;
  mode?: 'manual' | 'auto';
  title?: string;
}

interface ApplyProposalVariables {
  proposalId: string;
  // Cherry-pick: apply only these change-set indexes; the rest are recorded as declined. Absent → all.
  opIndexes?: number[];
}

/** A chat turn touches the session's messages, the session list (last-turn/summary), any proposal it staged, and — in auto mode — the change history. */
function invalidateChat(queryClient: ReturnType<typeof useQueryClient>, projectId: string, sessionId: string): void {
  queryClient.invalidateQueries({ queryKey: refinementKeys.messages(projectId, sessionId) });
  queryClient.invalidateQueries({ queryKey: refinementKeys.sessions(projectId) });
  queryClient.invalidateQueries({ queryKey: refinementKeys.proposals(projectId) });
  queryClient.invalidateQueries({ queryKey: refinementKeys.changes(projectId) });
}

export function useListChatSessionsQuery(projectId: string, params?: ListSessionsParams, enabled = true): UseQueryResult<ListChatSessionResponse, ApiError> {
  return useQuery<ListChatSessionResponse, ApiError>({
    queryKey: [...refinementKeys.sessions(projectId), params],
    queryFn: () => APIRequest.get(`/projects/${projectId}/chat/sessions`).query({ scopeType: params?.scopeType, status: params?.status, limit: params?.limit }).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

export function useChatMessagesQuery(projectId: string, sessionId: string | undefined, enabled = true): UseQueryResult<ListChatMessagesResponse, ApiError> {
  return useQuery<ListChatMessagesResponse, ApiError>({
    queryKey: refinementKeys.messages(projectId, sessionId ?? ''),
    queryFn: () => APIRequest.get(`/projects/${projectId}/chat/sessions/${sessionId}/messages`).query({ limit: 200 }).execute(),
    enabled: enabled && Boolean(projectId) && Boolean(sessionId),
    // Follow an in-flight turn to completion: the server sets pendingTurn while a chat-turn is still
    // running, so a refresh or a second tab keeps polling until the reply lands, then stops.
    refetchInterval: query => (query.state.data?.pendingTurn ? 1500 : false),
  });
}

export function useCreateChatSessionMutation(projectId: string): UseMutationResult<ChatSessionResponse, ApiError, CreateChatSessionBody> {
  const queryClient = useQueryClient();
  return useMutation<ChatSessionResponse, ApiError, CreateChatSessionBody>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/chat/sessions`).body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: refinementKeys.sessions(projectId) }),
  });
}

export function useChatTurnMutation(projectId: string, sessionId: string): UseMutationResult<ChatTurnResponse, ApiError, string, ChatTurnContext> {
  const queryClient = useQueryClient();
  const messagesKey = refinementKeys.messages(projectId, sessionId);
  return useMutation<ChatTurnResponse, ApiError, string, ChatTurnContext>({
    mutationFn: content => APIRequest.post(`/projects/${projectId}/chat/sessions/${sessionId}/messages`).body({ content }).execute(),
    // Show the author's message and a pending state the instant they send — the reply can take a
    // while, and the server has already persisted this message so any other tab sees it too.
    onMutate: async content => {
      await queryClient.cancelQueries({ queryKey: messagesKey });
      const previous = queryClient.getQueryData<ListChatMessagesResponse>(messagesKey);
      const optimistic: ListChatMessagesResponse['messages'][number] = {
        id: `optimistic-${Date.now()}`,
        sessionId,
        ordinal: (previous?.messages.at(-1)?.ordinal ?? 0) + 1,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<ListChatMessagesResponse>(messagesKey, old => ({ messages: [...(old?.messages ?? []), optimistic], pendingTurn: true }));
      return { previous };
    },
    onError: (_err, _content, context) => {
      if (context?.previous) queryClient.setQueryData(messagesKey, context.previous);
    },
    // Reconcile against the server on both outcomes: on success the real exchange arrives; on a
    // post-persist failure the user message is still there, minus a reply.
    onSettled: () => invalidateChat(queryClient, projectId, sessionId),
  });
}

/** A chat turn where the session is picked at call time — for composers that resolve their session lazily. */
export function useForgeTurnMutation(projectId: string): UseMutationResult<ChatTurnResponse, ApiError, ForgeTurnVariables> {
  const queryClient = useQueryClient();
  return useMutation<ChatTurnResponse, ApiError, ForgeTurnVariables>({
    mutationFn: ({ sessionId, content }) => APIRequest.post(`/projects/${projectId}/chat/sessions/${sessionId}/messages`).body({ content }).execute(),
    onSuccess: (_r, { sessionId }) => invalidateChat(queryClient, projectId, sessionId),
  });
}

export function useSetSessionStatusMutation(projectId: string): UseMutationResult<ChatSessionResponse, ApiError, SessionStatusVariables> {
  const queryClient = useQueryClient();
  return useMutation<ChatSessionResponse, ApiError, SessionStatusVariables>({
    mutationFn: ({ sessionId, status }) => APIRequest.post(`/projects/${projectId}/chat/sessions/${sessionId}/${status === 'archived' ? 'archive' : 'unarchive'}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: refinementKeys.sessions(projectId) }),
  });
}

/** Deletes a chat and its whole message history. Proposals it staged survive, detached. */
export function useDeleteChatSessionMutation(projectId: string): UseMutationResult<ChatSessionResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<ChatSessionResponse, ApiError, string>({
    mutationFn: sessionId => APIRequest.delete(`/projects/${projectId}/chat/sessions/${sessionId}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: refinementKeys.sessions(projectId) }),
  });
}

/** Sets (or clears, with nulls) the per-session model override so every turn in that chat uses it. */
export function useUpdateSessionModelMutation(projectId: string): UseMutationResult<ChatSessionResponse, ApiError, SessionModelVariables> {
  const queryClient = useQueryClient();
  return useMutation<ChatSessionResponse, ApiError, SessionModelVariables>({
    mutationFn: ({ sessionId, provider, model }) => APIRequest.patch(`/projects/${projectId}/chat/sessions/${sessionId}/model`).body({ provider, model }).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: refinementKeys.sessions(projectId) }),
  });
}

/** Flips the manual ⇄ auto mode (or renames) a chat session mid-conversation. */
export function useUpdateChatSessionMutation(projectId: string): UseMutationResult<ChatSessionResponse, ApiError, SessionUpdateVariables> {
  const queryClient = useQueryClient();
  return useMutation<ChatSessionResponse, ApiError, SessionUpdateVariables>({
    mutationFn: ({ sessionId, ...body }) => APIRequest.patch(`/projects/${projectId}/chat/sessions/${sessionId}`).body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: refinementKeys.sessions(projectId) }),
  });
}

export const listProposalsQueryOptions = (projectId: string, params?: ListProposalsQueryParams): UseQueryOptions<ListProposalResponse, ApiError> =>
  queryOptions<ListProposalResponse, ApiError>({
    queryKey: refinementKeys.proposalList(projectId, params),
    queryFn: () =>
      APIRequest.get(`/projects/${projectId}/proposals`)
        .query(params ?? {})
        .execute(),
  });

export function useListProposalsQuery(projectId: string, params?: ListProposalsQueryParams, enabled = true): UseQueryResult<ListProposalResponse, ApiError> {
  return useQuery({ ...listProposalsQueryOptions(projectId, params), enabled: enabled && Boolean(projectId) });
}

export function useProposalQuery(projectId: string, proposalId: string | undefined, enabled = true): UseQueryResult<ProposalResponse, ApiError> {
  return useQuery<ProposalResponse, ApiError>({
    queryKey: refinementKeys.proposal(projectId, proposalId ?? ''),
    queryFn: () => APIRequest.get(`/projects/${projectId}/proposals/${proposalId}`).execute(),
    enabled: enabled && Boolean(projectId) && Boolean(proposalId),
  });
}

function invalidateProposals(queryClient: ReturnType<typeof useQueryClient>, projectId: string): void {
  queryClient.invalidateQueries({ queryKey: refinementKeys.proposals(projectId) });
  queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
}

export function useApplyProposalMutation(projectId: string): UseMutationResult<ApplyProposalResponse, ApiError, ApplyProposalVariables> {
  const queryClient = useQueryClient();
  return useMutation<ApplyProposalResponse, ApiError, ApplyProposalVariables>({
    mutationFn: ({ proposalId, opIndexes }) =>
      APIRequest.post(`/projects/${projectId}/proposals/${proposalId}/apply`)
        .body(opIndexes ? { opIndexes } : {})
        .execute(),
    onSuccess: () => invalidateProposals(queryClient, projectId),
  });
}

/** Undoes an applied proposal from its stored inverse ops; 409 when the artifact moved since. */
export function useRevertProposalMutation(projectId: string): UseMutationResult<RevertProposalResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<RevertProposalResponse, ApiError, string>({
    mutationFn: proposalId => APIRequest.post(`/projects/${projectId}/proposals/${proposalId}/revert`).execute(),
    onSuccess: () => invalidateProposals(queryClient, projectId),
  });
}

/** The project-wide change history: every applied/reverted change, newest first, with revertibility. */
export function useListChangesQuery(projectId: string, enabled = true): UseQueryResult<ListChangesResponse, ApiError> {
  return useQuery<ListChangesResponse, ApiError>({
    queryKey: refinementKeys.changes(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/changes`).query({ limit: 100 }).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

/** Reverts every change applied after the anchor, newest first — "roll back to here". */
export function useRollbackMutation(projectId: string): UseMutationResult<RollbackResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<RollbackResponse, ApiError, string>({
    mutationFn: afterProposalId => APIRequest.post(`/projects/${projectId}/changes/rollback`).body({ afterProposalId }).execute(),
    onSuccess: () => invalidateProposals(queryClient, projectId),
  });
}

export function useDiscardProposalMutation(projectId: string): UseMutationResult<ProposalResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<ProposalResponse, ApiError, string>({
    mutationFn: proposalId => APIRequest.post(`/projects/${projectId}/proposals/${proposalId}/discard`).execute(),
    onSuccess: () => invalidateProposals(queryClient, projectId),
  });
}

/** Audits the whole bible for contradictions; any findings arrive as a reviewable proposal. */
export function useAuditBibleMutation(projectId: string): UseMutationResult<AuditBibleResponse, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<AuditBibleResponse, ApiError, undefined>({
    mutationFn: () => APIRequest.post(`/projects/${projectId}/bible/audit`).execute(),
    onSuccess: () => invalidateProposals(queryClient, projectId),
  });
}
