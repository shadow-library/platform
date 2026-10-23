import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { type CancelRunResponse, type ChatMessageResponse, type ChatTurnResponse, type ChatTurnStreamResponse } from './api-types.gen';
import { ApiError, APIRequest, isApiError } from './transport';
import { beginChatTurn, type ChatTurnContext, rollbackChatTurn } from './chat-turn-cache';
import { type ChatTurnVariables, invalidateChat, useCancelRunMutation, useChatTurnMutation } from './chat-session.api';

/**
 * The turn stream. The SSE route hijacks its reply, so it has no generated response type and the
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

const CHANGE_GROUPS = ['premise', 'pages', 'people', 'places', 'power', 'threads', 'other'] as const;

export type ChatTurnChangeGroup = (typeof CHANGE_GROUPS)[number];

export interface ChatTurnChange {
  index: number;
  op: string;
  label: string;
  group: ChatTurnChangeGroup;
}

export type ChatTurnStreamEvent =
  | { type: 'user'; message: ChatMessageResponse }
  | { type: 'lookup'; lookup: ChatTurnLookup }
  | { type: 'delta'; text: string }
  | { type: 'change'; change: ChatTurnChange }
  | { type: 'reset' }
  | { type: 'done'; turn: ChatTurnResponse }
  | { type: 'error'; failure: ChatTurnFailure };

export interface ChatTurnTiming {
  startedAt: number | null;
  endedAt: number | null;
  waitingSince: number | null;
  writingSince: number | null;
  lastWrite: 'reply' | 'change' | null;
  thoughtMs: number;
  /** When the current reply's first words and first change arrived; a `reset` clears both with the reply they belonged to. */
  replyAt: number | null;
  changeAt: number | null;
}

interface ChatTurnProgress {
  reply: string;
  lookups: ChatTurnLookup[];
  changes: ChatTurnChange[];
  userMessage: ChatMessageResponse | null;
  timing: ChatTurnTiming;
}

export type ChatTurnStreamState =
  | (ChatTurnProgress & { status: 'idle' | 'streaming' })
  | (ChatTurnProgress & { status: 'done'; turn: ChatTurnResponse })
  | (ChatTurnProgress & { status: 'failed'; failure: ChatTurnFailure })
  // The author stopped the turn themselves — distinct from `failed`: nothing went wrong, and there is no
  // error to show. Reuses the `error` precedent of keeping the partial reply rather than voiding it.
  | (ChatTurnProgress & { status: 'stopped' });

const EMPTY_TIMING: ChatTurnTiming = {
  startedAt: null,
  endedAt: null,
  waitingSince: null,
  writingSince: null,
  lastWrite: null,
  thoughtMs: 0,
  replyAt: null,
  changeAt: null,
};

export const idleChatTurnStream: ChatTurnStreamState = { status: 'idle', reply: '', lookups: [], changes: [], userMessage: null, timing: EMPTY_TIMING };

export function startChatTurnStream(at: number): ChatTurnStreamState {
  return { ...idleChatTurnStream, timing: { ...EMPTY_TIMING, startedAt: at, waitingSince: at } };
}

const CHAT_TURN_EVENTS = ['user', 'lookup', 'delta', 'change', 'reset', 'done', 'error'] as const;
const LOOKUP_STATUSES = ['running', 'ok', 'error'] as const;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function parseChange(payload: Record<string, unknown>): ChatTurnChange | undefined {
  const { index, op, label, group } = payload;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return undefined;
  if (typeof op !== 'string' || op === '' || typeof label !== 'string') return undefined;
  if (!CHANGE_GROUPS.includes(group as ChatTurnChangeGroup)) return undefined;
  return { index, op, label, group: group as ChatTurnChangeGroup };
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
  if (name === 'change') {
    const change = parseChange(payload);
    return change ? { type: 'change', change } : undefined;
  }
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
 * Appending would double the trace whenever the backlog replays it — which every reconnect does. A settled lookup is final: the replay
 * re-states it as running first, and honouring that would restart the think clock, so such an event is dropped (`undefined`).
 */
function mergeLookup(lookups: ChatTurnLookup[], lookup: ChatTurnLookup): ChatTurnLookup[] | undefined {
  const key = (entry: ChatTurnLookup): string => `${entry.round}\u0000${entry.tool}\u0000${JSON.stringify(entry.args)}`;
  const index = lookups.findIndex(entry => key(entry) === key(lookup));
  if (index < 0) return [...lookups, lookup];
  if (lookups[index]?.status !== 'running') return undefined;
  return lookups.map((entry, at) => (at === index ? lookup : entry));
}

function mergeChange(changes: ChatTurnChange[], change: ChatTurnChange): ChatTurnChange[] {
  const at = changes.findIndex(entry => entry.index === change.index);
  if (at >= 0) return changes.map((entry, position) => (position === at ? change : entry));
  return [...changes, change].sort((a, b) => a.index - b.index);
}

function beganAt(timing: ChatTurnTiming, at: number): ChatTurnTiming {
  return timing.startedAt === null ? { ...timing, startedAt: at, waitingSince: at } : timing;
}

function lookupTiming(timing: ChatTurnTiming, lookups: ChatTurnLookup[], at: number): ChatTurnTiming {
  const running = lookups.some(entry => entry.status === 'running');
  const base = { ...timing, writingSince: null, lastWrite: null };
  return { ...base, waitingSince: running ? null : (timing.waitingSince ?? at) };
}

function writeTiming(timing: ChatTurnTiming, at: number, kind: 'reply' | 'change'): ChatTurnTiming {
  const next = kind === 'reply' ? { ...timing, lastWrite: kind, replyAt: timing.replyAt ?? at } : { ...timing, lastWrite: kind, changeAt: timing.changeAt ?? at };
  if (next.writingSince !== null) return next;
  const thought = next.waitingSince === null ? 0 : Math.max(0, at - next.waitingSince);
  return { ...next, thoughtMs: next.thoughtMs + thought, waitingSince: null, writingSince: at };
}

/**
 * The whole wire protocol as one pure function; `at` is the arrival time the caller stamps on the event. `reset` voids the reply and the
 * changes written so far and only those — the lookups already ran and the replay that follows a reconnect re-states them. `error` keeps
 * the partial text and marks the turn failed: it is what the model actually said, and no better text is coming. Changes are provisional:
 * `done` is authoritative for what was applied or carded and clears them.
 */
export function reduceChatTurnStream(state: ChatTurnStreamState, event: ChatTurnStreamEvent, at: number): ChatTurnStreamState {
  if (state.status === 'done' || state.status === 'failed' || state.status === 'stopped') return state;
  const timing = beganAt(state.timing, at);
  const progress: ChatTurnProgress = { reply: state.reply, lookups: state.lookups, changes: state.changes, userMessage: state.userMessage, timing };
  if (event.type === 'reset') {
    const waitingSince = state.lookups.some(entry => entry.status === 'running') ? null : (timing.waitingSince ?? at);
    const cleared = { ...timing, writingSince: null, lastWrite: null, waitingSince, replyAt: null, changeAt: null };
    return { ...progress, status: 'streaming', reply: '', changes: [], timing: cleared };
  }
  if (event.type === 'delta') {
    const written = event.text === '' ? timing : writeTiming(timing, at, 'reply');
    return { ...progress, status: 'streaming', reply: state.reply + event.text, timing: written };
  }
  if (event.type === 'change') return { ...progress, status: 'streaming', changes: mergeChange(state.changes, event.change), timing: writeTiming(timing, at, 'change') };
  if (event.type === 'user') return { ...progress, status: 'streaming', userMessage: event.message };
  if (event.type === 'lookup') {
    const lookups = mergeLookup(state.lookups, event.lookup);
    if (!lookups) return { ...progress, status: 'streaming', timing: lookupTiming(timing, state.lookups, at) };
    return { ...progress, status: 'streaming', lookups, timing: lookupTiming(timing, lookups, at) };
  }
  const ended = { ...timing, endedAt: at, writingSince: null };
  // `done` is authoritative, and a model that emits no top-level `reply` streams no deltas at all.
  if (event.type === 'done') return { ...progress, status: 'done', changes: [], reply: event.turn.assistantMessage.content, turn: event.turn, timing: ended };
  return { ...progress, status: 'failed', failure: event.failure, timing: ended };
}

/**
 * What one stream event does to the stream. `lost`: the turn finished but the server's stream lost its reply (`CHT_014`), so it is a
 * dropped stream rather than a failed turn — the transcript carries the reply, and nothing the author sent needs sending again.
 */
export type ChatTurnStreamEnding = 'open' | 'done' | 'failed' | 'lost';

const LOST_REPLY_CODE = 'CHT_014';

export function chatTurnStreamEnding(event: ChatTurnStreamEvent): ChatTurnStreamEnding {
  if (event.type === 'done') return 'done';
  if (event.type !== 'error') return 'open';
  return event.failure.code === LOST_REPLY_CODE ? 'lost' : 'failed';
}

export function stopChatTurnStream(state: ChatTurnStreamState, at: number): ChatTurnStreamState {
  if (state.status !== 'idle' && state.status !== 'streaming') return state;
  return { ...state, status: 'stopped', timing: { ...beganAt(state.timing, at), endedAt: at, writingSince: null } };
}

export interface ChatTurnHandlers {
  /** The server took the turn: its passages anchored and the author's message stored. */
  onAccepted?: () => void;
  onSuccess?: (turn: ChatTurnResponse) => void;
  onError?: (error: ApiError, context: ChatTurnContext | undefined) => void;
}

export interface ChatTurnStopHandlers {
  onOutcome?: (outcome: CancelRunResponse['outcome']) => void;
  onError?: (error: ApiError) => void;
}

export interface ChatTurnSender {
  send: (content: string, handlers?: ChatTurnHandlers, options?: Omit<ChatTurnVariables, 'content'>) => void;
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

  const run = async ({ shown, ...request }: ChatTurnVariables, handlers?: ChatTurnHandlers): Promise<void> => {
    const { content } = request;
    const token = ++tokenRef.current;
    const current = (): boolean => mountedRef.current && tokenRef.current === token;
    sourceRef.current?.close();
    sourceRef.current = undefined;
    setStream(startChatTurnStream(Date.now()));
    setStreaming(true);
    setRunId(null);
    const context = await beginChatTurn(queryClient, projectId, sessionId, content, shown);

    let openedRunId: string;
    try {
      ({ runId: openedRunId } = await APIRequest.post(`/projects/${projectId}/chats/${sessionId}/turn/stream`).body(request).execute<ChatTurnStreamResponse>());
    } catch (err) {
      rollbackChatTurn(queryClient, projectId, sessionId, context);
      invalidateChat(queryClient, projectId, sessionId);
      if (current()) setStreaming(false);
      handlers?.onError?.(isApiError(err) ? err : turnFailureError(UNKNOWN_TURN_FAILURE), context);
      return;
    }
    handlers?.onAccepted?.();
    if (!current()) return;
    setRunId(openedRunId);

    const source = new EventSource(`${APIRequest.basePath}/projects/${projectId}/turns/${openedRunId}/stream`);
    sourceRef.current = source;
    const close = (): void => {
      source.close();
      if (sourceRef.current === source) sourceRef.current = undefined;
    };
    // The turn itself is not known to have failed — only this stream — so `TurnState.pending.runId`
    // (read off the transcript's own poll, which is still authoritative) is what a Stop press falls
    // back to once this tab's own runId goes null.
    const lose = (): void => {
      close();
      if (current()) {
        setStreaming(false);
        setRunId(null);
      }
      invalidateChat(queryClient, projectId, sessionId);
    };

    for (const name of CHAT_TURN_EVENTS) {
      source.addEventListener(name, message => {
        const event = parseChatTurnEvent(name, message.data);
        if (!event) return;
        const ending = chatTurnStreamEnding(event);
        if (ending === 'lost') return lose();
        if (ending !== 'open') close();
        const arrivedAt = Date.now();
        if (current()) setStream(state => reduceChatTurnStream(state, event, arrivedAt));
        if (ending === 'open') return;
        if (current()) {
          setStreaming(false);
          setRunId(null);
        }
        invalidateChat(queryClient, projectId, sessionId);
        if (event.type === 'done') handlers?.onSuccess?.(event.turn);
        // The turn recorded its own failure, so the transcript's failed-turn card is the authority and the
        // optimistic message stands; the caller is told only so it can speak for a failure nothing shows.
        else if (event.type === 'error') handlers?.onError?.(turnFailureError(event.failure), context);
      });
    }

    // EventSource reconnects a dropped stream itself, and its `Last-Event-ID` resumes the turn where it left off; a stream
    // left closed (an expired or unknown run answers 404) means the events are gone, not the turn.
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) lose();
    };
  };

  const send = (content: string, handlers?: ChatTurnHandlers, options?: Omit<ChatTurnVariables, 'content'>): void => {
    const request = { content, ...options };
    if (typeof EventSource === 'undefined') {
      const onSuccess = (turn: ChatTurnResponse): void => {
        handlers?.onAccepted?.();
        handlers?.onSuccess?.(turn);
      };
      fallback.mutate(request, { onSuccess, onError: (err, _request, context) => handlers?.onError?.(err, context) });
      return;
    }
    void run(request, handlers);
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
          // Freeze whatever text streamed so far as `stopped` — the same partial-text-survives
          // treatment `error` gets, never `reset`'s discard — but only for the stream this hook owns.
          if (ownTurn && current()) {
            sourceRef.current?.close();
            sourceRef.current = undefined;
            setStreaming(false);
            setRunId(null);
            const stoppedAt = Date.now();
            setStream(state => stopChatTurnStream(state, stoppedAt));
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
