import { type ReactNode, useId } from 'react';
import { Alert, Button } from '@shadow-library/ui';

import { type OrganiseReceiptView, type UnusedParagraph } from './chat-view';
import styles from './Chat.module.css';

export interface OrganiseReceiptProps {
  view: OrganiseReceiptView;
  applyNote?: string;
  /** The block of what applied at once from the notes. */
  applied?: ReactNode;
  /** The card of what waits for the author. */
  card?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  /** Paragraphs the author chose to leave in the notes for now. */
  left: ReadonlySet<number>;
  busy: boolean;
  onAdd: (paragraph: UnusedParagraph) => void;
  onLeave: (number: number) => void;
}

export function OrganiseReceipt({ view, applyNote, applied, card, expanded, onToggle, left, busy, onAdd, onLeave }: OrganiseReceiptProps): React.JSX.Element {
  const listId = useId();
  const unused = view.unused.filter(paragraph => !left.has(paragraph.number));
  return (
    <div className={styles.jobDone}>
      <span className={styles.caption}>{view.summary}</span>
      {applyNote && (
        <Alert intent="warning" title="Some of it waits for you">
          {applyNote}
        </Alert>
      )}
      {applied}
      {view.unused.length > 0 && (
        <section className={styles.unused} aria-label="Not used yet">
          <div className={styles.row}>
            <span className={styles.unusedTitle}>
              Not used yet: {view.unused.length} {view.unused.length === 1 ? 'paragraph' : 'paragraphs'} of your notes
            </span>
            <span className={styles.caption}>still in your notes, nothing lost</span>
            <button type="button" className={`${styles.textLink} ${styles.pushEnd}`} aria-expanded={expanded} aria-controls={expanded ? listId : undefined} onClick={onToggle}>
              {expanded ? 'Hide' : 'Review'}
            </button>
          </div>
          {expanded && (
            <div id={listId} className={styles.unusedList}>
              {view.renumbered && <span className={styles.caption}>Your notes changed since this pass, so these numbers may point elsewhere now.</span>}
              {unused.length === 0 && <span className={styles.caption}>Everything here is left in your notes for now.</span>}
              {unused.map(paragraph => (
                <div key={paragraph.number} className={styles.unusedRow}>
                  <span className={styles.unusedNumber}>¶{paragraph.number}</span>
                  <span className={styles.unusedText}>{paragraph.text ? `“${paragraph.text}”` : 'Open your notes to read it.'}</span>
                  <span className={styles.row}>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAdd(paragraph)}>
                      Add to Story Bible
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onLeave(paragraph.number)}>
                      Leave in notes
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {card}
    </div>
  );
}
