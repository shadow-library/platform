import { type ChatTurnStreamState } from '@/lib/apis';
import { type TurnChoice } from '@/lib/chat-model';

type StreamStatus = ChatTurnStreamState['status'];

export interface TurnSettings {
  proseEdits: boolean;
  justDiscussing: boolean;
  choice?: TurnChoice;
}

export interface QueuedTurn extends TurnSettings {
  content: string;
  /** This tab's own turn was running when the message was queued; a turn started elsewhere never releases it. */
  watching: boolean;
  /** The reply this tab's stream had finished before queueing, so a stale `done` is never mistaken for the turn being waited on. */
  after?: string;
}

export type QueueStep = 'none' | 'waiting' | 'send' | 'held';

export interface QueueState {
  queued: QueuedTurn | undefined;
  running: boolean;
  locked: boolean;
  stream: StreamStatus;
  finishedId: string | undefined;
  inTranscript: boolean;
}

/** Only a reply of the turn this tab was watching, finished cleanly and already in the transcript, releases the queue; anything else leaves the message for the author. */
export function queueStep({ queued, running, locked, stream, finishedId, inTranscript }: QueueState): QueueStep {
  if (!queued) return 'none';
  if (running) return 'waiting';
  if (locked || !queued.watching || stream !== 'done' || !finishedId || finishedId === queued.after) return 'held';
  return inTranscript ? 'send' : 'waiting';
}

export interface QueuedView {
  text: string;
  note?: string;
  held: boolean;
}

export function queuedNote(stream: StreamStatus): string {
  if (stream === 'failed') return 'The reply failed, so this is waiting for you.';
  if (stream === 'stopped') return 'You stopped the reply, so this is waiting for you.';
  return 'Waiting for you.';
}

export function queuedView(queued: QueuedTurn | undefined, step: QueueStep, stream: StreamStatus): QueuedView | undefined {
  if (!queued) return undefined;
  const held = step === 'held';
  return { text: queued.content, held, note: held ? queuedNote(queued.watching ? stream : 'idle') : undefined };
}

/** Releasing on its own keeps the settings the message was queued with; "Send now" sends what the composer shows. */
export function releaseSettings(queued: QueuedTurn, current: TurnSettings, via: 'auto' | 'now'): TurnSettings {
  if (via === 'now') return current;
  return { proseEdits: queued.proseEdits, justDiscussing: queued.justDiscussing, choice: queued.choice };
}

export interface EditedQueue {
  input: string;
  settings: TurnSettings;
}

export function editQueued(queued: QueuedTurn, draft: string): EditedQueue {
  return {
    input: draft.trim() ? `${queued.content}\n${draft}` : queued.content,
    settings: { proseEdits: queued.proseEdits, justDiscussing: queued.justDiscussing, choice: queued.choice },
  };
}

export interface FailedSend {
  queue?: QueuedTurn;
  input?: string;
}

/** A request that never reached the server hands the text back: a queued message to the queue, unless it is taken by a newer one, and a typed one to the box. */
export function restoreFailed(requeue: QueuedTurn | undefined, draft: string | undefined, queueTaken: boolean): FailedSend {
  if (requeue && !queueTaken) return { queue: requeue };
  const input = requeue?.content ?? draft;
  return input === undefined ? {} : { input };
}

export function inputCaption({ input, running, queued, switching }: { input: string; running: boolean; queued: boolean; switching: boolean }): string | undefined {
  if (!input.trim()) return undefined;
  if (switching) return 'Saving the mode. Send again in a moment.';
  if (running && queued) return 'One message is already queued. Edit it or wait for this reply.';
  return undefined;
}
