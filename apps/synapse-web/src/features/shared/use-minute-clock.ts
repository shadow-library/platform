import { useSyncExternalStore } from 'react';

const MINUTE_MS = 60_000;

function subscribe(onTick: () => void): () => void {
  const timer = setInterval(onTick, MINUTE_MS);
  return () => clearInterval(timer);
}

const currentMinute = (): number => Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;

const noClockOnServer = (): null => null;

/** Null during SSR and hydration, so text read from the clock (such as "2h ago") cannot mismatch the server's render. */
export function useMinuteClock(): number | null {
  return useSyncExternalStore(subscribe, currentMinute, noClockOnServer);
}
