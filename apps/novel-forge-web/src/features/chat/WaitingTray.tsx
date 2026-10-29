import { type ReactNode, useState } from 'react';
import { Button } from '@shadow-library/ui';

import { StatusChip } from '@/components/nf';
import { type PendingItem, type PendingTray } from '@/lib/pending-items';

import styles from './Chat.module.css';

export interface WaitingTrayProps {
  items: readonly PendingItem[];
  tray: PendingTray;
  /** The chat can take a card: it exists and is not locked. */
  canAdopt: boolean;
  /** The card being brought into the chat. */
  adopting?: string;
  onShow: (key: string) => void;
  onAdopt: (item: PendingItem & { proposalId: string }) => void;
  reviewProposalIds: ReadonlyMap<string, string>;
  onReview: (proposalId: string) => void;
}

/**
 * Everything waiting on the author, above the composer. Open while something is not in the thread yet, so it can be brought in; otherwise one
 * line, since every card is already in the thread below.
 */
export function WaitingTray({ items, tray, canAdopt, adopting, onShow, onAdopt, reviewProposalIds, onReview }: WaitingTrayProps): React.JSX.Element | null {
  const [open, setOpen] = useState<boolean>();
  const [elsewhere, setElsewhere] = useState(tray.elsewhere);
  if (elsewhere !== tray.elsewhere) {
    setElsewhere(tray.elsewhere);
    if (tray.elsewhere > elsewhere) setOpen(undefined);
  }
  if (tray.count === 0) return null;

  if (!(open ?? tray.elsewhere > 0)) {
    return (
      <div className={styles.trayLine}>
        <StatusChip intent="info" dot>
          {tray.count}
        </StatusChip>
        <span className={styles.trayLineText} title={tray.names}>
          waiting on you: {tray.names}
        </span>
        <Button size="sm" variant="ghost" aria-expanded={false} onClick={() => setOpen(true)}>
          Show
        </Button>
      </div>
    );
  }

  const action = (item: PendingItem): ReactNode => {
    const { proposalId } = item;
    const review = item.inThread ? reviewProposalIds.get(item.key) : undefined;
    if (review) {
      return (
        <Button size="sm" variant="ghost" aria-label={`Review ${item.title}`} onClick={() => onReview(review)}>
          Review
        </Button>
      );
    }
    if (item.inThread || !proposalId) {
      return (
        <Button size="sm" variant="ghost" aria-label={`Show ${item.title}`} onClick={() => onShow(item.key)}>
          Show
        </Button>
      );
    }
    return (
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Bring ${item.title} into this chat`}
        disabled={!canAdopt || (adopting !== undefined && adopting !== proposalId)}
        loading={adopting === proposalId}
        onClick={() => onAdopt({ ...item, proposalId })}
      >
        Bring into chat
      </Button>
    );
  };

  return (
    <section className={styles.tray} aria-label="Everything waiting on you">
      <div className={styles.trayHead}>
        <span>Waiting on you · {tray.count}</span>
        <Button size="sm" variant="ghost" className={styles.pushEnd} aria-expanded onClick={() => setOpen(false)}>
          Hide
        </Button>
      </div>
      <ul className={`nf-scroll ${styles.trayRows}`}>
        {items.map(item => (
          <li key={item.key} className={styles.trayRow}>
            <StatusChip intent={item.chip.intent} dot>
              {item.chip.label}
            </StatusChip>
            <span className={styles.trayTitle} title={item.title}>
              {item.title}
            </span>
            <span className={styles.traySource}>{item.source}</span>
            {action(item)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface PendingAnchorProps {
  /** The card's pending key; without one nothing is waiting and the card is left unmarked. */
  id: string | undefined;
  children: ReactNode;
}

/** Marks a waiting card so the tray can scroll to it; it takes no room of its own, and none at all while the card renders nothing. */
export function PendingAnchor({ id, children }: PendingAnchorProps): React.JSX.Element {
  if (!id) return <>{children}</>;
  return (
    <div className={styles.pendingAnchor} data-pending={id} tabIndex={-1}>
      {children}
    </div>
  );
}
