import { useId, useState } from 'react';

import { CheckIcon, ChevronRightIcon, SparkIcon, WarningIcon } from '@/components/icons';
import { SLOW_TURN_NOTE, type TurnRow, type TurnSource, type TurnTail } from '@/lib/chat-turn-timeline';

import styles from './Chat.module.css';

interface TurnSparkProps {
  breathe?: boolean;
}

function TurnSpark({ breathe }: TurnSparkProps): React.JSX.Element {
  return (
    <span className={styles.spark} data-breathe={breathe || undefined} aria-hidden="true">
      <SparkIcon size={14} />
    </span>
  );
}

export interface TurnTraceProps {
  rows: TurnRow[];
}

export function TurnTrace({ rows }: TurnTraceProps): React.JSX.Element | null {
  if (rows.length === 0) return null;
  return (
    <div className={styles.turnTrace}>
      {rows.map(row => (
        <TurnTraceRow key={row.key} row={row} />
      ))}
    </div>
  );
}

interface TurnTraceRowProps {
  row: TurnRow;
}

function TurnTraceRow({ row }: TurnTraceRowProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  if (row.sources.length === 0) {
    return (
      <div className={styles.turnRow}>
        <span className={styles.turnIcon} />
        {row.label}
      </div>
    );
  }

  return (
    <>
      <button type="button" className={styles.turnRow} aria-expanded={open} aria-controls={open ? detailId : undefined} onClick={() => setOpen(current => !current)}>
        <span className={styles.turnIcon}>
          <ChevronRightIcon size={12} className={styles.turnChevron} />
        </span>
        {row.label}
      </button>
      {open && (
        <ul id={detailId} className={styles.turnDetail}>
          {row.sources.map(source => (
            <TurnSourceItem key={source.key} source={source} />
          ))}
        </ul>
      )}
    </>
  );
}

const SOURCE_STATUS: Record<TurnSource['status'], string> = { running: 'reading', ok: 'read', error: 'couldn’t be read' };

interface TurnSourceItemProps {
  source: TurnSource;
}

function TurnSourceItem({ source }: TurnSourceItemProps): React.JSX.Element {
  return (
    <li className={styles.turnSource} data-status={source.status}>
      <span className={styles.turnSourceMark} aria-hidden="true">
        {source.status === 'ok' && <CheckIcon size={12} />}
        {source.status === 'error' && <WarningIcon size={12} />}
        {source.status === 'running' && <span className={styles.turnSourceDot} />}
      </span>
      {source.label}
      <span className={styles.srOnly}>, {SOURCE_STATUS[source.status]}</span>
    </li>
  );
}

export interface TurnLiveTailProps {
  tail: TurnTail;
  onProgress?: () => void;
}

/**
 * Always the last thing in a running turn, so the newest activity sits at the bottom. Its status line speaks twice at most — when the turn
 * starts and if it turns slow — never per delta; the composer announces the finished turn.
 */
export function TurnLiveTail({ tail, onProgress }: TurnLiveTailProps): React.JSX.Element {
  return (
    <>
      <div className={styles.turnTail}>
        <TurnSpark breathe={tail.starting} />
        <span className={styles.shimmer}>{tail.label}</span>
        {tail.elapsed && (
          <span className={styles.turnElapsed} aria-hidden="true">
            · {tail.elapsed}
          </span>
        )}
        <span className={styles.srOnly} role="status">
          {tail.slow ? SLOW_TURN_NOTE : 'Forge is working on your message'}
        </span>
        {onProgress && (
          <button type="button" className={`${styles.textLink} ${styles.tailProgress}`} onClick={onProgress}>
            Progress
          </button>
        )}
      </div>
      {tail.slow && (
        <p className={styles.turnNote} aria-hidden="true">
          {SLOW_TURN_NOTE}
        </p>
      )}
    </>
  );
}
