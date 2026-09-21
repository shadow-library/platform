import { Switch } from '@shadow-library/ui';

import { looksLikeProseEdit } from '@/lib/prose-intent';

import styles from './ProseEditsToggle.module.css';

export interface ProseEditsToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  message: string;
  disabled?: boolean;
}

/** The per-turn permission for Forge to rewrite chapter text; off means a plan edit stays a plan edit. */
export function ProseEditsToggle({ checked, onCheckedChange, message, disabled }: ProseEditsToggleProps): React.JSX.Element {
  const suggest = !checked && looksLikeProseEdit(message);
  return (
    <div className={styles.toggle}>
      <Switch aria-label="Edit prose" checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
      <span className={styles.label}>Edit prose</span>
      {checked && <span className={styles.hint}>Forge may rewrite the chapter text itself.</span>}
      {suggest && <span className={styles.suggest}>This reads like a prose change — turn on Edit prose to let Forge rewrite the text.</span>}
    </div>
  );
}
