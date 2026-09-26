import { type ReactElement, type ReactNode } from 'react';
import { Alert, Spinner } from '@shadow-library/ui';

import { StopButton } from '@/components/nf';

import styles from './shared.module.css';

/** A generation round's status and failure message — the sliver of a round response this status strip reads, kept local so it survives a server module the round itself came from being replaced. */
export interface RoundLike {
  status: 'pending' | 'running' | 'ready' | 'failed' | 'cancelled';
  error: string | null;
}

/** A round whose job has not settled yet. Lives here, beside the props that read it, so the UI and the poll cannot disagree on it. */
function isRoundLive(round: RoundLike | null): boolean {
  return round?.status === 'pending' || round?.status === 'running';
}

export interface RoundStatusProps {
  round: RoundLike | null;
  /** What the round is doing, in the step's own words — "Reading your starting point…". */
  runningLabel?: string;
  onRetry?: () => void;
  onCancel?: () => void;
  retrying?: boolean;
  cancelling?: boolean;
  /** What to tell the author when the round failed, in place of the engine's own message — a step that knows why it fails says so. */
  failedMessage?: ReactNode;
}

/** Renders nothing for a round that is ready, or for a step that has never run one. */
export function RoundStatus({ round, runningLabel = 'Working on it…', onRetry, onCancel, retrying, cancelling, failedMessage }: RoundStatusProps): ReactElement | null {
  if (round == null || round.status === 'ready') return null;

  if (isRoundLive(round))
    return (
      <div className={styles.roundRunning} role="status">
        <Spinner size="sm" />
        <span className={styles.roundRunningLabel}>{runningLabel}</span>
        {onCancel != null && <StopButton onStop={onCancel} stopping={cancelling === true} />}
      </div>
    );

  const retry = onRetry != null ? { label: retrying === true ? 'Retrying…' : 'Try again', onClick: onRetry } : undefined;
  if (round.status === 'failed')
    return (
      <Alert intent="danger" title="That round didn’t finish" action={retry}>
        {failedMessage ?? round.error ?? 'The generation stopped before it produced anything. Nothing was saved.'}
      </Alert>
    );

  return (
    <Alert intent="info" title="Round cancelled" action={retry}>
      Nothing was saved. Steer it differently and run it again whenever you like.
    </Alert>
  );
}
