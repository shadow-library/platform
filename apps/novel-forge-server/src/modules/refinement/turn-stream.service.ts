import { Injectable } from '@shadow-library/app';
import { AppError, ErrorCode, Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { ChatService, type ChatTurnEmitter } from './chat.service';
import { serialiseMessage, serialiseTurn } from './serialise';

export type TurnStreamEventName = 'user' | 'lookup' | 'delta' | 'reset' | 'done' | 'error';

export interface TurnStreamFrame {
  event: TurnStreamEventName;
  /** Already-serialised JSON: the transport writes it verbatim, so a `bigint` in a turn result cannot reach `JSON.stringify` unguarded. */
  data: string;
}

/** Returns `false` once its transport has closed, so the run drops a subscriber that outlived its client. */
export type TurnStreamListener = (frame: TurnStreamFrame) => boolean;

interface TurnStreamRun {
  runId: string;
  projectId: bigint;
  backlog: TurnStreamFrame[];
  backlogChars: number;
  truncated: boolean;
  terminal: TurnStreamFrame | null;
  listeners: Set<TurnStreamListener>;
  expiry: ReturnType<typeof setTimeout>;
}

// A reply runs to a few tens of kilobytes; this is an order of magnitude of headroom, so the cap is
// reached only by a model that has stopped producing a reply and started producing a flood.
const MAX_BACKLOG_CHARS = 512 * 1024;

// How long a finished run's backlog outlives it. A stream watched to the end takes its run with it when
// it closes; this window covers the client that never connected and the one whose SSE connection dropped
// mid-turn and is reconnecting to the same run. The reply is durable in the transcript either way.
const TERMINAL_TTL_MS = 60_000;

// A turn that outlives this is already past the cutoff at which `pendingTurn` stops reporting it, so its
// buffer is leaked state rather than a stream anybody is still waiting on.
const RUN_MAX_TTL_MS = 20 * 60_000;

const RESET_FRAME: TurnStreamFrame = { event: 'reset', data: '{}' };

function encode(data: unknown): string {
  return JSON.stringify(data, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value));
}

/**
 * The turn stream's server half (design §4): the POST starts a turn and answers with its run id, the GET
 * subscribes to that run. Because the two are separate requests, every event a turn emits is buffered
 * under its run id and replayed on connect — otherwise a turn that opens faster than the client connects
 * loses its first deltas. The turn itself is owned here, not by either request, so neither a client that
 * never connects nor one that closes its tab mid-reply can abort it.
 */
@Injectable()
export class TurnStreamService {
  private readonly logger = Logger.getLogger(APP_NAME, TurnStreamService.name);
  private readonly runs = new Map<string, TurnStreamRun>();

  constructor(private readonly chatService: ChatService) {}

  /** Starts a turn and resolves with its run id as soon as the run exists — the turn goes on running behind the answer. */
  async start(projectId: bigint, sessionId: string, content: string): Promise<string> {
    const sink: { run: TurnStreamRun | null } = { run: null };
    let settle: (runId: string) => void = () => undefined;
    let fail: (err: unknown) => void = () => undefined;
    const started = new Promise<string>((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });

    const emitter: ChatTurnEmitter = {
      onRunId: runId => {
        sink.run = this.open(projectId, runId);
        settle(runId);
      },
      onUserMessage: message => this.emit(sink.run, 'user', serialiseMessage(message)),
      onLookup: event => this.emit(sink.run, 'lookup', event),
      onDelta: text => this.emit(sink.run, 'delta', { text }),
      onReset: () => this.emit(sink.run, 'reset', {}),
    };

    this.chatService.turn(projectId, sessionId, content, emitter).then(
      result => {
        // `onRunId` is the only thing that answers the POST, and `EmitterRelay` swallows a throw from it —
        // without this a turn that succeeded anyway would leave the request hanging forever.
        settle(result.runId);
        this.finish(sink.run, 'done', serialiseTurn(result));
      },
      (err: unknown) => {
        this.logger.warn('chat turn stream failed', { projectId, sessionId, runId: sink.run?.runId, err });
        this.finish(sink.run, 'error', AppError.is(err) ? err.toResponse() : { code: ErrorCode.UNKNOWN.code, message: ErrorCode.UNKNOWN.message });
        // A turn that dies before its run exists never answered the POST; once it exists the caller is
        // long gone and the failure rides the stream instead.
        fail(err);
      },
    );

    return started;
  }

  /** Throws before the route hijacks its response, so an unknown run answers 404 rather than an empty stream. */
  assertRun(projectId: bigint, runId: string): void {
    this.require(projectId, runId);
  }

  /** Replays the run's backlog to `listener`, then feeds it live until the returned unsubscribe runs. */
  subscribe(projectId: bigint, runId: string, listener: TurnStreamListener): () => void {
    const run = this.require(projectId, runId);
    const unsubscribe = (): void => {
      run.listeners.delete(listener);
      if (run.terminal && run.listeners.size === 0) this.drop(run);
    };

    // Every replay opens with a reset, because a subscriber is not necessarily a new one: `EventStream`
    // tells clients to reconnect after 3s, and the frames have no ids, so a reconnecting client would
    // otherwise append the whole backlog a second time on top of what it has already rendered.
    if (!this.deliver(run, listener, RESET_FRAME)) return unsubscribe;
    for (const frame of run.backlog) if (!this.deliver(run, listener, frame)) return unsubscribe;
    if (run.terminal && !this.deliver(run, listener, run.terminal)) return unsubscribe;

    // Registered even once the run has ended, so that a second client replayed the same finished run
    // holds it open until it too has gone.
    run.listeners.add(listener);
    return unsubscribe;
  }

  private require(projectId: bigint, runId: string): TurnStreamRun {
    const run = this.runs.get(runId);
    // Another project's run answers as missing: that an author elsewhere is mid-turn is not ours to confirm.
    if (!run || run.projectId !== projectId) throw AppErrorCode.CHT_007.create();
    return run;
  }

  private open(projectId: bigint, runId: string): TurnStreamRun {
    const run: TurnStreamRun = {
      runId,
      projectId,
      backlog: [],
      backlogChars: 0,
      truncated: false,
      terminal: null,
      listeners: new Set(),
      expiry: this.schedule(runId, RUN_MAX_TTL_MS),
    };
    this.runs.set(runId, run);
    return run;
  }

  private emit(run: TurnStreamRun | null, event: TurnStreamEventName, data: unknown): void {
    if (!run || run.terminal) return;
    const frame: TurnStreamFrame = { event, data: encode(data) };
    this.buffer(run, frame);
    this.dispatch(run, frame);
  }

  private finish(run: TurnStreamRun | null, event: 'done' | 'error', data: unknown): void {
    if (!run || run.terminal) return;
    run.terminal = { event, data: encode(data) };
    this.dispatch(run, run.terminal);
    clearTimeout(run.expiry);
    run.expiry = this.schedule(run.runId, TERMINAL_TTL_MS);
  }

  // Past the cap the backlog is discarded whole rather than replayed with a hole in the middle of the
  // reply; the replay's leading reset already tells a subscriber to render nothing until the live events.
  private buffer(run: TurnStreamRun, frame: TurnStreamFrame): void {
    if (run.truncated) return;
    run.backlog.push(frame);
    run.backlogChars += frame.data.length;
    if (run.backlogChars <= MAX_BACKLOG_CHARS) return;
    this.logger.warn('turn stream backlog exceeded its cap — replay for this run is dropped', { runId: run.runId, chars: run.backlogChars });
    run.backlog = [];
    run.backlogChars = 0;
    run.truncated = true;
  }

  private dispatch(run: TurnStreamRun, frame: TurnStreamFrame): void {
    // A copy: a subscriber that closes on the terminal frame unsubscribes itself from inside this loop.
    for (const listener of [...run.listeners]) if (!this.deliver(run, listener, frame)) run.listeners.delete(listener);
  }

  /** One client's socket is never allowed to fail the others, nor to escape into the turn's emitter or the floating turn promise. */
  private deliver(run: TurnStreamRun, listener: TurnStreamListener, frame: TurnStreamFrame): boolean {
    try {
      return listener(frame);
    } catch (err) {
      this.logger.warn('turn stream subscriber threw — dropping it', { runId: run.runId, err });
      return false;
    }
  }

  private schedule(runId: string, delay: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      const run = this.runs.get(runId);
      if (run) this.drop(run);
    }, delay);
    timer.unref();
    return timer;
  }

  private drop(run: TurnStreamRun): void {
    clearTimeout(run.expiry);
    run.listeners.clear();
    this.runs.delete(run.runId);
  }
}
