import { useId } from 'react';
import { Button, Textarea } from '@shadow-library/ui';

import { type PassageSuggestionResponse } from '@/lib/apis';
import { type PassageSelection, QUICK_REQUESTS, type SuggestionView } from '@/lib/passage-suggestions';

import styles from './PassageAsk.module.css';

const QUOTE_CHARS = 240;

function excerpt(text: string): string {
  return text.length > QUOTE_CHARS ? `${text.slice(0, QUOTE_CHARS).trimEnd()}…` : text;
}

export interface PassageAskCardProps {
  selection: PassageSelection;
  request: string;
  requesting: boolean;
  onRequestChange: (request: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function PassageAskCard({ selection, request, requesting, onRequestChange, onSubmit, onCancel }: PassageAskCardProps): React.JSX.Element {
  const requestId = useId();
  return (
    <section className={styles.card} data-tone="ask" aria-label="Ask for changes to the selected passage">
      <span className={styles.title}>Change the selected passage</span>
      <blockquote className={styles.quote}>“{excerpt(selection.text)}”</blockquote>
      <div className={styles.chips}>
        {QUICK_REQUESTS.map(quick => (
          <Button key={quick} variant="secondary" size="sm" disabled={requesting} onClick={() => onRequestChange(quick)}>
            {quick}
          </Button>
        ))}
      </div>
      <label htmlFor={requestId} className="sr-only">
        What should change
      </label>
      <div className={styles.request}>
        <Textarea
          id={requestId}
          value={request}
          onValueChange={onRequestChange}
          minRows={2}
          autoFocus
          disabled={requesting}
          placeholder="What should change — e.g. let Hollis sound grieving here, not stern."
        />
      </div>
      <div className={styles.actions}>
        <Button variant="primary" size="sm" disabled={!request.trim()} loading={requesting} onClick={onSubmit}>
          Suggest a rewrite
        </Button>
        <Button variant="ghost" size="sm" disabled={requesting} onClick={onCancel}>
          Cancel
        </Button>
        <span className={styles.hint}>{requesting ? 'Writing a suggestion…' : 'Only this passage changes · the rest stays as it is'}</span>
      </div>
    </section>
  );
}

export interface PassageSuggestionCardProps {
  suggestion: PassageSuggestionResponse;
  view: SuggestionView;
  busy: boolean;
  applying: boolean;
  /** Only the newest stale card is a live region, so a list of them isn't read out at once. */
  announce: boolean;
  /** Absent when the passage can no longer be found to ask again. */
  onRetry?: () => void;
  onApply: () => void;
  onDismiss: () => void;
}

export function PassageSuggestionCard({ suggestion, view, busy, applying, announce, onRetry, onApply, onDismiss }: PassageSuggestionCardProps): React.JSX.Element {
  const reasonId = useId();
  const unusable = !view.canApply;
  return (
    <section className={styles.card} data-tone={view.state === 'stale' ? 'stale' : 'proposed'} aria-label={`Suggested rewrite of version ${suggestion.baseRevision}`}>
      <span className={styles.heading}>Suggested rewrite of version {suggestion.baseRevision} — not applied yet</span>
      {unusable && view.reason && (
        <div role={announce ? 'status' : undefined} id={reasonId} className={styles.staleRow}>
          <span className={styles.staleText}>{view.reason}</span>
        </div>
      )}
      <span className={styles.before}>{suggestion.passage}</span>
      <span className={styles.after}>{suggestion.replacement}</span>
      <span className={styles.label}>You asked: {suggestion.request}</span>
      {view.label && <span className={styles.label}>{view.label}</span>}
      {suggestion.leakLines.length > 0 && (
        <ul className={styles.leaks} aria-label="What it may give away">
          {suggestion.leakLines.map(line => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {view.warnings.map(warning => (
        <span key={warning} className={styles.note}>
          {warning}
        </span>
      ))}
      <div className={styles.actions}>
        <Button variant="primary" size="sm" disabled={unusable || busy} loading={applying} aria-describedby={unusable ? reasonId : undefined} onClick={onApply}>
          Use this
        </Button>
        {onRetry && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button variant="ghost" size="sm" disabled={busy} onClick={onDismiss}>
          {view.state === 'stale' ? 'Dismiss' : 'Keep mine'}
        </Button>
      </div>
    </section>
  );
}
