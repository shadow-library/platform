import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { type ChatTurnStreamState } from '@/lib/apis';
import { type PassageChip } from '@/lib/passage-comments';

import { type EditedQueue, editQueued, type QueuedTurn, type QueueStep, queueStep, releaseSettings, type TurnSettings } from './chat-queue';

export interface TurnQueueOptions {
  running: boolean;
  locked: boolean;
  watching: boolean;
  streamStatus: ChatTurnStreamState['status'];
  finishedId: string | undefined;
  inTranscript: boolean;
  input: string;
  settings: () => TurnSettings;
  send: (content: string, draft: string | undefined, settings: TurnSettings, requeue?: QueuedTurn, chips?: readonly PassageChip[]) => void;
  onEnqueued: (chips: readonly PassageChip[]) => void;
  onEdited: (edited: EditedQueue) => void;
}

export interface TurnQueue {
  queued: QueuedTurn | undefined;
  setQueued: (queued: QueuedTurn | undefined) => void;
  queueNow: { readonly current: QueuedTurn | undefined };
  step: QueueStep;
  enqueue: (content: string, chips: readonly PassageChip[]) => void;
  releaseQueued: (via: 'auto' | 'now') => void;
  editQueuedMessage: () => void;
}

export function useTurnQueue(options: TurnQueueOptions): TurnQueue {
  const { running, locked, watching, streamStatus, finishedId, inTranscript, input, settings, send, onEnqueued, onEdited } = options;
  const [queued, setQueued] = useState<QueuedTurn>();
  const step = queueStep({ queued, running, locked, stream: streamStatus, finishedId, inTranscript });
  const queueNow = useRef(queued);
  useLayoutEffect(() => {
    queueNow.current = queued;
  });

  const enqueue = (content: string, chips: readonly PassageChip[]): void => {
    if (queued || locked) return;
    setQueued({ content, chips, ...settings(), watching, after: finishedId });
    onEnqueued(chips);
  };

  const releaseQueued = (via: 'auto' | 'now'): void => {
    if (!queued || running || locked) return;
    setQueued(undefined);
    send(queued.content, undefined, releaseSettings(queued, settings(), via), queued, queued.chips);
  };

  const editQueuedMessage = (): void => {
    if (!queued) return;
    onEdited(editQueued(queued, input));
    setQueued(undefined);
  };

  useEffect(() => {
    if (step !== 'send') return;
    const timer = setTimeout(() => releaseQueued('auto'));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- releases the queue once, on the step turning to 'send'; the timer runs the render's own releaseQueued
  }, [step]);

  return { queued, setQueued, queueNow, step, enqueue, releaseQueued, editQueuedMessage };
}
