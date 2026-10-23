import { type RefObject, useEffect, useRef } from 'react';

import { findPending, revealPending } from './pending-reveal';

// A card brought into the chat appears once the card list refetches; past this the reveal gives up rather than jumping later.
const REVEAL_WAIT_MS = 10_000;

export interface PendingReveal {
  showPending: (key: string) => void;
  awaitPending: (key: string) => void;
}

export function useRevealPending(scrollRef: RefObject<HTMLElement | null>): PendingReveal {
  // The tray's click has long returned by the time a card brought into the chat renders, so the card it asked for is looked for after every render.
  const revealing = useRef<{ key: string; until: number } | undefined>(undefined);
  useEffect(() => {
    const wanted = revealing.current;
    if (!wanted) return;
    if (Date.now() > wanted.until) {
      revealing.current = undefined;
      return;
    }
    const target = findPending(scrollRef.current, wanted.key);
    if (!target) return;
    revealing.current = undefined;
    revealPending(target);
  });

  const awaitPending = (key: string): void => {
    revealing.current = { key, until: Date.now() + REVEAL_WAIT_MS };
  };

  const showPending = (key: string): void => {
    const target = findPending(scrollRef.current, key);
    if (target) return revealPending(target);
    awaitPending(key);
  };

  return { showPending, awaitPending };
}
