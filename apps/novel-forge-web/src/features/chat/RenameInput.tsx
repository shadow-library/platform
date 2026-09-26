import { useRef, useState } from 'react';
import { Input } from '@shadow-library/ui';

export interface RenameInputProps {
  label: string;
  value: string;
  loading: boolean;
  onCommit: (title: string) => void;
  onCancel: () => void;
  className?: string;
}

// Shared by the history row and the thread header: pre-filled and selected so typing replaces the title,
// Enter/blur commit, Escape cancels. `settledRef` guards against an Escape's cancel and the blur that
// follows it (removing the input from the DOM) both firing — only the first one is allowed to act.
export function RenameInput({ label, value, loading, onCommit, onCancel, className }: RenameInputProps): React.JSX.Element {
  const [draft, setDraft] = useState(value);
  const settledRef = useRef(false);

  const commit = (): void => {
    if (settledRef.current) return;
    settledRef.current = true;
    const title = draft.trim();
    if (title && title !== value) onCommit(title);
    else onCancel();
  };

  const cancel = (): void => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCancel();
  };

  return (
    <Input
      autoFocus
      size="sm"
      aria-label={label}
      className={className}
      value={draft}
      disabled={loading}
      onValueChange={setDraft}
      onFocus={e => e.target.select()}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') cancel();
      }}
      onBlur={commit}
    />
  );
}
