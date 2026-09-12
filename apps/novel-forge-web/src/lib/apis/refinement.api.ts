import { type QueryClient, queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';
import { useEffect } from 'react';

import {
  type ApplyProposalResponse,
  type AuditBibleResponse,
  type ChatSessionResponse,
  type ChatTurnResponse,
  type ChatTurnStatusResponse,
  type CreateChatSessionBody,
  type FailedTurnResponse,
  type ListChangesResponse,
  type ListChatMessagesResponse,
  type ListChatSessionResponse,
  type ListProposalResponse,
  type ListProposalsQueryParams,
  type PendingTurnResponse,
  type ProposalResponse,
  type RevertProposalResponse,
  type RollbackResponse,
} from './api-types.gen';
import { livePolling } from './live-polling';
import { ApiError, APIRequest } from './transport';

/**
 * The refinement surface: conversational chat sessions that reason over the novel and stage
 * reviewable proposals, plus the proposals those (and the analysis passes) produce. Canon is never
 * edited directly — a chat turn returns a proposal, and applying it writes the change-set.
 */
const refinementKeys = {
  sessions: (projectId: string) => ['projects', projectId, 'chat-sessions'] as const,
  session: (projectId: string, sessionId: string) => ['projects', projectId, 'chat-sessions', sessionId] as const,
  messages: (projectId: string, sessionId: string) => ['projects', projectId, 'chat-sessions', sessionId, 'messages'] as const,
  turn: (projectId: string, sessionId: string) => ['projects', projectId, 'chat-sessions', sessionId, 'turn'] as const,
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

/** Everything a finished turn can have moved: its transcript, the session list, proposals and the change history. */
export function invalidateChat(queryClient: QueryClient, projectId: string, sessionId: string): void {
  queryClient.invalidateQueries({ queryKey: refinementKeys.session(projectId, sessionId) });
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

/**
 * What the transcript is waiting on, derived once so both chat screens agree. `pending` carries the
 * running turn's graph and start time, which is what lets the UI name a phase and count the wait
 * instead of showing an unlabelled spinner.
 */
export type TurnState = { kind: 'idle' } | { kind: 'pending'; pending: PendingTurnResponse | null } | { kind: 'failed'; failed: FailedTurnResponse | null; retryContent: string };

// A turn opens its workflow run within a beat of the user message landing, so a trailing unanswered
// message younger than this is a turn still spinning up. Older than it, with no run either way, means
// nothing is coming — the state that used to read as a hung chat with no way out but a reload.
const TURN_SPINUP_GRACE_MS = 2 * 60 * 1000;

export function turnState(data: ListChatMessagesResponse | undefined): TurnState {
  if (data?.pendingTurn) return { kind: 'pending', pending: data.pendingTurn };

  const last = data?.messages.at(-1);
  if (!last || last.role !== 'user') return { kind: 'idle' };
  if (data?.failedTurn) return { kind: 'failed', failed: data.failedTurn, retryContent: last.content };

  const strandedFor = Date.now() - new Date(last.createdAt).getTime();
  return strandedFor > TURN_SPINUP_GRACE_MS ? { kind: 'failed', failed: null, retryContent: last.content } : { kind: 'pending', pending: null };
}

/** A session whose turn has started or whose transcript has grown, short of the turn finishing. */
export function invalidateChatSession(queryClient: QueryClient, projectId: string, sessionId: string): void {
  queryClient.invalidateQueries({ queryKey: refinementKeys.session(projectId, sessionId) });
}

export function invalidateChatSessions(queryClient: QueryClient, projectId: string): void {
  queryClient.invalidateQueries({ queryKey: refinementKeys.sessions(projectId) });
}

function runIdOf(turn: { runId: string } | null | undefined): string | null {
  return turn?.runId ?? null;
}

/** Whether the server's view of a turn has moved past the transcript this tab holds. */
export function transcriptBehind(transcript: ListChatMessagesResponse | undefined, status: ChatTurnStatusResponse | undefined): boolean {
  if (!transcript || !status) return false;
  const lastOrdinal = transcript.messages.at(-1)?.ordinal ?? 0;
  // A just-sent message sits ahead of the stored transcript until the server persists it; refetching earlier would drop it.
  if (status.lastOrdinal < lastOrdinal) return false;
  if (status.lastOrdinal > lastOrdinal) return true;
  return runIdOf(status.pendingTurn) !== runIdOf(transcript.pendingTurn) || runIdOf(status.failedTurn) !== runIdOf(transcript.failedTurn);
}

/**
 * Whether a failed send left its failure in the transcript, where the turn's failure card already says it. A request
 * refused before its turn ran (an archived session, a bad scope) records nothing there, and still needs telling.
 * Compared by run against the transcript as it was before sending, so an earlier failure still on screen does not count.
 */
export async function isTurnFailureRecorded(queryClient: QueryClient, projectId: string, sessionId: string, before?: ListChatMessagesResponse): Promise<boolean> {
  const queryKey = refinementKeys.messages(projectId, sessionId);
  // Joins the refetch the mutation already started once the server answered, rather than sending another.
  await queryClient.refetchQueries({ queryKey, exact: true }, { cancelRefetch: false });
  const failed = queryClient.getQueryData<ListChatMessagesResponse>(queryKey)?.failedTurn;
  return failed != null && failed.runId !== before?.failedTurn?.runId;
}

export function useChatMessagesQuery(projectId: string, sessionId: string | undefined, enabled = true): UseQueryResult<ListChatMessagesResponse, ApiError> {
  const queryClient = useQueryClient();
  const active = enabled && Boolean(projectId) && Boolean(sessionId);
  const transcript = useQuery<ListChatMessagesResponse, ApiError>({
    queryKey: refinementKeys.messages(projectId, sessionId ?? ''),
    queryFn: () => APIRequest.get(`/projects/${projectId}/chat/sessions/${sessionId}/messages`).query({ limit: 200 }).execute(),
    enabled: active,
  });
  // While a turn runs, poll the status rather than the transcript, which can be 200 messages; the transcript is
  // refetched only once the status shows it moved. A status older than the transcript says nothing about it.
  const status = useQuery<ChatTurnStatusResponse, ApiError>({
    queryKey: refinementKeys.turn(projectId, sessionId ?? ''),
    queryFn: () => APIRequest.get(`/projects/${projectId}/chat/sessions/${sessionId}/turn`).execute(),
    enabled: active && turnState(transcript.data).kind === 'pending',
    refetchInterval: livePolling(projectId, 1500),
  });
  const behind = status.dataUpdatedAt > transcript.dataUpdatedAt && transcriptBehind(transcript.data, status.data);

  useEffect(() => {
    if (behind) queryClient.invalidateQueries({ queryKey: refinementKeys.messages(projectId, sessionId ?? '') });
  }, [behind, projectId, queryClient, sessionId]);

  return transcript;
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
      // No run to name yet — the fresh trailing user message is what `turnState` reads as pending, and
      // clearing `failedTurn` retires the previous attempt's card the moment this one is sent.
      queryClient.setQueryData<ListChatMessagesResponse>(messagesKey, old => ({ messages: [...(old?.messages ?? []), optimistic], pendingTurn: null, failedTurn: null }));
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

export function useDeleteChatSessionMutation(projectId: string): UseMutationResult<ChatSessionResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<ChatSessionResponse, ApiError, string>({
    mutationFn: sessionId => APIRequest.delete(`/projects/${projectId}/chat/sessions/${sessionId}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: refinementKeys.sessions(projectId) }),
  });
}

export function useUpdateSessionModelMutation(projectId: string): UseMutationResult<ChatSessionResponse, ApiError, SessionModelVariables> {
  const queryClient = useQueryClient();
  return useMutation<ChatSessionResponse, ApiError, SessionModelVariables>({
    mutationFn: ({ sessionId, provider, model }) => APIRequest.patch(`/projects/${projectId}/chat/sessions/${sessionId}/model`).body({ provider, model }).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: refinementKeys.sessions(projectId) }),
  });
}

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

export function useRevertProposalMutation(projectId: string): UseMutationResult<RevertProposalResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<RevertProposalResponse, ApiError, string>({
    mutationFn: proposalId => APIRequest.post(`/projects/${projectId}/proposals/${proposalId}/revert`).execute(),
    onSuccess: () => invalidateProposals(queryClient, projectId),
  });
}

export function useListChangesQuery(projectId: string, enabled = true): UseQueryResult<ListChangesResponse, ApiError> {
  return useQuery<ListChangesResponse, ApiError>({
    queryKey: refinementKeys.changes(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/changes`).query({ limit: 100 }).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

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

export function useAuditBibleMutation(projectId: string): UseMutationResult<AuditBibleResponse, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<AuditBibleResponse, ApiError, undefined>({
    mutationFn: () => APIRequest.post(`/projects/${projectId}/bible/audit`).execute(),
    onSuccess: () => invalidateProposals(queryClient, projectId),
  });
}
