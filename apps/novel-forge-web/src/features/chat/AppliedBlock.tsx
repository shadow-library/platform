import { type ReactNode } from 'react';
import { Alert, Button, Dialog, Spinner } from '@shadow-library/ui';

import { type ApiError, type UndoImpactResponse } from '@/lib/apis';

import { type AppliedRow, dependentLabel, type QuoteSource, rowSource, undoImpactView } from './chat-view';
import styles from './Chat.module.css';

export type AppliedOrigin = 'words' | 'accepted';

export interface AppliedBlockProps {
  rows: AppliedRow[];
  origin: AppliedOrigin;
  state: 'applied' | 'reverted';
  revertible: boolean;
  onUndo: () => void;
  quoteSource?: QuoteSource;
  /** A link into the Story Bible; a slot so the block renders without a router. */
  bibleLink?: ReactNode;
}

const ORIGIN_BADGE: Record<AppliedOrigin, string> = { words: 'Your own words', accepted: 'You added' };

export function AppliedBlock({ rows, origin, state, revertible, onUndo, quoteSource = 'message', bibleLink }: AppliedBlockProps): React.JSX.Element {
  if (state === 'reverted') {
    return <div className={styles.notice}>Undone — your Story Bible is back as it was.</div>;
  }
  const quoted = rows.some(row => rowSource(row, quoteSource));
  return (
    <section className={styles.applied} aria-label="Added to your Story Bible">
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>Added to your Story Bible{origin === 'words' && ` — from your ${quoteSource === 'notes' ? 'notes' : 'words'}`}</span>
        <span className={styles.badgeSuccess}>{ORIGIN_BADGE[origin]}</span>
        {quoted && <span className={styles.cardHeadNote}>Each line quotes where it came from</span>}
      </div>
      <ul className={styles.appliedRows}>
        {rows.map(row => (
          <li key={row.index} className={styles.appliedRow}>
            <span className={styles.appliedTopic}>{row.topic}</span>
            <span className={styles.appliedText}>
              <span>{row.value}</span>
              {rowSource(row, quoteSource) && <span className={styles.caption}>{rowSource(row, quoteSource)}</span>}
            </span>
          </li>
        ))}
      </ul>
      <div className={styles.cardActions}>
        {bibleLink}
        {revertible && (
          <Button size="sm" variant="ghost" onClick={onUndo}>
            Undo this change
          </Button>
        )}
        {revertible && <span className={styles.caption}>Shows what relies on it first</span>}
      </div>
    </section>
  );
}

export interface UndoImpactBodyProps {
  impact?: UndoImpactResponse;
  loading: boolean;
  error?: ApiError | null;
  onRetry: () => void;
}

export function UndoImpactBody({ impact, loading, error, onRetry }: UndoImpactBodyProps): React.JSX.Element {
  if (loading) {
    return (
      <div className={styles.checklistStatus} role="status">
        <Spinner size="sm" label="Checking what relies on it" />
        Checking what relies on this change…
      </div>
    );
  }
  if (error || !impact) {
    return (
      <Alert intent="danger" title="Couldn’t check what relies on this change" action={{ label: 'Try again', onClick: onRetry }}>
        {error?.message ?? 'No answer came back.'}
      </Alert>
    );
  }
  const view = undoImpactView(impact);
  if (view.empty) return <p className={styles.dialogText}>Nothing else relies on it yet — undoing removes only what was added.</p>;
  return (
    <div className={styles.impact}>
      {view.counts.length > 0 && <p className={styles.dialogText}>Relies on it: {view.counts.join(' · ')}.</p>}
      {impact.dependents.length > 0 && (
        <ul className={styles.impactList}>
          {impact.dependents.map(dependent => (
            <li key={`${dependent.kind}:${dependent.ref}`} className={styles.impactRow}>
              <span>{dependentLabel(dependent.ref, dependent.chapter)}</span>
              <span className={styles.caption}>{dependent.final ? 'final — stays as it is' : 'marked to review'}</span>
            </li>
          ))}
        </ul>
      )}
      {view.finalNote && <p className={styles.dialogText}>{view.finalNote}</p>}
    </div>
  );
}

export interface UndoImpactDialogProps extends UndoImpactBodyProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes when the dialog closes; the opener may be gone by then. */
  onCloseAutoFocus?: (event: Event) => void;
  onConfirm: () => void;
  confirming: boolean;
}

export function UndoImpactDialog({ open, onOpenChange, onCloseAutoFocus, onConfirm, confirming, ...body }: UndoImpactDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="sm" onCloseAutoFocus={onCloseAutoFocus}>
        <Dialog.Header title="Undo this change?" description="Everything listed in this change is taken back out of your Story Bible. Final chapters are never rewritten." />
        <Dialog.Body>
          <UndoImpactBody {...body} />
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Keep it</Button>
          </Dialog.Close>
          <Button variant="danger" loading={confirming} disabled={body.loading || Boolean(body.error)} onClick={onConfirm}>
            Undo this change
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
