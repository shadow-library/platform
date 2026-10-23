import {
  type InfiniteData,
  type Query,
  type QueryClient,
  useInfiniteQuery,
  type UseInfiniteQueryResult,
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from '@shadow-library/ui';

import {
  type CancelRunResponse,
  type ChatPassageContextBody,
  type ChatPassageContextResponse,
  type ChatSessionResponse,
  type ChatTurnResponse,
  type ChatTurnStatusResponse,
  type ContentMode,
  type CostTier,
  type CreateChatSessionBody,
  type FailedTurnResponse,
  type ListChatMessagesResponse,
  type ListChatSessionResponse,
  type PendingTurnResponse,
} from './api-types.gen';
import { flushInvalidations, invalidateSoon } from './batched-invalidation';
import { livePolling } from './live-polling';
import { invalidateRuns } from './run.api';
import { ApiError, APIRequest } from './transport';
import { refinementKeys } from './refinement-keys';
import { beginChatTurn, type ChatTurnContext, rollbackChatTurn } from './chat-turn-cache';

interface ListSessionsParams {
  scopeType?: ChatSessionResponse['scopeType'];
  status?: ChatSessionResponse['status'];
  limit?: number;
}

interface InfiniteSessionsParams {
  status: ChatSessionResponse['status'];
  limit: number;
}

export interface ChatTurnRequest {
  content: string;
  /** The author's Edit prose toggle: only with it may the turn rewrite chapter text. */
  proseEdits?: boolean;
  justDiscussing?: boolean;
  /** This turn only; omitted follows the chat, then the project. */
  contentMode?: ContentMode;
  costTier?: CostTier;
  /** Passages the author commented on; the server refuses the turn with `CHT_009` when one has changed since it was selected. */
  contexts?: ChatPassageContextBody[];
}

interface ForgeTurnVariables extends ChatTurnRequest {
  sessionId: string;
}

/** A turn as the composer sends it: the request, and the passages as the author's message shows them until the server's own copy arrives. */
export interface ChatTurnVariables extends ChatTurnRequest {
  shown?: ChatPassageContextResponse[];
}

interface SessionStatusVariables {
  sessionId: string;
  status: 'active' | 'archived';
}

interface SessionModelVariables {
  sessionId: string;
  provider?: string | null;
  model?: string | null;
  contentMode?: ContentMode | null;
  costTier?: CostTier | null;
}

interface SessionUpdateVariables {
  sessionId: string;
  mode?: 'manual' | 'auto';
  title?: string;
}

/** A session list's key ends in its filters; a key ending in a session id belongs to that session's own queries. */
function isSessionList(query: Query): boolean {
  return typeof query.queryKey[3] !== 'string';
}

/** The proposal lists, for a card staged away from any turn — a chapter's Story Bible refresh. */
export function invalidateProposalLists(queryClient: QueryClient, projectId: string): void {
  invalidateSoon(queryClient, { queryKey: refinementKeys.proposals(projectId) });
}

/** Everything a finished turn can have moved: its transcript, the session lists, proposals and the change history. */
export function invalidateChat(queryClient: QueryClient, projectId: string, sessionId: string): void {
  invalidateSoon(queryClient, { queryKey: refinementKeys.messages(projectId, sessionId), exact: true });
  invalidateSoon(queryClient, { queryKey: refinementKeys.sessions(projectId), predicate: isSessionList });
  invalidateSoon(queryClient, { queryKey: refinementKeys.proposals(projectId) });
  invalidateSoon(queryClient, { queryKey: refinementKeys.changes(projectId) });
}

export function useListChatSessionsQuery(projectId: string, params?: ListSessionsParams, enabled = true): UseQueryResult<ListChatSessionResponse, ApiError> {
  return useQuery<ListChatSessionResponse, ApiError>({
    queryKey: [...refinementKeys.sessions(projectId), params],
    queryFn: () => APIRequest.get(`/projects/${projectId}/chat/sessions`).query({ scopeType: params?.scopeType, status: params?.status, limit: params?.limit }).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

/**
 * The session list one page at a time, for the history modal. The endpoint takes `limit`/`offset` and
 * answers with `total`, so the next offset is derivable; a page that comes back empty ends the list
 * regardless of what `total` claims, so a shrinking collection cannot loop.
 */
export function useInfiniteChatSessionsQuery(
  projectId: string,
  params: InfiniteSessionsParams,
  enabled = true,
): UseInfiniteQueryResult<InfiniteData<ListChatSessionResponse, number>, ApiError> {
  return useInfiniteQuery<ListChatSessionResponse, ApiError, InfiniteData<ListChatSessionResponse, number>, readonly unknown[], number>({
    queryKey: [...refinementKeys.sessions(projectId), { ...params, paged: true }],
    queryFn: ({ pageParam }) => APIRequest.get(`/projects/${projectId}/chat/sessions`).query({ status: params.status, limit: params.limit, offset: pageParam }).execute(),
    initialPageParam: 0,
    getNextPageParam: last => {
      const loaded = last.offset + last.items.length;
      return last.items.length === 0 || loaded >= last.total ? undefined : loaded;
    },
    enabled: enabled && Boolean(projectId),
  });
}

export function useChatSessionQuery(projectId: string, sessionId: string, enabled = true): UseQueryResult<ChatSessionResponse, ApiError> {
  return useQuery<ChatSessionResponse, ApiError>({
    queryKey: refinementKeys.session(projectId, sessionId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/chat/sessions/${sessionId}`).execute(),
    enabled: enabled && Boolean(projectId) && Boolean(sessionId),
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
// nothing is coming, which would otherwise read as a hung chat.
const TURN_SPINUP_GRACE_MS = 2 * 60 * 1000;

export function turnState(data: ListChatMessagesResponse | undefined): TurnState {
  if (data?.pendingTurn) return { kind: 'pending', pending: data.pendingTurn };

  const last = data?.messages.at(-1);
  if (!last || last.role !== 'user') return { kind: 'idle' };
  if (data?.failedTurn) return { kind: 'failed', failed: data.failedTurn, retryContent: last.content };

  const strandedFor = Date.now() - new Date(last.createdAt).getTime();
  return strandedFor > TURN_SPINUP_GRACE_MS ? { kind: 'failed', failed: null, retryContent: last.content } : { kind: 'pending', pending: null };
}

function isGone(error: ApiError | null): boolean {
  return error?.status === 404;
}

/**
 * A failed refetch keeps the last good transcript, and a just-sent turn's optimistic `pendingTurn` with it. Once the chat or its novel is
 * deleted every refetch 404s, so that cached turn would read as running forever; a transcript the server no longer has holds no turn.
 */
export function transcriptTurnState(transcript: Pick<UseQueryResult<ListChatMessagesResponse, ApiError>, 'data' | 'error'>): TurnState {
  return isGone(transcript.error) ? { kind: 'idle' } : turnState(transcript.data);
}

/** A transcript that has grown or whose turn has started, short of the turn finishing; its status is left to its own poll. */
export function invalidateChatSession(queryClient: QueryClient, projectId: string, sessionId: string): void {
  invalidateSoon(queryClient, { queryKey: refinementKeys.messages(projectId, sessionId), exact: true });
}

export function invalidateChatSessions(queryClient: QueryClient, projectId: string): void {
  invalidateSoon(queryClient, { queryKey: refinementKeys.sessions(projectId) });
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
  // Starts the refetch this send already queued and waits on it, rather than sending a second one.
  flushInvalidations(queryClient);
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
    enabled: active && transcriptTurnState(transcript).kind === 'pending',
    refetchInterval: livePolling(projectId, 1500),
  });
  const behind = status.dataUpdatedAt > transcript.dataUpdatedAt && transcriptBehind(transcript.data, status.data);
  const gone = isGone(status.error);

  useEffect(() => {
    if (behind || gone) invalidateSoon(queryClient, { queryKey: refinementKeys.messages(projectId, sessionId ?? ''), exact: true });
  }, [behind, gone, projectId, queryClient, sessionId]);

  return transcript;
}

export function useCreateChatSessionMutation(projectId: string): UseMutationResult<ChatSessionResponse, ApiError, CreateChatSessionBody> {
  const queryClient = useQueryClient();
  return useMutation<ChatSessionResponse, ApiError, CreateChatSessionBody>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/chat/sessions`).body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: refinementKeys.sessions(projectId) }),
  });
}

export function useChatTurnMutation(projectId: string, sessionId: string): UseMutationResult<ChatTurnResponse, ApiError, ChatTurnVariables, ChatTurnContext> {
  const queryClient = useQueryClient();
  return useMutation<ChatTurnResponse, ApiError, ChatTurnVariables, ChatTurnContext>({
    mutationFn: ({ shown: _shown, ...request }) => APIRequest.post(`/projects/${projectId}/chat/sessions/${sessionId}/messages`).body(request).execute(),
    onMutate: ({ content, shown }) => beginChatTurn(queryClient, projectId, sessionId, content, shown),
    onError: (_err, _content, context) => rollbackChatTurn(queryClient, projectId, sessionId, context),
    // Reconcile against the server on both outcomes: on success the real exchange arrives; on a
    // post-persist failure the user message is still there, minus a reply.
    onSettled: () => invalidateChat(queryClient, projectId, sessionId),
  });
}

/** Cancels a live workflow run. Shared by the chat composer's Stop and the run/job cards — the endpoint is generic to any run. */
export function useCancelRunMutation(projectId: string): UseMutationResult<CancelRunResponse, ApiError, string> {
  return useMutation<CancelRunResponse, ApiError, string>({
    mutationFn: runId => APIRequest.post(`/projects/${projectId}/runs/${runId}/cancel`).execute(),
  });
}

export interface RunStopAction {
  stop: (runId: string) => void;
  stopping: boolean;
}

/**
 * Idempotent Stop for a run shown outside the chat composer — the ref guard mirrors
 * `useChatTurnStream`'s own `stop`, and `not_delivered` gets the same "may still be running" warning
 * rather than a claim that nothing happened.
 */
export function useRunStop(projectId: string): RunStopAction {
  const queryClient = useQueryClient();
  const cancelRun = useCancelRunMutation(projectId);
  const stoppingRef = useRef(false);
  const stop = (runId: string): void => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    cancelRun.mutate(runId, {
      onSuccess: result => {
        invalidateRuns(queryClient, projectId);
        if (result.outcome === 'not_delivered') toast.warning("Couldn't confirm the stop — it may still be running. Try again in a moment.");
      },
      onSettled: () => {
        stoppingRef.current = false;
      },
      onError: err => toast.danger(err.message),
    });
  };
  return { stop, stopping: cancelRun.isPending };
}

export function useForgeTurnMutation(projectId: string): UseMutationResult<ChatTurnResponse, ApiError, ForgeTurnVariables> {
  const queryClient = useQueryClient();
  return useMutation<ChatTurnResponse, ApiError, ForgeTurnVariables>({
    mutationFn: ({ sessionId, ...request }) => APIRequest.post(`/projects/${projectId}/chat/sessions/${sessionId}/messages`).body(request).execute(),
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
    mutationFn: ({ sessionId, ...body }) => APIRequest.patch(`/projects/${projectId}/chat/sessions/${sessionId}/model`).body(body).execute(),
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
