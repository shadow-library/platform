import { type ReactElement } from 'react';
import { Alert, Spinner } from '@shadow-library/ui';

import { StopButton } from '@/components/nf';
import { type BlueprintRoundResponse, isRoundLive } from '@/lib/apis';

import styles from './blueprint.module.css';

export interface RoundStatusProps {
  round: BlueprintRoundResponse | null;
  /** What the round is doing, in the step's own words — "Reading your starting point…". */
  runningLabel?: string;
  onRetry?: () => void;
  onCancel?: () => void;
  retrying?: boolean;
  cancelling?: boolean;
}

/** Renders nothing for a round that is ready, or for a step that has never run one. */
export function RoundStatus({ round, runningLabel = 'Working on it…', onRetry, onCancel, retrying, cancelling }: RoundStatusProps): ReactElement | null {
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
        {round.error ?? 'The generation stopped before it produced anything. Nothing was saved.'}
      </Alert>
    );

  return (
    <Alert intent="info" title="Round cancelled" action={retry}>
      Nothing was saved. Steer it differently and run it again whenever you like.
    </Alert>
  );
}
