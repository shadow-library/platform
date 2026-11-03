import { useEffect, useState } from 'react';

function secondsSince(startedAt: number): number {
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
}

/** `startedAt` in epoch ms; ticks every second until `live` turns off. */
export function useElapsedSeconds(startedAt: number, live = true): number {
  const [elapsed, setElapsed] = useState(() => secondsSince(startedAt));
  useEffect(() => {
    if (!live) return undefined;
    const timer = setInterval(() => setElapsed(secondsSince(startedAt)), 1000);
    return () => clearInterval(timer);
  }, [startedAt, live]);
  return elapsed;
}
