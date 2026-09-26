import { type KeyboardEvent, type ReactElement, type Ref, useId, useState } from 'react';
import { Button, ButtonGroup, Checkbox, Input, SegmentedControl, Textarea } from '@shadow-library/ui';

import { StatusChip } from '@/components/nf';
import { type FinalizeReviewItemResponse } from '@/lib/apis';
import {
  decisionLabel,
  type DecisionMode,
  decisionMode,
  editable,
  type EditField,
  editFields,
  editPatch,
  type EditValue,
  editValues,
  evidenceLine,
  itemStakes,
  itemTag,
} from '@/lib/finalize-review';

import styles from './FinalizeReviewDialog.module.css';

export interface ItemProblem {
  code: string;
  message: string;
}

export interface FinalizeReviewItemCardProps {
  item: FinalizeReviewItemResponse;
  pending: DecisionMode | undefined;
  /** Any decision in flight: every control waits, so two answers never race on the same review. */
  busy: boolean;
  readOnly: boolean;
  problem: ItemProblem | undefined;
  cardRef: Ref<HTMLDivElement>;
  onModeChange: (mode: DecisionMode | undefined) => void;
  onKeep: () => void;
  onEdit: (patch: Record<string, unknown>) => void;
  onSkip: (reason: string) => void;
}

export function FinalizeReviewItemCard({ item, pending, busy, readOnly, problem, cardRef, onModeChange, onKeep, onEdit, onSkip }: FinalizeReviewItemCardProps): ReactElement {
  const tag = itemTag(item);
  const evidence = evidenceLine(item.evidence);
  const stakes = itemStakes(item);
  const mode = pending ?? decisionMode(item.decision);

  const keep = (): void => {
    onModeChange(undefined);
    if (item.decision !== 'kept') onKeep();
  };

  return (
    <div
      ref={cardRef}
      role="group"
      tabIndex={-1}
      className={styles.card}
      data-open={item.decision ? undefined : ''}
      data-decision={item.decision ?? undefined}
      aria-label={item.claim}
    >
      <div className={styles.main}>
        <span className={styles.head}>
          <span className={styles.title}>{item.claim}</span>
          <StatusChip intent={tag.intent}>{tag.label}</StatusChip>
          {readOnly && <StatusChip intent="neutral">{decisionLabel(item)}</StatusChip>}
        </span>
        {evidence && (
          <span className={styles.evidence}>
            {evidence.label && `${evidence.label} `}
            {evidence.text}
          </span>
        )}
        {stakes && <span className={styles.stakes}>{stakes}</span>}
        {item.decision === 'skipped' && item.reason && pending !== 'skip' && <span className={styles.evidence}>Skipped because: {item.reason}</span>}
        {pending === 'edit' && <EditForm item={item} busy={busy} onCancel={() => onModeChange(undefined)} onSave={onEdit} />}
        {pending === 'skip' && <SkipForm label={item.claim} initial={item.reason ?? ''} busy={busy} onCancel={() => onModeChange(undefined)} onSkip={onSkip} />}
        {problem && (
          <p className={styles.problem} role="alert">
            {problem.message}
          </p>
        )}
      </div>
      {!readOnly && (
        <ButtonGroup className={styles.decision} size="sm" aria-label={`Decision for ${item.claim}`} disabled={busy}>
          <Button aria-pressed={mode === 'keep'} onClick={keep}>
            Keep
          </Button>
          <Button aria-pressed={mode === 'edit'} disabled={!editable(item)} onClick={() => onModeChange('edit')}>
            Edit
          </Button>
          <Button aria-pressed={mode === 'skip'} onClick={() => onModeChange('skip')}>
            Skip
          </Button>
        </ButtonGroup>
      )}
    </div>
  );
}

interface EditFormProps {
  item: FinalizeReviewItemResponse;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: Record<string, unknown>) => void;
}

function EditForm({ item, busy, onCancel, onSave }: EditFormProps): ReactElement {
  const [values, setValues] = useState<Record<string, EditValue>>(() => editValues(item));
  const [problem, setProblem] = useState<string>();
  const set = (key: string, value: EditValue): void => {
    setValues(prev => ({ ...prev, [key]: value }));
    setProblem(undefined);
  };

  const save = (): void => {
    const result = editPatch(item, values);
    if ('problem' in result) {
      setProblem(result.problem);
      return;
    }
    onSave(result.patch);
  };

  return (
    <div className={styles.form} role="group" aria-label={`Edit: ${item.claim}`}>
      <span className={styles.evidence}>About {item.subjectKey} — the record it names stays as it is.</span>
      {editFields(item.proposed).map(field => (
        <EditFieldInput key={field.key} field={field} value={values[field.key] ?? ''} disabled={busy} onChange={value => set(field.key, value)} />
      ))}
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
      <span className={styles.formActions}>
        <Button variant="primary" size="sm" loading={busy} onClick={save}>
          Save edit
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </span>
    </div>
  );
}

interface EditFieldInputProps {
  field: EditField;
  value: EditValue;
  disabled: boolean;
  onChange: (value: EditValue) => void;
}

function EditFieldInput({ field, value, disabled, onChange }: EditFieldInputProps): ReactElement {
  if (field.kind === 'flag') return <Checkbox label={field.label} checked={value === true} disabled={disabled} onCheckedChange={checked => onChange(checked === true)} />;
  if (field.kind === 'choice') {
    return (
      <SegmentedControl size="sm" aria-label={field.label} value={String(value)} onValueChange={onChange}>
        {(field.options ?? []).map(option => (
          <SegmentedControl.Item key={option} value={option} disabled={disabled}>
            {option}
          </SegmentedControl.Item>
        ))}
      </SegmentedControl>
    );
  }
  if (field.kind === 'longText')
    return <Textarea size="sm" minRows={2} aria-label={field.label} placeholder={field.label} value={String(value)} disabled={disabled} onValueChange={onChange} />;
  return <Input size="sm" aria-label={field.label} placeholder={field.label} value={String(value)} disabled={disabled} onValueChange={onChange} />;
}

export interface SkipFormProps {
  label: string;
  initial: string;
  busy: boolean;
  onCancel: () => void;
  onSkip: (reason: string) => void;
}

/** The server refuses a skip without a reason, so the reason is asked before the skip is sent rather than after. */
export function SkipForm({ label, initial, busy, onCancel, onSkip }: SkipFormProps): ReactElement {
  const [reason, setReason] = useState(initial);
  const hintId = useId();
  const ready = reason.trim() !== '';
  const submit = (): void => {
    if (ready) onSkip(reason.trim());
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') submit();
  };

  return (
    <div className={styles.form} role="group" aria-label={`Skip: ${label}`}>
      <Input
        size="sm"
        autoFocus
        value={reason}
        onValueChange={setReason}
        onKeyDown={onKeyDown}
        placeholder="Why skip it?"
        aria-label={`Reason for skipping ${label}`}
        aria-describedby={hintId}
        disabled={busy}
      />
      <span id={hintId} className={styles.evidence}>
        A skipped update is never asked again for this chapter.
      </span>
      <span className={styles.formActions}>
        <Button variant="secondary" size="sm" loading={busy} disabled={!ready} onClick={submit}>
          Skip
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </span>
    </div>
  );
}
