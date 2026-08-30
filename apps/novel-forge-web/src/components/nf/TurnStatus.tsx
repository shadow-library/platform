import { useEffect, useState } from 'react';
import { Button, Spinner } from '@shadow-library/ui';

import { SparkIcon } from '@/components/icons';
import { type FailedTurnResponse, type PendingTurnResponse } from '@/lib/apis';

import styles from './TurnStatus.module.css';

// What each turn graph is actually doing, in the author's terms. A bare spinner cannot distinguish a
// slow turn from a dead one, and the graph is the only phase the server reports without streaming.
const PHASE: Record<string, string> = {
  'chat-turn': 'Reading the chapter and your ask',
  'ideation-turn': 'Shaping the next questions',
  'ideation-concepts': 'Drafting concept cards',
  'ideation-stress': 'Stress-testing the sheet',
};

// Past this the wait is worth naming: the median turn lands well inside it, so the copy switching is
// itself the signal that this one is unusual.
const SLOW_AFTER_MS = 45_000;
// Elapsed time before this reads as a stopwatch on a request that was always going to be quick.
const SHOW_ELAPSED_AFTER_MS = 5_000;

function useElapsed(since: string | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since ? Math.max(0, now - new Date(since).getTime()) : 0;
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

interface TurnStatusProps {
  /** The running turn as the server reports it; absent for the beat between sending and the first poll. */
  pending: PendingTurnResponse | null | undefined;
  /** A turn this tab has in flight, which covers that beat. */
  sending: boolean;
  failed: FailedTurnResponse | null | undefined;
  /** Phase copy for a turn whose graph is not known yet. */
  fallbackLabel: string;
  onRetry?: () => void;
}

export function TurnStatus({ pending, sending, failed, fallbackLabel, onRetry }: TurnStatusProps): React.JSX.Element | null {
  const elapsed = useElapsed(pending?.startedAt);

  if (pending || sending) {
    const phase = (pending && PHASE[pending.graph]) ?? fallbackLabel;
    const slow = elapsed >= SLOW_AFTER_MS;
    return (
      <div className={styles.row} data-state="pending" role="status" aria-live="polite">
        <div className={styles.avatar}>
          <SparkIcon size={15} />
        </div>
        <div className={styles.body}>
          <div className={styles.line}>
            <Spinner size="sm" />
            <span className={styles.phase}>{phase}…</span>
            {elapsed >= SHOW_ELAPSED_AFTER_MS && <span className={styles.elapsed}>{formatElapsed(elapsed)}</span>}
          </div>
          <div className={styles.track} />
          {slow && <p className={styles.note}>Longer than usual — it is still running, and the reply lands here when it does.</p>}
        </div>
      </div>
    );
  }

  if (!failed) return null;

  return (
    <div className={styles.row} data-state="failed" role="status" aria-live="polite">
      <div className={styles.avatar}>
        <SparkIcon size={15} />
      </div>
      <div className={styles.body}>
        <span className={styles.failedTitle}>That turn didn’t finish{failed.message ? ` — ${failed.message}` : '.'}</span>
        <p className={styles.note}>Your message is still here. Nothing on the sheet changed.</p>
        {onRetry && (
          <div className={styles.failedActions}>
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
