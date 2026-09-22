import { type ReactElement, type ReactNode, useState } from 'react';
import { Button, Dialog, Textarea } from '@shadow-library/ui';

import { StatusChip } from '@/components/nf';
import { type BlueprintFeedbackVerdict } from '@/lib/apis';

import styles from './blueprint.module.css';

const VERDICT_LABELS: Record<BlueprintFeedbackVerdict, string> = {
  more: 'More like this',
  not: 'Not this',
  mix: 'Mix in',
};

export interface OptionCardProps {
  title: ReactNode;
  description?: ReactNode;
  /** Makes the card a choice. Omit for an option the author only reacts to. */
  selected?: boolean;
  onSelect?: () => void;
  verdict?: BlueprintFeedbackVerdict | null;
  /** The reason already recorded for a `not` verdict; the caller owns it, the card only asks for it. */
  verdictReason?: string;
  /** `not` always arrives with the reason the author typed; the other verdicts never carry one. Null takes the verdict back. */
  onVerdict?: (verdict: BlueprintFeedbackVerdict | null, reason?: string) => void;
  onEdit?: () => void;
  disabled?: boolean;
  /** Extra detail below the description — a crucible, a sample paragraph. */
  children?: ReactNode;
  footer?: ReactNode;
}

export function OptionCard({ title, description, selected, onSelect, verdict, verdictReason, onVerdict, onEdit, disabled, children, footer }: OptionCardProps): ReactElement {
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');

  const openReason = (): void => {
    setReason(verdictReason ?? '');
    setReasonOpen(true);
  };

  const closeReason = (): void => {
    setReason('');
    setReasonOpen(false);
  };

  const killed = verdict === 'not';
  const body = (
    <>
      <span className={styles.optionTitle}>{title}</span>
      {description != null && <span className={styles.optionDescription}>{description}</span>}
    </>
  );

  const submitReason = (): void => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    onVerdict?.('not', trimmed);
    closeReason();
  };

  return (
    <div className={styles.option} data-selected={selected || undefined} data-killed={killed || undefined}>
      {onSelect ? (
        <button type="button" className={styles.optionPick} aria-pressed={selected ?? false} disabled={disabled} onClick={onSelect}>
          {body}
        </button>
      ) : (
        <div className={styles.optionPick}>{body}</div>
      )}
      {children}
      {verdict != null && (
        <div className={styles.optionVerdict}>
          <StatusChip intent={verdict === 'not' ? 'danger' : 'accent'}>{VERDICT_LABELS[verdict]}</StatusChip>
          {verdictReason != null && <span className={styles.optionReason}>{verdictReason}</span>}
        </div>
      )}
      {onVerdict != null && (
        <div className={styles.optionActions}>
          <Button size="sm" variant="ghost" aria-pressed={verdict === 'more'} disabled={disabled} onClick={() => onVerdict(verdict === 'more' ? null : 'more')}>
            More like this
          </Button>
          <Button size="sm" variant="ghost" aria-pressed={killed} disabled={disabled} onClick={() => (killed ? onVerdict(null) : openReason())}>
            Not this
          </Button>
          <Button size="sm" variant="ghost" aria-pressed={verdict === 'mix'} disabled={disabled} onClick={() => onVerdict(verdict === 'mix' ? null : 'mix')}>
            Mix in
          </Button>
          {onEdit != null && (
            <Button size="sm" variant="ghost" disabled={disabled} onClick={onEdit}>
              Edit
            </Button>
          )}
        </div>
      )}
      {footer}
      <Dialog open={reasonOpen} onOpenChange={next => (next ? openReason() : closeReason())}>
        <Dialog.Content size="sm">
          <Dialog.Header title="What’s wrong with it?" description="The reason is what stops the next round proposing the same thing again — it is saved with the rejection." />
          <Dialog.Body>
            <Textarea placeholder="e.g. the mentor dies to motivate the hero — I’ve read it too often" value={reason} onValueChange={setReason} minRows={3} autoGrow autoFocus />
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="primary" disabled={!reason.trim()} onClick={submitReason}>
              Not this
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </div>
  );
}
