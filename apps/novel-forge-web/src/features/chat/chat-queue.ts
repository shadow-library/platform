import { type ChatTurnStreamState } from '@/lib/apis';
import { type ReplyOptions } from '@/lib/chat-model';
import { type PassageChip } from '@/lib/passage-comments';

type StreamStatus = ChatTurnStreamState['status'];

export interface TurnSettings {
  proseEdits: boolean;
  justDiscussing: boolean;
  options?: ReplyOptions;
}

export interface QueuedTurn extends TurnSettings {
  content: string;
  /** The passage comments that ride the message, taken out of the composer with its text. */
  chips: readonly PassageChip[];
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

function queuedText({ content, chips }: QueuedTurn): string {
  if (chips.length === 0) return content;
  const comments = chips.length === 1 ? '1 passage comment' : `${chips.length} passage comments`;
  return content.trim() ? `${content} · ${comments}` : comments;
}

export function queuedView(queued: QueuedTurn | undefined, step: QueueStep, stream: StreamStatus): QueuedView | undefined {
  if (!queued) return undefined;
  const held = step === 'held';
  return { text: queuedText(queued), held, note: held ? queuedNote(queued.watching ? stream : 'idle') : undefined };
}

/** Releasing on its own keeps the settings the message was queued with; "Send now" sends what the composer shows, but the reply options always stay the message's own. */
export function releaseSettings(queued: QueuedTurn, current: TurnSettings, via: 'auto' | 'now'): TurnSettings {
  if (via === 'now') return { ...current, options: queued.options };
  return { proseEdits: queued.proseEdits, justDiscussing: queued.justDiscussing, options: queued.options };
}

export interface EditedQueue {
  input: string;
  chips: readonly PassageChip[];
  settings: TurnSettings;
}

export function editQueued(queued: QueuedTurn, draft: string): EditedQueue {
  return {
    input: draft.trim() ? `${queued.content}\n${draft}` : queued.content,
    chips: queued.chips,
    settings: { proseEdits: queued.proseEdits, justDiscussing: queued.justDiscussing, options: queued.options },
  };
}

export interface FailedSend {
  queue?: QueuedTurn;
  input?: string;
  /** A queued message's comments, back in the composer with its text. */
  chips?: readonly PassageChip[];
}

/**
 * A failure the transcript recorded came after the server stored the message with its comments, so nothing goes back and the comments it took leave the
 * composer; any other failure hands the message back as `restoreFailed` does.
 */
export function afterFailedSend(recorded: boolean, requeue: QueuedTurn | undefined, draft: string | undefined, queueTaken: boolean): FailedSend & { stored: boolean } {
  return recorded ? { stored: true } : { stored: false, ...restoreFailed(requeue, draft, queueTaken) };
}

/**
 * A request that never reached the server hands the text back: a queued message to the queue, unless it is taken by a newer one, and a typed one to the
 * box. A typed message's comments never left the composer.
 */
export function restoreFailed(requeue: QueuedTurn | undefined, draft: string | undefined, queueTaken: boolean): FailedSend {
  if (requeue && !queueTaken) return { queue: requeue };
  if (requeue) return requeue.chips.length > 0 ? { input: requeue.content, chips: requeue.chips } : { input: requeue.content };
  return draft === undefined ? {} : { input: draft };
}

export function inputCaption({ input, running, queued, switching }: { input: string; running: boolean; queued: boolean; switching: boolean }): string | undefined {
  if (!input.trim()) return undefined;
  if (switching) return 'Saving the mode. Send again in a moment.';
  if (running && queued) return 'One message is already queued. Edit it or wait for this reply.';
  return undefined;
}
