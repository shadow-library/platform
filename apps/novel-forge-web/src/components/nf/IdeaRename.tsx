import { useRef, useState } from 'react';
import { Input, Kbd } from '@shadow-library/ui';

import styles from './IdeaRename.module.css';

interface IdeaRenameProps {
  name: string;
  saving: boolean;
  onCommit: (next: string | null) => void;
  compact?: boolean;
}

export function IdeaRename({ name, saving, onCommit, compact = false }: IdeaRenameProps): React.JSX.Element {
  const [value, setValue] = useState(name);
  // Esc unmounts this input, which can fire a trailing blur; guards settle() from running twice.
  const settledRef = useRef(false);

  const settle = (save: boolean): void => {
    if (settledRef.current) return;
    settledRef.current = true;
    const next = value.trim();
    onCommit(save && next && next !== name ? next : null);
  };

  return (
    <div
      className={compact ? styles.crumb : styles.card}
      role="presentation"
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter') settle(true);
        if (e.key === 'Escape') settle(false);
      }}
    >
      <Input
        autoFocus
        size={compact ? 'sm' : 'md'}
        aria-label="Idea name"
        className={compact ? styles.crumbWrap : undefined}
        inputClassName={compact ? undefined : styles.cardField}
        value={value}
        disabled={saving}
        onValueChange={setValue}
        onFocus={e => e.currentTarget.select()}
        onBlur={() => settle(true)}
      />
      {!compact && (
        <span className={styles.hint}>
          <Kbd>Enter</Kbd> to save · <Kbd>Esc</Kbd> to cancel
        </span>
      )}
    </div>
  );
}
