import { useEffect, useState } from 'react';

export function useElapsed(since: string | undefined): number {
  const now = useNow(Boolean(since));
  return since ? Math.max(0, now - new Date(since).getTime()) : 0;
}

/** The clock, ticking once a second while `running`; frozen otherwise. */
export function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}
