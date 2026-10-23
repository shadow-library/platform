import { Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { RUN_OWNER_SILENCE_MS } from '../ai/graphs/run-liveness';
import { type TurnRunLiveness } from './turn-event.repository';
import { TERMINAL_TURN_EVENTS, type TurnEventRecord, type TurnStreamFrame, type TurnStreamListener } from './turn-stream.types';

export interface TurnEventSource {
  eventsAfter(projectId: bigint, runId: string, after: number, limit: number): Promise<TurnEventRecord[]>;
  runLiveness(runId: string): Promise<TurnRunLiveness | null>;
}

export interface TurnEventFollowerOptions {
  pollMs?: number;
  /** How long the stream may go without a frame before the run's replica is asked whether it is still alive. */
  livenessCheckMs?: number;
  ownerSilenceMs?: number;
}

// Bun's SQL client has no LISTEN, so a follower polls; this keeps a streamed reply within a beat of the writer's own coalescing window.
const DEFAULT_POLL_MS = 250;
const DEFAULT_LIVENESS_CHECK_MS = 5_000;
const PAGE = 200;

const RESET_FRAME: TurnStreamFrame = { event: 'reset', data: '{}' };

type Drained = 'open' | 'ended';

function errorFrame(code: AppErrorCode): TurnStreamFrame {
  return { event: 'error', data: JSON.stringify(code.create().toResponse()) };
}

/** Why a stream ended without its own terminal frame; a settled run cannot be answered with `done` (it needs the reply), so each status gets an error saying what happened. */
function endingOf(run: TurnRunLiveness | null): AppErrorCode {
  if (!run) return AppErrorCode.CHT_007;
  if (run.status === 'running') return AppErrorCode.CHT_013;
  if (run.status === 'cancelled') return AppErrorCode.AI_013;
  return run.status === 'failed' ? AppErrorCode.CHT_015 : AppErrorCode.CHT_014;
}

/** Reads one client's turn stream on any replica: no cursor replays behind a leading `reset`, a cursor resumes; ends with its own `error` once the run's replica goes silent. */
export class TurnEventFollower {
  private readonly logger = Logger.getLogger(APP_NAME, TurnEventFollower.name);
  private readonly pollMs: number;
  private readonly livenessCheckMs: number;
  private readonly ownerSilenceMs: number;
  private cursor: number;
  private replay: boolean;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private quietSince: number;

  constructor(
    private readonly source: TurnEventSource,
    private readonly projectId: bigint,
    private readonly runId: string,
    after: number | null,
    private readonly listener: TurnStreamListener,
    options: TurnEventFollowerOptions = {},
    now = Date.now(),
  ) {
    this.pollMs = options.pollMs ?? DEFAULT_POLL_MS;
    this.livenessCheckMs = options.livenessCheckMs ?? DEFAULT_LIVENESS_CHECK_MS;
    this.ownerSilenceMs = options.ownerSilenceMs ?? RUN_OWNER_SILENCE_MS;
    this.cursor = after ?? 0;
    this.replay = after === null;
    this.quietSince = now;
  }

  start(): void {
    void this.loop();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** One read: sends every stored frame past the cursor, and answers whether the stream stays open. */
  async pull(now = Date.now()): Promise<boolean> {
    if (this.replay) {
      this.replay = false;
      if (!this.deliver(RESET_FRAME)) return false;
    }
    if ((await this.drain(now)) === 'ended') return false;
    if (now - this.quietSince < this.livenessCheckMs) return true;
    return this.runAlive(now);
  }

  private async drain(now: number): Promise<Drained> {
    for (;;) {
      const page = await this.source.eventsAfter(this.projectId, this.runId, this.cursor, PAGE);
      if (page.length > 0) this.quietSince = now;
      for (const record of page) {
        if (!this.deliver({ id: String(record.seq), event: record.event, data: record.data })) return 'ended';
        this.cursor = record.seq;
        if (TERMINAL_TURN_EVENTS.has(record.event)) return 'ended';
      }
      if (page.length < PAGE) return 'open';
    }
  }

  /** The run's last sign of life — a heartbeat, or settling — is what counts, so a settled run gets the writer's whole retry budget for its end. */
  private async runAlive(now: number): Promise<boolean> {
    this.quietSince = now;
    const run = await this.source.runLiveness(this.runId);
    if (run && run.silentMs <= this.ownerSilenceMs) return true;
    // One more read, so a terminal frame stored since the last one is sent rather than talked over.
    if ((await this.drain(now)) === 'ended') return false;
    this.logger.warn('turn stream ended without its terminal frame', { runId: this.runId, status: run?.status, silentMs: run?.silentMs, cursor: this.cursor });
    this.deliver(errorFrame(endingOf(run)));
    return false;
  }

  private async loop(): Promise<void> {
    let open = true;
    let delay = this.pollMs;
    try {
      open = await this.pull();
    } catch (err) {
      this.logger.warn('turn stream read failed', { runId: this.runId, err });
      delay = this.livenessCheckMs;
    }
    if (!open) this.stop();
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.loop(), delay);
    this.timer.unref();
  }

  /** A listener that throws is a client gone, never a failure of the read loop. */
  private deliver(frame: TurnStreamFrame): boolean {
    if (this.stopped) return false;
    try {
      if (this.listener(frame)) return true;
    } catch (err) {
      this.logger.warn('turn stream subscriber threw — stopping its stream', { runId: this.runId, err });
    }
    this.stop();
    return false;
  }
}
