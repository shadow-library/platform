import { type ReactElement } from 'react';
import { Alert } from '@shadow-library/ui';

import { StatusChip } from '@/components/nf';
import { type FinalizeReviewResponse, useIsolationBridgeQuery, usePrepareBridgeMutation } from '@/lib/apis';
import { bridgePositionLine, bridgeStatus, droppedByHardLineNote, droppedOverLengthNote } from '@/lib/finalize-review';

import styles from './FinalizeReviewDialog.module.css';

const NOT_ISOLATED_CODE = 'BRG_001';

export interface IsolationBridgePanelProps {
  novelId: string;
  chapter: number;
  final: boolean;
  review: FinalizeReviewResponse | undefined;
  onPrepared: (message: string) => void;
}

/** Exactly what standard chapters may read of this unrestricted chapter, as the server resolves it now. */
export function IsolationBridgePanel({ novelId, chapter, final, review, onPrepared }: IsolationBridgePanelProps): ReactElement | null {
  const bridge = useIsolationBridgeQuery(novelId, chapter);
  const prepare = usePrepareBridgeMutation(novelId, chapter);

  if (bridge.error?.code === NOT_ISOLATED_CODE) return null;
  if (bridge.error) {
    return (
      <p className={styles.problem} role="alert">
        Couldn’t load this chapter’s bridge: {bridge.error.message}
      </p>
    );
  }
  if (!bridge.data) return null;

  const status = bridgeStatus(bridge.data, final, review);
  const dropped = [droppedByHardLineNote(bridge.data.droppedByHardLine), droppedOverLengthNote(bridge.data.droppedOverLength)].filter(note => note !== null);
  const readAgain = (): void => {
    if (prepare.isPending) return;
    prepare.mutate(undefined, { onSuccess: () => onPrepared(`Reading chapter ${chapter}’s bridge from its current text.`) });
  };

  return (
    <section className={styles.bridge} aria-label="Bridge to later chapters">
      <span className={styles.head}>
        <span className="nf-eyebrow">Bridge to later chapters</span>
        <StatusChip intent={status.kind === 'approved' ? 'success' : 'neutral'}>{status.kind === 'approved' ? 'Approved' : 'Nothing crosses'}</StatusChip>
      </span>
      {status.kind === 'approved' && (
        <>
          <p className={styles.note}>Standard chapters never read this chapter’s prose — only what you approved here.</p>
          {bridge.data.summary && <p className={styles.bridgeSummary}>{bridge.data.summary}</p>}
          {status.replacing && <p className={styles.note}>A newly read bridge waits for your answer below. This one keeps crossing until you answer its summary.</p>}
          {bridge.data.positions.length > 0 && (
            <ul className={styles.reasons} aria-label="Where characters stand">
              {bridge.data.positions.map(position => (
                <li key={position.entityKey}>{bridgePositionLine(position)}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {status.kind === 'awaiting' && (
        <p className={styles.note}>Standard chapters read this chapter as walled off until you answer its summary in the review below and keep it or a character’s position.</p>
      )}
      {status.kind === 'reading' && <p className={styles.note}>The bridge is read from the current text below. Nothing crosses until you answer its summary.</p>}
      {status.kind === 'empty' && <p className={styles.note}>Nothing crosses from this bridge, so standard chapters read this chapter as walled off.</p>}
      {status.kind === 'failed' && <p className={styles.note}>Reading the bridge failed, so standard chapters read this chapter as walled off until it is read again.</p>}
      {status.kind === 'missing' && (
        <Alert
          intent="warning"
          title={status.stale ? 'The bridge no longer matches the text' : 'This chapter has no bridge'}
          action={{ label: prepare.isPending ? 'Reading…' : 'Read the bridge again', onClick: readAgain }}
        >
          {status.stale ? 'The text changed after its bridge was approved, so ' : ''}standard chapters read this chapter as walled off. Reading the bridge again asks you only for
          its summary; the Story Bible stays as it is.
        </Alert>
      )}
      {dropped.map(note => (
        <p key={note} className={styles.note}>
          {note}
        </p>
      ))}
      {prepare.error && (
        <p className={styles.problem} role="alert">
          {prepare.error.message}
        </p>
      )}
    </section>
  );
}
