import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

import { TERMINAL_TURN_EVENTS, type TurnEventRecord, type TurnStreamEventName } from './turn-stream.types';

export interface TurnEventSink {
  append(projectId: bigint, runId: string, records: TurnEventRecord[]): Promise<void>;
}

export interface TurnEventLogOptions {
  /** How long frames gather before they are written together, consecutive deltas as one. */
  coalesceMs?: number;
  /** How many times a batch is written before it is given up on. */
  attempts?: number;
  /** The same for a batch carrying `done` or `error`, which a reader cannot do without. */
  terminalAttempts?: number;
  /** The first retry's delay; each later one doubles it, up to `MAX_RETRY_DELAY_MS`. */
  retryDelayMs?: number;
}

type PendingFrame = { seq: number; event: 'delta'; text: string } | { seq: number; event: TurnStreamEventName; data: unknown };

const DEFAULT_COALESCE_MS = 100;
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_TERMINAL_ATTEMPTS = 7;
const DEFAULT_RETRY_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 8_000;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function retryDelayMs(baseMs: number, attempt: number): number {
  return Math.min(baseMs * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
}

/** How long a terminal batch is retried for at the defaults: inside `RUN_OWNER_SILENCE_MS`, so no reader gives up on an end still being written. */
export const TERMINAL_RETRY_BUDGET_MS = Array.from({ length: DEFAULT_TERMINAL_ATTEMPTS - 1 }, (_, index) => retryDelayMs(DEFAULT_RETRY_DELAY_MS, index + 1)).reduce(
  (total, delay) => total + delay,
  0,
);

function wellFormed(text: string): string {
  return text.replace(LONE_SURROGATE, '\uFFFD').replaceAll('\u0000', '\uFFFD');
}

/** `bigint`s become strings; a NUL or lone surrogate becomes U+FFFD because jsonb rejects both and a rejected `done` frame would never reach a reader. */
export function encodeFrameData(data: unknown): string {
  return JSON.stringify(data, (_key, value: unknown) => {
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'string') return wellFormed(value);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
    const keys = Object.keys(value);
    if (keys.every(key => wellFormed(key) === key)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [wellFormed(key), entry]));
  });
}

function toRecord(frame: PendingFrame): TurnEventRecord {
  const data = 'text' in frame ? { text: frame.text } : frame.data;
  return { seq: frame.seq, event: frame.event, data: encodeFrameData(data) };
}

/**
 * The writing half of a turn's stream on the replica running it, sole writer of its frames: it numbers them and writes batches in order, so a reader at `seq` n has seen all below.
 * Frames gather for `coalesceMs` and go as one insert with consecutive deltas merged; a terminal frame flushes at once.
 */
export class TurnEventLog {
  private readonly logger = Logger.getLogger(APP_NAME, TurnEventLog.name);
  private readonly coalesceMs: number;
  private readonly attempts: number;
  private readonly terminalAttempts: number;
  private readonly retryDelayMs: number;
  private seq = 0;
  private pending: PendingFrame[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writes: Promise<void> = Promise.resolve();
  private ended = false;

  constructor(
    private readonly sink: TurnEventSink,
    readonly projectId: bigint,
    readonly runId: string,
    options: TurnEventLogOptions = {},
  ) {
    this.coalesceMs = options.coalesceMs ?? DEFAULT_COALESCE_MS;
    this.attempts = options.attempts ?? DEFAULT_ATTEMPTS;
    this.terminalAttempts = options.terminalAttempts ?? DEFAULT_TERMINAL_ATTEMPTS;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  get closed(): boolean {
    return this.ended;
  }

  delta(text: string): void {
    if (this.ended) return;
    const last = this.pending.at(-1);
    if (last && 'text' in last) last.text += text;
    else this.pending.push({ seq: ++this.seq, event: 'delta', text });
    this.schedule();
  }

  /** A delta goes through `delta`, where it can merge with its neighbours. */
  append(event: Exclude<TurnStreamEventName, 'delta' | 'done' | 'error'>, data: unknown): void {
    if (this.ended) return;
    this.pending.push({ seq: ++this.seq, event, data });
    this.schedule();
  }

  /** Resolves once the terminal frame, and everything before it, has been written or given up on. Later frames are dropped. */
  finish(event: 'done' | 'error', data: unknown): Promise<void> {
    if (this.ended) return this.writes;
    this.pending.push({ seq: ++this.seq, event, data });
    this.ended = true;
    return this.flush();
  }

  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.pending.length === 0) return this.writes;
    const batch = this.pending.map(toRecord);
    this.pending = [];
    this.writes = this.writes.then(() => this.write(batch));
    return this.writes;
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => void this.flush(), this.coalesceMs);
    this.timer.unref();
  }

  // A batch given up on leaves a gap in `seq`, which readers step over: the turn's `done` carries the whole reply, so a lost delta costs
  // only the live view of it.
  private async write(batch: TurnEventRecord[]): Promise<void> {
    const attempts = batch.some(record => TERMINAL_TURN_EVENTS.has(record.event)) ? this.terminalAttempts : this.attempts;
    for (let attempt = 1; ; attempt++) {
      try {
        await this.sink.append(this.projectId, this.runId, batch);
        return;
      } catch (err) {
        const range = { runId: this.runId, from: batch[0]?.seq, to: batch.at(-1)?.seq, attempt };
        if (attempt >= attempts) return this.logger.warn('turn stream frames could not be saved — readers will skip them', { ...range, err });
        this.logger.debug('turn stream frames failed to save — retrying', { ...range, err });
        await new Promise(resolve => setTimeout(resolve, retryDelayMs(this.retryDelayMs, attempt)));
      }
    }
  }
}
