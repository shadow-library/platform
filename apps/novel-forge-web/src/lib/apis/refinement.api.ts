import {
  type Query,
  type QueryClient,
  queryOptions,
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import {
  type ApplyProposalResponse,
  type AuditBibleResponse,
  type CancelRunResponse,
  type ChatMessageResponse,
  type ChatSessionResponse,
  type ChatTurnResponse,
  type ChatTurnStatusResponse,
  type ChatTurnStreamResponse,
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
import { flushInvalidations, invalidateSoon } from './batched-invalidation';
import { livePolling } from './live-polling';
import { ApiError, APIRequest, isApiError } from './transport';

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
export interface ChatTurnContext {
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

/** A session list's key ends in its filters; a key ending in a session id belongs to that session's own queries. */
function isSessionList(query: Query): boolean {
  return typeof query.queryKey[3] !== 'string';
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
    enabled: active && turnState(transcript.data).kind === 'pending',
    refetchInterval: livePolling(projectId, 1500),
  });
  const behind = status.dataUpdatedAt > transcript.dataUpdatedAt && transcriptBehind(transcript.data, status.data);

  useEffect(() => {
    if (behind) invalidateSoon(queryClient, { queryKey: refinementKeys.messages(projectId, sessionId ?? ''), exact: true });
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

/**
 * Shows the author's message and a pending state the instant they send — the reply can take a while, and
 * the server has already persisted this message so any other tab sees it too. Shared by the request and
 * the stream, which must open a turn identically.
 */
async function beginChatTurn(queryClient: QueryClient, projectId: string, sessionId: string, content: string): Promise<ChatTurnContext> {
  const messagesKey = refinementKeys.messages(projectId, sessionId);
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
}

function rollbackChatTurn(queryClient: QueryClient, projectId: string, sessionId: string, context: ChatTurnContext | undefined): void {
  if (context?.previous) queryClient.setQueryData(refinementKeys.messages(projectId, sessionId), context.previous);
}

export function useChatTurnMutation(projectId: string, sessionId: string): UseMutationResult<ChatTurnResponse, ApiError, string, ChatTurnContext> {
  const queryClient = useQueryClient();
  return useMutation<ChatTurnResponse, ApiError, string, ChatTurnContext>({
    mutationFn: content => APIRequest.post(`/projects/${projectId}/chat/sessions/${sessionId}/messages`).body({ content }).execute(),
    onMutate: content => beginChatTurn(queryClient, projectId, sessionId, content),
    onError: (_err, _content, context) => rollbackChatTurn(queryClient, projectId, sessionId, context),
    // Reconcile against the server on both outcomes: on success the real exchange arrives; on a
    // post-persist failure the user message is still there, minus a reply.
    onSettled: () => invalidateChat(queryClient, projectId, sessionId),
  });
}

/** Cancels a live workflow run. Shared by the chat composer's Stop and (S7) the run/job cards — the endpoint is generic to any run. */
export function useCancelRunMutation(projectId: string): UseMutationResult<CancelRunResponse, ApiError, string> {
  return useMutation<CancelRunResponse, ApiError, string>({
    mutationFn: runId => APIRequest.post(`/projects/${projectId}/runs/${runId}/cancel`).execute(),
  });
}

/**
 * The turn stream (design §4). The SSE route hijacks its reply, so it has no generated response type and the
 * frames are hand-typed here; `user` and `done` carry generated shapes and reuse them.
 */
export interface ChatTurnLookup {
  round: number;
  tool: string;
  args: Record<string, unknown>;
  status: 'running' | 'ok' | 'error';
}

export interface ChatTurnFailure {
  code: string;
  message: string;
}

export type ChatTurnStreamEvent =
  | { type: 'user'; message: ChatMessageResponse }
  | { type: 'lookup'; lookup: ChatTurnLookup }
  | { type: 'delta'; text: string }
  | { type: 'reset' }
  | { type: 'done'; turn: ChatTurnResponse }
  | { type: 'error'; failure: ChatTurnFailure };

interface ChatTurnProgress {
  reply: string;
  lookups: ChatTurnLookup[];
  userMessage: ChatMessageResponse | null;
}

export type ChatTurnStreamState =
  | (ChatTurnProgress & { status: 'idle' | 'streaming' })
  | (ChatTurnProgress & { status: 'done'; turn: ChatTurnResponse })
  | (ChatTurnProgress & { status: 'failed'; failure: ChatTurnFailure })
  // The author stopped the turn themselves — distinct from `failed`: nothing went wrong, and there is no
  // error to show. Reuses the `error` precedent of keeping the partial reply rather than voiding it (§4).
  | (ChatTurnProgress & { status: 'stopped' });

export const idleChatTurnStream: ChatTurnStreamState = { status: 'idle', reply: '', lookups: [], userMessage: null };

const CHAT_TURN_EVENTS = ['user', 'lookup', 'delta', 'reset', 'done', 'error'] as const;
const LOOKUP_STATUSES = ['running', 'ok', 'error'] as const;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export function parseChatTurnEvent(name: string, data: unknown): ChatTurnStreamEvent | undefined {
  if (typeof data !== 'string') return undefined;
  let payload: Record<string, unknown> | undefined;
  try {
    payload = asRecord(JSON.parse(data));
  } catch {
    return undefined;
  }
  if (!payload) return undefined;
  if (name === 'reset') return { type: 'reset' };
  if (name === 'delta') return typeof payload.text === 'string' ? { type: 'delta', text: payload.text } : undefined;
  if (name === 'user') return typeof payload.content === 'string' ? { type: 'user', message: payload as unknown as ChatMessageResponse } : undefined;
  if (name === 'done') return asRecord(payload.assistantMessage) ? { type: 'done', turn: payload as unknown as ChatTurnResponse } : undefined;
  if (name === 'error')
    return typeof payload.code === 'string' && typeof payload.message === 'string' ? { type: 'error', failure: { code: payload.code, message: payload.message } } : undefined;
  if (name !== 'lookup') return undefined;
  const { round, tool, status } = payload;
  if (typeof round !== 'number' || typeof tool !== 'string') return undefined;
  if (!LOOKUP_STATUSES.includes(status as ChatTurnLookup['status'])) return undefined;
  return { type: 'lookup', lookup: { round, tool, args: asRecord(payload.args) ?? {}, status: status as ChatTurnLookup['status'] } };
}

/**
 * Lookups carry no call id, so a round's start and finish are matched on `(round, tool, args)` and upserted.
 * Appending would double the trace whenever the backlog replays it — which every reconnect does.
 */
function mergeLookup(lookups: ChatTurnLookup[], lookup: ChatTurnLookup): ChatTurnLookup[] {
  const key = (entry: ChatTurnLookup): string => `${entry.round}\u0000${entry.tool}\u0000${JSON.stringify(entry.args)}`;
  const index = lookups.findIndex(entry => key(entry) === key(lookup));
  if (index < 0) return [...lookups, lookup];
  return lookups.map((entry, at) => (at === index ? lookup : entry));
}

/**
 * The whole wire protocol as one pure function. `reset` voids the deltas and only the deltas — the lookups
 * already ran and the replay that follows a reconnect re-states them. `error` keeps the partial text and
 * marks the turn failed: it is what the model actually said, and no better text is coming.
 */
export function reduceChatTurnStream(state: ChatTurnStreamState, event: ChatTurnStreamEvent): ChatTurnStreamState {
  if (state.status === 'done' || state.status === 'failed' || state.status === 'stopped') return state;
  const progress: ChatTurnProgress = { reply: state.reply, lookups: state.lookups, userMessage: state.userMessage };
  if (event.type === 'reset') return { ...progress, status: 'streaming', reply: '' };
  if (event.type === 'delta') return { ...progress, status: 'streaming', reply: state.reply + event.text };
  if (event.type === 'user') return { ...progress, status: 'streaming', userMessage: event.message };
  if (event.type === 'lookup') return { ...progress, status: 'streaming', lookups: mergeLookup(state.lookups, event.lookup) };
  // `done` is authoritative, and a model that emits no top-level `reply` (§4.1) streams no deltas at all.
  if (event.type === 'done') return { ...progress, status: 'done', reply: event.turn.assistantMessage.content, turn: event.turn };
  return { ...progress, status: 'failed', failure: event.failure };
}

export interface ChatTurnHandlers {
  onSuccess?: (turn: ChatTurnResponse) => void;
  onError?: (error: ApiError, context: ChatTurnContext | undefined) => void;
}

export interface ChatTurnStopHandlers {
  onOutcome?: (outcome: CancelRunResponse['outcome']) => void;
  onError?: (error: ApiError) => void;
}

export interface ChatTurnSender {
  send: (content: string, handlers?: ChatTurnHandlers) => void;
  isPending: boolean;
  stream: ChatTurnStreamState;
  // The run this tab's own POST opened, without the composer having to read the stream's internals to find it.
  // Null once the turn ends, or if this tab has not sent one — a turn recovered from another tab or a refresh
  // is not represented here at all; the composer falls back to `TurnState.pending.runId` for that case, passing
  // it as `stop`'s override.
  runId: string | null;
  stop: (handlers?: ChatTurnStopHandlers, overrideRunId?: string) => void;
  stopping: boolean;
}

const UNKNOWN_TURN_FAILURE: ChatTurnFailure = { code: 'UNKNOWN', message: 'Something went wrong. Please try again later' };

// The frame carries a code and a message and nothing else, so the status and type the transport's error
// shape needs are supplied here rather than read off a response that was never sent.
function turnFailureError(failure: ChatTurnFailure): ApiError {
  return new ApiError(500, { code: failure.code, message: failure.message, type: 'UnknownError' });
}

/**
 * Runs a turn over SSE, reducing its events into renderable state, and falls back to `useChatTurnMutation`
 * where `EventSource` does not exist (SSR, old browsers) — `send` behaves the same either way, so a caller
 * reads `stream` for the live reply and never has to know which path ran.
 *
 * A stream that dies mid-turn is not a failed turn: the run persists server-side either way, so the hook
 * hands it back to the transcript's own poll instead of reporting a failure the author never suffered.
 */
export function useChatTurnStream(projectId: string, sessionId: string): ChatTurnSender {
  const queryClient = useQueryClient();
  const fallback = useChatTurnMutation(projectId, sessionId);
  const cancelRun = useCancelRunMutation(projectId);
  const [stream, setStream] = useState<ChatTurnStreamState>(idleChatTurnStream);
  const [streaming, setStreaming] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const sourceRef = useRef<EventSource | undefined>(undefined);
  const mountedRef = useRef(true);
  const tokenRef = useRef(0);
  // Set synchronously on the first press, ahead of the mutation resolving, so a double-press before the
  // network answers is a no-op rather than a second cancel in flight.
  const stoppingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Retires the in-flight turn's token too, so a POST that resolves after unmount opens no stream.
      // tokenRef is a generation counter, not a DOM ref: the cleanup must invalidate whichever run is
      // current at teardown, not one captured at effect setup, so reading `.current` here is correct.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      tokenRef.current++;
      sourceRef.current?.close();
      sourceRef.current = undefined;
    };
  }, [projectId, sessionId]);

  const run = async (content: string, handlers?: ChatTurnHandlers): Promise<void> => {
    const token = ++tokenRef.current;
    const current = (): boolean => mountedRef.current && tokenRef.current === token;
    sourceRef.current?.close();
    sourceRef.current = undefined;
    setStream(idleChatTurnStream);
    setStreaming(true);
    setRunId(null);
    const context = await beginChatTurn(queryClient, projectId, sessionId, content);

    let openedRunId: string;
    try {
      ({ runId: openedRunId } = await APIRequest.post(`/projects/${projectId}/chats/${sessionId}/turn/stream`).body({ content }).execute<ChatTurnStreamResponse>());
    } catch (err) {
      rollbackChatTurn(queryClient, projectId, sessionId, context);
      invalidateChat(queryClient, projectId, sessionId);
      if (current()) setStreaming(false);
      handlers?.onError?.(isApiError(err) ? err : turnFailureError(UNKNOWN_TURN_FAILURE), context);
      return;
    }
    if (!current()) return;
    setRunId(openedRunId);

    const source = new EventSource(`${APIRequest.basePath}/projects/${projectId}/turns/${openedRunId}/stream`);
    sourceRef.current = source;
    const close = (): void => {
      source.close();
      if (sourceRef.current === source) sourceRef.current = undefined;
    };

    for (const name of CHAT_TURN_EVENTS) {
      source.addEventListener(name, message => {
        const event = parseChatTurnEvent(name, message.data);
        if (!event) return;
        const terminal = event.type === 'done' || event.type === 'error';
        if (terminal) close();
        if (current()) setStream(state => reduceChatTurnStream(state, event));
        if (!terminal) return;
        if (current()) {
          setStreaming(false);
          setRunId(null);
        }
        invalidateChat(queryClient, projectId, sessionId);
        if (event.type === 'done') handlers?.onSuccess?.(event.turn);
        // The turn recorded its own failure, so the transcript's failed-turn card is the authority and the
        // optimistic message stands; the caller is told only so it can speak for a failure nothing shows.
        else handlers?.onError?.(turnFailureError(event.failure), context);
      });
    }

    // EventSource reconnects a dropped stream itself and the replay resynchronises it; a stream left closed
    // (an expired or unknown run answers 404) means the events are gone, not the turn.
    source.onerror = () => {
      if (source.readyState !== EventSource.CLOSED) return;
      close();
      // The turn itself is not known to have ended — only this stream — so `TurnState.pending.runId`
      // (read off the transcript's own poll, which is still authoritative) is what a Stop press falls
      // back to once this tab's own runId goes null.
      if (current()) {
        setStreaming(false);
        setRunId(null);
      }
      invalidateChat(queryClient, projectId, sessionId);
    };
  };

  const send = (content: string, handlers?: ChatTurnHandlers): void => {
    if (typeof EventSource === 'undefined') {
      fallback.mutate(content, { onSuccess: turn => handlers?.onSuccess?.(turn), onError: (err, _content, context) => handlers?.onError?.(err, context) });
      return;
    }
    void run(content, handlers);
  };

  // Idempotent: the ref guard blocks a double-press before the mutation resolves, and the state guard
  // blocks one queued after it resolved but before this render committed.
  const stop = (handlers?: ChatTurnStopHandlers, overrideRunId?: string): void => {
    // `overrideRunId` is a turn this hook never opened — recovered from `TurnState.pending` after a refresh
    // or from another tab — so cancelling it must not touch this hook's own (unrelated, likely idle) stream.
    const target = overrideRunId ?? runId;
    const ownTurn = target === runId;
    if (!target || stoppingRef.current || stopping) return;
    stoppingRef.current = true;
    setStopping(true);
    // Freezes the token this cancel belongs to: if a new turn starts (or the component unmounts) before
    // the mutation resolves, `current()` goes false and the stale response can no longer touch this turn's
    // now-irrelevant stream or state.
    const token = tokenRef.current;
    const current = (): boolean => mountedRef.current && tokenRef.current === token;
    cancelRun.mutate(target, {
      onSuccess: result => {
        stoppingRef.current = false;
        setStopping(false);
        // `stopping`: the signal reached the run. `already_settled` and `not_delivered` touch nothing here:
        // the first means the turn's own `done`/`error` frame has already arrived or is about to, over
        // whichever stream is watching it; the second means the abort was never delivered, so the run may
        // still be going and must not be told otherwise.
        if (result.outcome === 'stopping') {
          invalidateChat(queryClient, projectId, sessionId);
          // Freeze whatever text streamed so far as `stopped` (§S6) — the same partial-text-survives
          // treatment `error` gets, never `reset`'s discard — but only for the stream this hook owns.
          if (ownTurn && current()) {
            sourceRef.current?.close();
            sourceRef.current = undefined;
            setStreaming(false);
            setRunId(null);
            setStream(state => (state.status === 'idle' || state.status === 'streaming' ? { ...state, status: 'stopped' } : state));
          }
        }
        handlers?.onOutcome?.(result.outcome);
      },
      onError: err => {
        stoppingRef.current = false;
        setStopping(false);
        handlers?.onError?.(err);
      },
    });
  };

  return { send, isPending: streaming || fallback.isPending, stream, runId, stop, stopping };
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
