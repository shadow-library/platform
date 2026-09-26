import { Button, Textarea } from '@shadow-library/ui';

import { type ChangeOp } from '@/lib/proposals';

import {
  type CardEntryNote,
  type CommitBarView,
  isActionOp,
  opSubject,
  opTopicLabel,
  opWrittenField,
  opWrittenValue,
  pendingDecisionLabel,
  rationaleOf,
  REJECTION_SCOPE_LABEL,
  type RejectionScope,
  rejectionScopeNote,
  rejectionScopesFor,
  RETIRES_NOTE,
  SUGGESTED_EYEBROW,
  type SuggestionDecision,
} from './chat-view';
import styles from './Chat.module.css';

export interface SuggestionCardProps {
  op: ChangeOp;
  /** Where the op came from on an organise card, and whether declining it takes an earlier Notebook entry out. */
  note?: CardEntryNote;
  decision?: SuggestionDecision;
  scope?: RejectionScope;
  /** Suggestions on the card still without an answer; nothing is added until this reaches zero. */
  remaining: number;
  /** The card's commit is in flight. */
  committing?: boolean;
  /** The edited value while "Edit first" is open; undefined when it is closed. */
  draft?: string;
  busy: boolean;
  onAdd: () => void;
  onEditFirst: () => void;
  onDraftChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDecline: () => void;
  onUndoDecision: () => void;
  /** False once the card has committed: a decision the server has recorded can no longer be taken back here. */
  canUndo?: boolean;
  onScope: (scope: RejectionScope) => void;
}

export function SuggestionCard(props: SuggestionCardProps): React.JSX.Element {
  const { op, decision, scope, draft, busy, remaining, note } = props;
  const subject = opSubject(op);
  const topic = opTopicLabel(op);
  const canUndo = props.canUndo !== false;

  if (decision === 'add') {
    return (
      <div className={styles.willAdd}>
        {pendingDecisionLabel(subject, topic, remaining, props.committing === true)}
        {canUndo && (
          <Button size="sm" variant="ghost" className={styles.pushEnd} disabled={busy} onClick={props.onUndoDecision}>
            Change
          </Button>
        )}
      </div>
    );
  }

  if (decision === 'decline' && isActionOp(op)) {
    return (
      <div className={styles.notice}>
        <span>Won’t run “{subject}”.</span>
        {canUndo && (
          <span className={styles.row}>
            <Button size="sm" variant="ghost" disabled={busy} onClick={props.onUndoDecision}>
              Change
            </Button>
          </span>
        )}
      </div>
    );
  }

  if (decision === 'decline') {
    return (
      <div className={styles.notice}>
        <span>
          {scope
            ? `Noted in your Notebook — “${subject}” won’t be suggested again ${rejectionScopeNote(scope)}. Close variations are steered away from too, though not every one may be caught.`
            : `Won’t add “${subject}”${canUndo && remaining > 0 ? ` — ${remaining} left to answer` : ''}. Should it ever be suggested again?`}
        </span>
        {note?.retires && <span className={styles.caption}>{RETIRES_NOTE}</span>}
        <span className={styles.row} role="group" aria-label={`When to suggest “${subject}” again`}>
          {rejectionScopesFor(op).map(option => (
            <Button key={option} size="sm" variant="secondary" aria-pressed={scope === option} disabled={busy || Boolean(scope)} onClick={() => props.onScope(option)}>
              {REJECTION_SCOPE_LABEL[option]}
            </Button>
          ))}
          {!scope && canUndo && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={props.onUndoDecision}>
              Change
            </Button>
          )}
        </span>
      </div>
    );
  }

  const field = opWrittenField(op);
  const rationale = rationaleOf(op);

  return (
    <section className={styles.suggestion} aria-label={`Suggestion: ${subject}`}>
      <span className={styles.suggestionEyebrow}>{note?.eyebrow ?? SUGGESTED_EYEBROW}</span>
      <span className={styles.suggestionTitle}>
        {topic}: {subject}
      </span>
      {draft === undefined ? (
        <span className={styles.suggestionBody}>{opWrittenValue(op)}</span>
      ) : (
        <div className={styles.editFirst}>
          <Textarea aria-label={`Edit “${subject}” before adding`} value={draft} onValueChange={props.onDraftChange} minRows={2} maxRows={8} autoGrow />
        </div>
      )}
      {rationale && draft === undefined && <span className={styles.caption}>{rationale}</span>}
      {note?.retires && <span className={styles.caption}>{RETIRES_NOTE}</span>}
      <div className={styles.row}>
        {draft === undefined ? (
          <>
            <Button size="sm" variant="primary" disabled={busy} onClick={props.onAdd}>
              Add to Story Bible
            </Button>
            {field && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={props.onEditFirst}>
                Edit first
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={props.onDecline}>
              {isActionOp(op) ? 'Don’t run it' : 'Not this'}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="primary" loading={busy} disabled={!draft.trim()} onClick={props.onSaveEdit}>
              Save and add
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={props.onCancelEdit}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

export interface CommitBarProps {
  view: CommitBarView;
  onCommit: () => void;
}

export function CommitBar({ view, onCommit }: CommitBarProps): React.JSX.Element | null {
  if (view.kind === 'none') return null;
  if (view.kind === 'committing') {
    return (
      <div className={styles.row} aria-busy="true">
        <span className={styles.caption}>{view.text}</span>
      </div>
    );
  }
  return (
    <div className={styles.row}>
      <Button size="sm" variant={view.kind === 'ready' ? 'primary' : 'secondary'} onClick={onCommit}>
        {view.action}
      </Button>
      {view.kind === 'ready' && view.failed ? (
        <span className={styles.commitError} role="alert">
          {view.text}
        </span>
      ) : (
        <span className={styles.caption}>{view.text}</span>
      )}
    </div>
  );
}
