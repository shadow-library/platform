import { type KeyboardEvent, type ReactElement } from 'react';
import { Button, Checkbox, Input, Textarea } from '@shadow-library/ui';

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
  /** A box that grows with what is typed, for a step whose steers run to paragraphs; Enter breaks a line and ⌘/Ctrl+Enter sends. */
  multiline?: boolean;
}

const HINT = 'Applies to the next options. The coach sees the Notebook and this step’s last few messages.';
const MULTILINE_HINT = '⌘/Ctrl+Enter to send.';

/** The server's own limit on a steer, counted the same way, so a long one is refused here with a count rather than there with an error. */
export const STEER_MAX = 2000;
const STEER_COUNT_FROM = STEER_MAX * 0.8;

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
  multiline = false,
}: SteerBoxProps): ReactElement {
  const locked = disabled || running;
  const length = [...draft.text.trim()].length;
  const tooLong = length > STEER_MAX;
  const canSubmit = !locked && !tooLong && (draft.text.trim().length > 0 || draft.nudges.length > 0);
  const setText = (text: string): void => onDraftChange({ ...draft, text });
  const submitOnEnter = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Enter' || !canSubmit) return;
    if (multiline && !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    onSubmit();
  };

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
      <div className={styles.steerRow} data-multiline={multiline || undefined}>
        {multiline ? (
          <Textarea
            className={styles.steerInput}
            placeholder={placeholder}
            value={draft.text}
            onValueChange={setText}
            disabled={locked}
            aria-label="Steer"
            aria-invalid={tooLong || undefined}
            minRows={2}
            maxRows={10}
            autoGrow
            onKeyDown={submitOnEnter}
          />
        ) : (
          <Input
            className={styles.steerInput}
            placeholder={placeholder}
            value={draft.text}
            onValueChange={setText}
            disabled={locked}
            aria-label="Steer"
            aria-invalid={tooLong || undefined}
            onKeyDown={submitOnEnter}
          />
        )}
        <Button variant="primary" loading={running} disabled={!canSubmit} onClick={onSubmit}>
          {submitLabel}
        </Button>
      </div>
      <div className={styles.steerFoot}>
        <span className={styles.steerHint}>{multiline ? `${HINT} ${MULTILINE_HINT}` : HINT}</span>
        {length >= STEER_COUNT_FROM && (
          <span className={styles.steerCount} data-over={tooLong || undefined} aria-live="polite">
            {length.toLocaleString()} / {STEER_MAX.toLocaleString()}
          </span>
        )}
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
