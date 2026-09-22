import { type ReactElement } from 'react';
import { Button, Checkbox, Input } from '@shadow-library/ui';

import { type SteerDraft, type SteerMessage, toggleNudge } from './round';
import styles from './blueprint.module.css';

export interface SteerBoxProps {
  /** The step's own nudge chips. The server refuses free text here, so nothing else may be offered as one. */
  nudges: string[];
  draft: SteerDraft;
  onDraftChange: (draft: SteerDraft) => void;
  /** Shown above the input only once the step has been steered — an empty thread is noise on a first visit. */
  messages?: SteerMessage[];
  onSubmit: () => void;
  submitLabel?: string;
  /** A round is in flight: the box stays readable but nothing new can be asked for. */
  running?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

const HINT = 'Applies to the next options. The coach sees the Notebook and this step’s last few messages.';

export function SteerBox({
  nudges,
  draft,
  onDraftChange,
  messages = [],
  onSubmit,
  submitLabel = 'Regenerate',
  running = false,
  disabled = false,
  placeholder = 'Say what the options are missing…',
}: SteerBoxProps): ReactElement {
  const locked = disabled || running;
  const canSubmit = !locked && (draft.text.trim().length > 0 || draft.nudges.length > 0);

  return (
    <section className={styles.steer} aria-label="Steer the next round">
      {messages.length > 0 && (
        <div className={styles.steerThread}>
          {messages.map((message, index) => (
            <p key={index} className={styles.steerMessage} data-who={message.who}>
              <span className={styles.steerWho}>{message.who === 'you' ? 'You' : 'Coach'}</span>
              {message.text}
            </p>
          ))}
        </div>
      )}
      {nudges.length > 0 && (
        <div className={styles.steerNudges}>
          {nudges.map(nudge => (
            <button
              key={nudge}
              type="button"
              className={styles.nudge}
              aria-pressed={draft.nudges.includes(nudge)}
              disabled={locked}
              onClick={() => onDraftChange({ ...draft, nudges: toggleNudge(draft.nudges, nudge) })}
            >
              {nudge}
            </button>
          ))}
        </div>
      )}
      <div className={styles.steerRow}>
        <Input
          className={styles.steerInput}
          placeholder={placeholder}
          value={draft.text}
          onValueChange={text => onDraftChange({ ...draft, text })}
          disabled={locked}
          aria-label="Steer"
          onKeyDown={event => {
            if (event.key !== 'Enter' || !canSubmit) return;
            event.preventDefault();
            onSubmit();
          }}
        />
        <Button variant="primary" loading={running} disabled={!canSubmit} onClick={onSubmit}>
          {submitLabel}
        </Button>
      </div>
      <div className={styles.steerFoot}>
        <span className={styles.steerHint}>{HINT}</span>
        <Checkbox
          checked={draft.keepAsDirection}
          disabled={locked || draft.text.trim().length === 0}
          onCheckedChange={next => onDraftChange({ ...draft, keepAsDirection: next === true })}
          label="Keep as a direction"
        />
      </div>
    </section>
  );
}
