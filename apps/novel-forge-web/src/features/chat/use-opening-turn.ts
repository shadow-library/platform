import { useEffect, useRef } from 'react';

import { takePendingFirstTurn } from '@/lib/pending-first-turn';

export interface OpeningTurnOptions {
  sessionId: string | undefined;
  initialTurn: string | undefined;
  onInitialTurnSent: (() => void) | undefined;
  messagesLoaded: boolean;
  empty: boolean;
  sendInitial: (content: string) => void;
  sendFirst: (content: string) => void;
}

export function useOpeningTurn({ sessionId, initialTurn, onInitialTurnSent, messagesLoaded, empty, sendInitial, sendFirst }: OpeningTurnOptions): void {
  // Both opening messages are sent from a timer the effect's cleanup cancels, not from the effect itself: under StrictMode's
  // mount–unmount–mount the first pass only schedules, its cleanup cancels the timer (never a request in flight), and the ref keeps
  // the text for the second pass to send.
  const initialRef = useRef<string | undefined>(undefined);
  const initialConsumed = useRef(false);
  useEffect(() => {
    if (!initialTurn || initialConsumed.current) return;
    initialRef.current = initialTurn;
    const timer = setTimeout(() => {
      const content = initialRef.current;
      if (!content || initialConsumed.current) return;
      initialConsumed.current = true;
      onInitialTurnSent?.();
      sendInitial(content);
    });
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sends once per handed-off message; initialConsumed guards every later run
  }, [initialTurn]);

  // The Start screen's opening message: taken only once the transcript is known to be empty, and sent only while it still is.
  const queuedRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!sessionId || !messagesLoaded || !empty) return;
    queuedRef.current ??= takePendingFirstTurn(sessionId);
    if (!queuedRef.current) return;
    const timer = setTimeout(() => {
      const queued = queuedRef.current;
      if (!queued) return;
      queuedRef.current = undefined;
      sendFirst(queued);
    });
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sends at most once: the ref empties as it sends, and a transcript with messages stops the next pass
  }, [sessionId, messagesLoaded, empty]);
}
