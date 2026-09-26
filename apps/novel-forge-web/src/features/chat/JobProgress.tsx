import { type ReactNode } from 'react';
import { Button, Spinner } from '@shadow-library/ui';

import { CheckIcon, WarningIcon } from '@/components/icons';
import { type ChatJobStreamStatus } from '@/lib/apis';

import { type JobView } from './chat-view';
import styles from './Chat.module.css';

export interface JobProgressProps {
  view: JobView;
  stream: ChatJobStreamStatus;
  cancelling: boolean;
  onCancel: () => void;
  /** The card the job staged, once it has one. */
  children?: ReactNode;
}

export function JobProgress({ view, stream, cancelling, onCancel, children }: JobProgressProps): React.JSX.Element {
  if (view.tone === 'done') {
    return (
      <div className={styles.jobDone}>
        <span className={styles.receipt}>
          <CheckIcon size={16} className={styles.receiptIcon} />
          {view.title}
        </span>
        {children}
      </div>
    );
  }
  return (
    <section className={styles.job} aria-label={view.title} data-tone={view.tone}>
      <div className={styles.jobHead}>
        {view.tone === 'running' ? <Spinner size="sm" label={view.title} /> : <WarningIcon size={16} />}
        <span className={styles.cardTitle}>{view.title}</span>
        {view.cancellable && (
          <Button size="sm" variant="ghost" className={styles.pushEnd} loading={cancelling} disabled={cancelling} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      {view.detail && <span className={styles.caption}>{view.detail}</span>}
      {view.tone === 'running' && (
        <span className={styles.caption}>
          {stream === 'reconnecting' ? 'Reconnecting — progress picks up where it left off.' : 'You can keep chatting or leave — it keeps going.'}
        </span>
      )}
    </section>
  );
}
