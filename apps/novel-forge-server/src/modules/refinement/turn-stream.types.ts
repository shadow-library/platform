/**
 * `delta` (`{ text }`) and `change` (a `ChatChangeEvent`) belong to the reply being written; `reset` voids both, as the reply they built
 * was replaced, and a `change` index restarts after it. Both are provisional: `done` alone says what the turn applied and carded.
 */
export type TurnStreamEventName = 'user' | 'lookup' | 'delta' | 'change' | 'reset' | 'done' | 'error';

export interface TurnStreamFrame {
  event: TurnStreamEventName;
  /** Already-serialised JSON: the transport writes it verbatim, so a `bigint` in a turn result cannot reach `JSON.stringify` unguarded. */
  data: string;
  /** The frame's `seq`, which a reconnecting client sends back as `Last-Event-ID`; absent on a frame that was never stored. */
  id?: string;
}

/** Returns `false` once its transport has closed, so the follower stops reading for a client that has gone. */
export type TurnStreamListener = (frame: TurnStreamFrame) => boolean;

export interface TurnEventRecord {
  seq: number;
  event: TurnStreamEventName;
  /** The frame's JSON text. Stored as jsonb, so a replay sends the same values with jsonb's key order. */
  data: string;
}

export const TERMINAL_TURN_EVENTS: ReadonlySet<TurnStreamEventName> = new Set(['done', 'error']);
