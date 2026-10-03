import { useId } from 'react';
import { Alert, Button, Spinner } from '@shadow-library/ui';

import { type ApiError, type ProgressItemKey, type ProgressOverrideStatus } from '@/lib/apis';

import { type ChecklistView } from './chat-view';
import styles from './Chat.module.css';

export interface ReadyChecklistProps {
  view?: ChecklistView;
  loading: boolean;
  error?: ApiError | null;
  onRetry: () => void;
  expanded: boolean;
  onToggle: () => void;
  onMark: (key: ProgressItemKey, status: ProgressOverrideStatus) => void;
  busyKey?: ProgressItemKey;
}

const MARK: Record<'open' | 'answered' | 'undecided', string> = { open: '○', answered: '✓', undecided: '–' };

export function ReadyChecklist({ view, loading, error, onRetry, expanded, onToggle, onMark, busyKey }: ReadyChecklistProps): React.JSX.Element | null {
  const listId = useId();
  if (loading) {
    return (
      <div className={styles.checklistStatus} role="status">
        <Spinner size="sm" label="Loading your checklist" />
        Loading your checklist…
      </div>
    );
  }
  if (error) {
    return (
      <Alert intent="danger" title="Couldn’t load your checklist" action={{ label: 'Try again', onClick: onRetry }}>
        {error.message}
      </Alert>
    );
  }
  if (!view || view.items.length === 0 || view.complete) return null;

  return (
    <section className={styles.checklist} aria-label={view.title}>
      <button type="button" className={styles.checklistHead} aria-expanded={expanded} aria-controls={expanded ? listId : undefined} onClick={onToggle}>
        <span className={styles.checklistTitle}>{view.title}</span>
        <span className={styles.checklistBar} aria-hidden="true">
          <span className={styles.checklistFill} style={{ width: `${view.percent}%` }} />
        </span>
        <span className={styles.checklistCount}>{view.answered} settled</span>
        <span className={styles.checklistToggle}>{expanded ? 'Hide' : 'Show'}</span>
      </button>
      {expanded && (
        <div id={listId}>
          <ul className={styles.checklistItems}>
            {view.items.map(item => (
              <li key={item.key} className={styles.checklistItem} data-state={item.state}>
                <span className={styles.checklistMark} aria-hidden="true">
                  {MARK[item.state]}
                </span>
                <span className={styles.checklistText}>
                  <span>{item.label}</span>
                  <span className={styles.caption}>{item.why}</span>
                </span>
                <span className={styles.caption}>{item.stateLabel}</span>
                {item.state === 'open' && (
                  <span className={styles.checklistActions}>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyKey === item.key}
                      aria-label={`Mark “${item.label}” undecided for now`}
                      onClick={() => onMark(item.key, 'undecided')}
                    >
                      Undecided for now
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busyKey === item.key} aria-label={`Dismiss “${item.label}”`} onClick={() => onMark(item.key, 'dismissed')}>
                      Dismiss
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {view.dismissed > 0 && <p className={styles.checklistNote}>{view.dismissed} dismissed.</p>}
        </div>
      )}
    </section>
  );
}
