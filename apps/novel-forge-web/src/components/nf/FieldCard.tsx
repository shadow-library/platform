import { type ReactElement, type ReactNode, useState } from 'react';

import { previewText, readAllLabel, readAllText, resolveFieldValue } from '@/lib/field-card';

import styles from './FieldCard.module.css';
import { ReadingSheet } from './ReadingSheet';

export interface FieldCardProps {
  label: string;
  value: string | null | undefined;
  /** A provenance chip — "yours · turn 2". Suppressed while the field is unset. */
  provenance?: ReactNode;
  placeholder?: string;
  /** Footer actions for the reading sheet — Edit, "Revert to turn 1". */
  actions?: ReactNode;
}

export function FieldCard({ label, value, provenance, placeholder = 'not settled yet', actions }: FieldCardProps): ReactElement {
  const [open, setOpen] = useState(false);
  const field = resolveFieldValue(value);

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <span className={styles.label}>{label}</span>
        {field.kind === 'filled' && provenance}
      </div>

      {field.kind === 'empty' ? (
        <p className={styles.placeholder}>{placeholder}</p>
      ) : (
        <>
          <p className={styles.value} data-clamp={field.expandable || undefined}>
            {previewText(field.text)}
          </p>
          {field.expandable && (
            <button type="button" className={styles.readAll} aria-haspopup="dialog" aria-label={readAllLabel(label, field.words)} onClick={() => setOpen(true)}>
              {readAllText(field.words)}
            </button>
          )}
        </>
      )}

      <ReadingSheet open={open} onOpenChange={setOpen} title={label} meta={provenance} value={value} placeholder={placeholder} actions={actions} />
    </div>
  );
}
