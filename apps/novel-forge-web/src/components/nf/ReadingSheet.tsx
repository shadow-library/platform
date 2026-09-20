import { type ReactElement, type ReactNode } from 'react';

import { Dialog } from '@shadow-library/ui';

import { resolveFieldValue } from '@/lib/field-card';

import styles from './ReadingSheet.module.css';

export interface ReadingSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The field's label — also the sheet's accessible name. */
  title: string;
  /** Provenance and word count beneath the title. */
  meta?: ReactNode;
  /** Read live rather than captured on open, so a turn that rewrites the field rewrites the open sheet. */
  value: string | null | undefined;
  placeholder?: string;
  /** The field's own actions — Edit, "Revert to turn 1". */
  actions?: ReactNode;
}

export function ReadingSheet({ open, onOpenChange, title, meta, value, placeholder = 'not settled yet', actions }: ReadingSheetProps): ReactElement {
  const field = resolveFieldValue(value);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="lg" className={styles.sheet}>
        <Dialog.Header title={title} description={meta} />
        <Dialog.Body>{field.kind === 'empty' ? <p className={styles.placeholder}>{placeholder}</p> : <div className={styles.prose}>{field.text}</div>}</Dialog.Body>
        {actions && <Dialog.Footer>{actions}</Dialog.Footer>}
      </Dialog.Content>
    </Dialog>
  );
}
