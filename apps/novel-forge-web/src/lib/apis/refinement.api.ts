/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, ApiError } from './api-request';
import {
  type ApplyProposalResponse,
  type AuditBibleResponse,
  type ChatSessionResponse,
  type ChatTurnResponse,
  type CreateChatSessionBody,
  type ListChatMessagesResponse,
  type ListChatSessionResponse,
  type ListProposalResponse,
  type ListProposalsQueryParams,
  type ProposalResponse,
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

interface SessionStatusVariables {
  sessionId: string;
  status: 'active' | 'archived';
}

interface SessionModelVariables {
  sessionId: string;
  provider: string | null;
  model: string | null;
}

/** A chat turn touches the session's messages, the session list (last-turn/summary), and any proposal it staged. */
function invalidateChat(queryClient: ReturnType<typeof useQueryClient>, projectId: string, sessionId: string): void {
  queryClient.invalidateQueries({ queryKey: refinementKeys.messages(projectId, sessionId) });
  queryClient.invalidateQueries({ queryKey: refinementKeys.sessions(projectId) });
  queryClient.invalidateQueries({ queryKey: refinementKeys.proposals(projectId) });
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
  });
}

export function useCreateChatSessionMutation(projectId: string): UseMutationResult<ChatSessionResponse, ApiError, CreateChatSessionBody> {
  const queryClient = useQueryClient();
  return useMutation<ChatSessionResponse, ApiError, CreateChatSessionBody>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/chat/sessions`).body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: refinementKeys.sessions(projectId) }),
  });
}

export function useChatTurnMutation(projectId: string, sessionId: string): UseMutationResult<ChatTurnResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<ChatTurnResponse, ApiError, string>({
    mutationFn: content => APIRequest.post(`/projects/${projectId}/chat/sessions/${sessionId}/messages`).body({ content }).execute(),
    onSuccess: () => invalidateChat(queryClient, projectId, sessionId),
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

export function useListProposalsQuery(projectId: string, params?: ListProposalsQueryParams, enabled = true): UseQueryResult<ListProposalResponse, ApiError> {
  return useQuery<ListProposalResponse, ApiError>({
    queryKey: refinementKeys.proposalList(projectId, params),
    queryFn: () =>
      APIRequest.get(`/projects/${projectId}/proposals`)
        .query(params ?? {})
        .execute(),
    enabled: enabled && Boolean(projectId),
  });
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

export function useApplyProposalMutation(projectId: string): UseMutationResult<ApplyProposalResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<ApplyProposalResponse, ApiError, string>({
    mutationFn: proposalId => APIRequest.post(`/projects/${projectId}/proposals/${proposalId}/apply`).execute(),
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
