import { type KeyboardEvent, type ReactElement, type ReactNode, useEffect, useRef, useState } from 'react';

import { Button, IconButton, Textarea } from '@shadow-library/ui';

import { EditIcon } from '@/components/icons';
import { type EditEvent, type EditState, stepEdit } from '@/lib/bible-edit';

import styles from './BibleDetails.module.css';

export interface EditableFieldProps {
  label: string;
  value: string;
  onSave: (value: string) => Promise<unknown>;
  children: ReactNode;
  multiline?: boolean;
  required?: boolean;
  title?: boolean;
}

/** Saves on blur or Enter (⌘/Ctrl+Enter when multiline); Escape puts the old text back. A save made elsewhere while open is never overwritten silently. */
export function EditableField({ label, value, onSave, children, multiline = true, required = false, title = false }: EditableFieldProps): ReactElement {
  const [state, setState] = useState<EditState>({ mode: 'reading' });
  const editButton = useRef<HTMLButtonElement>(null);
  const focusPending = useRef(false);

  useEffect(() => {
    if (!focusPending.current || state.mode !== 'reading') return;
    focusPending.current = false;
    editButton.current?.focus();
  }, [state.mode]);

  const apply = (event: EditEvent, from: EditState): EditState => {
    const step = stepEdit(from, event);
    if (step.focus) focusPending.current = true;
    return step.state;
  };

  const dispatch = (event: EditEvent): void => {
    const step = stepEdit(state, event);
    if (step.focus) focusPending.current = true;
    setState(step.state);
    if (step.save === undefined) return;
    onSave(step.save).then(
      () => setState(current => apply({ type: 'saved' }, current)),
      () => setState(current => apply({ type: 'failed' }, current)),
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dispatch({ type: 'escape' });
      return;
    }
    if (event.key === 'Enter' && (!multiline || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      dispatch({ type: 'commit', current: value, required, via: 'key' });
    }
  };

  if (state.mode === 'editing') {
    return (
      <div className={title ? `${styles.editing} ${styles.editingTitle}` : styles.editing}>
        <Textarea
          className={styles.editField}
          aria-label={label}
          size="sm"
          minRows={multiline ? 2 : 1}
          maxRows={multiline ? 16 : 2}
          value={state.draft}
          onValueChange={draft => dispatch({ type: 'change', draft })}
          onKeyDown={onKeyDown}
          onBlur={() => dispatch({ type: 'commit', current: value, required, via: 'blur' })}
          disabled={state.saving}
          autoFocus
        />
        {state.conflict && (
          <div className={styles.conflict} role="alert">
            <span className={styles.conflictText}>{label} changed while you were editing. Keep yours, or take the newer text and drop your edit?</span>
            <Button variant="secondary" size="sm" onClick={() => dispatch({ type: 'keepMine', required })}>
              Keep mine
            </Button>
            <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'takeTheirs' })}>
              Take theirs
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.editable}>
      {children}
      <IconButton
        ref={editButton}
        variant="ghost"
        size="sm"
        className={styles.editButton}
        aria-label={`Edit ${label.toLowerCase()}`}
        icon={<EditIcon size={14} />}
        onClick={() => dispatch({ type: 'open', value })}
      />
    </div>
  );
}
